// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the HRTF spatial "overtone cathedral" voice engine.
//
// Signal graph:
//   each Voice: oscillators (fundamental + quiet harmonics) → voiceGain
//               → PannerNode { panningModel:"HRTF", distanceModel:"inverse" }
//                 → master (dry) + reverbSend (wet)
//   master + reverbReturn → masterGain (~0.6) → brick-wall compressor → dest
//
// A quiet always-on JI root drone (D2) anchors the field.
// Voices are placed at golden-angle azimuths on a ring and slowly orbit.
// Cap ~9 voices; the 10th evicts the oldest with a fade.
//
// All values are tuned to stay clip-free with drone + 9 voices via the
// brick-wall DynamicsCompressor.
// ─────────────────────────────────────────────────────────────────────────────

export const D2_ROOT_HZ = 73.42; // D2 just-intonation root.

// Just-intonation ratios over the root (octave + the unison ↔ octave endpoints).
export const JI_RATIOS = [1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];

// Scale-degree → note name relative to a D root (for legible labels).
// Indices align with JI_RATIOS; the 2/1 octave re-uses "D".
export const DEGREE_NAMES = ["D", "E", "F", "F♯", "G", "A", "B", "C♯", "D"];

// A perceptual color per scale degree (used by the radar). Indices align.
export const DEGREE_COLORS = [
  "#a78bfa", // D   violet
  "#67e8f9", // E   cyan
  "#5eead4", // F   teal
  "#fcd34d", // F♯  amber
  "#86efac", // G   green
  "#f9a8d4", // A   pink
  "#93c5fd", // B   blue
  "#fdba74", // C♯  orange
  "#c4b5fd", // D'  light violet
];

const GOLDEN_ANGLE = (Math.PI * (3 - Math.sqrt(5))); // ~137.5° in radians.
const RING_RADIUS = 2.4; // gentle distance from listener.
const ORBIT_SPEED = 0.06; // radians / second.
const MAX_VOICES = 9;
const ATTACK_S = 0.8;
const RELEASE_S = 1.4;
const VOICE_PEAK_GAIN = 0.16; // per-voice fundamental gain (harmonics quieter).

export interface SnappedNote {
  hz: number; // the snapped just-intonation frequency (in the sung octave).
  ratioIndex: number; // index into JI_RATIOS / DEGREE_NAMES.
  octave: number; // octave number for labeling, e.g. 3 in "F♯3".
  name: string; // e.g. "F♯3".
}

// Snap an arbitrary frequency to the nearest octave-folded JI degree of D2.
export function snapToJI(hz: number): SnappedNote {
  if (hz <= 0 || !isFinite(hz)) {
    return { hz: D2_ROOT_HZ, ratioIndex: 0, octave: 2, name: "D2" };
  }
  // Octaves above the root (real-valued).
  const octavesAbove = Math.log2(hz / D2_ROOT_HZ);
  const baseOctave = Math.floor(octavesAbove);
  const within = octavesAbove - baseOctave; // 0..1 position within the octave.

  // Each JI ratio expressed as octave-fraction (log2) within [0,1).
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < JI_RATIOS.length; i++) {
    const frac = Math.log2(JI_RATIOS[i]) % 1; // 2/1 → 0, treated as octave below
    const candidate = ((frac % 1) + 1) % 1;
    let dist = Math.abs(candidate - within);
    dist = Math.min(dist, 1 - dist); // wrap-around distance
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }

  // Build the actual snapped frequency. Choose the octave placement (one of
  // baseOctave / baseOctave±1) that lands closest to the originally sung pitch,
  // so notes near an octave boundary don't jump a full octave away.
  const ratio = JI_RATIOS[best];
  const ratioFrac = ((Math.log2(ratio) % 1) + 1) % 1;
  let snappedOctaves = baseOctave + ratioFrac;
  for (const off of [-1, 1]) {
    const cand = baseOctave + off + ratioFrac;
    if (Math.abs(cand - octavesAbove) < Math.abs(snappedOctaves - octavesAbove)) {
      snappedOctaves = cand;
    }
  }
  const snappedHz = D2_ROOT_HZ * Math.pow(2, snappedOctaves);

  // Octave number for the label: MIDI-style derived from snappedHz.
  const midi = 69 + 12 * Math.log2(snappedHz / 440);
  const octaveNumber = Math.floor(midi / 12) - 1;
  const name = `${DEGREE_NAMES[best]}${octaveNumber}`;

  return { hz: snappedHz, ratioIndex: best, octave: octaveNumber, name };
}

// ── voice + engine types ─────────────────────────────────────────────────────

interface Voice {
  id: number;
  oscs: OscillatorNode[];
  gain: GainNode;
  panner: PannerNode;
  azimuth: number; // current orbit angle (radians).
  radius: number;
  ratioIndex: number;
  name: string;
  bornAt: number;
  releasing: boolean;
}

export interface VoiceSnapshot {
  id: number;
  azimuth: number;
  radius: number;
  ratioIndex: number;
  name: string;
}

// Build a short decaying-noise impulse response for a cathedral-ish reverb.
function makeImpulseResponse(ctx: AudioContext, seconds = 2.6, decay = 3.0): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
}

export class CathedralEngine {
  readonly ctx: AudioContext;
  private masterGain: GainNode;
  private compressor: DynamicsCompressorNode;
  private reverbSend: GainNode;
  private convolver: ConvolverNode;
  private reverbReturn: GainNode;
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private voices: Voice[] = [];
  private goldenStep = 0; // increments per committed voice.
  private nextId = 1;
  private lastTime: number;

  constructor() {
    type AudioCtor = typeof AudioContext;
    const Ctor: AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
    this.ctx = new Ctor();
    this.lastTime = this.ctx.currentTime;

    // Listener at origin facing -z (Web Audio default).
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = 0;
      L.positionY.value = 0;
      L.positionZ.value = 0;
      L.forwardX.value = 0;
      L.forwardY.value = 0;
      L.forwardZ.value = -1;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    }

    // Master → brick-wall compressor → destination.
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -6;
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 20;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.compressor.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6;
    this.masterGain.connect(this.compressor);

    // Reverb send → convolver → return → master.
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = makeImpulseResponse(this.ctx);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.5;
    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.45;
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.reverbReturn);
    this.reverbReturn.connect(this.masterGain);

    // Always-on quiet JI root drone (D2 fundamental + octave + fifth).
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.connect(this.masterGain);
    this.droneGain.connect(this.reverbSend);
    const droneRatios = [1, 2, 3 / 2];
    const droneLevels = [0.09, 0.04, 0.03];
    droneRatios.forEach((r, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = D2_ROOT_HZ * r;
      const g = this.ctx.createGain();
      g.gain.value = droneLevels[i];
      osc.connect(g);
      g.connect(this.droneGain);
      osc.start();
      this.droneOscs.push(osc);
    });
  }

  // Resume must be called from a user gesture (iOS gesture gating).
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
    this.droneGain.gain.linearRampToValueAtTime(0.55, now + 2.0);
    this.lastTime = now;
  }

  // Commit a snapped note as a new sustained spatial voice.
  commit(snapped: SnappedNote): void {
    const now = this.ctx.currentTime;

    // Evict oldest if at cap.
    if (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift();
      if (oldest) this.fadeAndRemove(oldest);
    }

    const azimuth = (this.goldenStep * GOLDEN_ANGLE) % (Math.PI * 2);
    this.goldenStep++;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.rolloffFactor = 0.6;
    panner.coneInnerAngle = 360;

    const radius = RING_RADIUS;
    const x = Math.sin(azimuth) * radius;
    const z = -Math.cos(azimuth) * radius;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = 0;
      panner.positionZ.value = z;
    }

    gain.connect(panner);
    panner.connect(this.masterGain);
    panner.connect(this.reverbSend);

    // Additive voice: fundamental + a few quiet harmonics.
    const harmonics: Array<{ mul: number; level: number; type: OscillatorType }> = [
      { mul: 1, level: 1.0, type: "sine" },
      { mul: 2, level: 0.28, type: "sine" },
      { mul: 3, level: 0.16, type: "sine" },
      { mul: 4, level: 0.08, type: "sine" },
    ];
    const oscs: OscillatorNode[] = [];
    harmonics.forEach((h) => {
      const osc = this.ctx.createOscillator();
      osc.type = h.type;
      osc.frequency.value = snapped.hz * h.mul;
      const hg = this.ctx.createGain();
      hg.gain.value = h.level * VOICE_PEAK_GAIN;
      osc.connect(hg);
      hg.connect(gain);
      osc.start();
      oscs.push(osc);
    });

    // Soft attack.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + ATTACK_S);

    this.voices.push({
      id: this.nextId++,
      oscs,
      gain,
      panner,
      azimuth,
      radius,
      ratioIndex: snapped.ratioIndex,
      name: snapped.name,
      bornAt: now,
      releasing: false,
    });
  }

  private fadeAndRemove(v: Voice): void {
    const now = this.ctx.currentTime;
    v.releasing = true;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + RELEASE_S);
    window.setTimeout(() => {
      v.oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
        o.disconnect();
      });
      v.gain.disconnect();
      v.panner.disconnect();
    }, (RELEASE_S + 0.1) * 1000);
  }

  // Advance orbits — call once per animation frame.
  tick(): void {
    const now = this.ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    for (const v of this.voices) {
      if (v.releasing) continue;
      v.azimuth = (v.azimuth + ORBIT_SPEED * dt) % (Math.PI * 2);
      const x = Math.sin(v.azimuth) * v.radius;
      const z = -Math.cos(v.azimuth) * v.radius;
      if (v.panner.positionX) {
        v.panner.positionX.setTargetAtTime(x, now, 0.05);
        v.panner.positionZ.setTargetAtTime(z, now, 0.05);
      }
    }
  }

  // Snapshot of live voices for the radar / labels.
  snapshot(): VoiceSnapshot[] {
    return this.voices
      .filter((v) => !v.releasing)
      .map((v) => ({
        id: v.id,
        azimuth: v.azimuth,
        radius: v.radius,
        ratioIndex: v.ratioIndex,
        name: v.name,
      }));
  }

  // Ordered, de-duplicated chord-degree names built so far (by pitch class).
  chordNames(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of this.voices) {
      if (v.releasing) continue;
      const pc = v.name.replace(/[0-9]/g, "");
      if (!seen.has(pc)) {
        seen.add(pc);
        out.push(pc);
      }
    }
    return out;
  }

  async dispose(): Promise<void> {
    this.droneOscs.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* noop */
      }
      o.disconnect();
    });
    this.voices.forEach((v) => {
      v.oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* noop */
        }
        o.disconnect();
      });
      v.gain.disconnect();
      v.panner.disconnect();
    });
    this.voices = [];
    try {
      this.masterGain.disconnect();
      this.compressor.disconnect();
      this.convolver.disconnect();
      this.reverbReturn.disconnect();
      this.reverbSend.disconnect();
      this.droneGain.disconnect();
    } catch {
      /* noop */
    }
    if (this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        /* noop */
      }
    }
  }
}
