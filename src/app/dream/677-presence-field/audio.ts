// ── Presence Field · spatial ensemble engine ────────────────────────────────
// The CORE IDEA lives here: each tracked joint is a sustained voice routed
// through its OWN HRTF PannerNode. Moving the body moves that voice's position
// in 3D around the listener — spatialization IS the instrument.
//
// Harmony is a slow drifting modal chord in D Dorian (a few diatonic chords
// with homeward gravity, changing every ~8–14s). NO pentatonic scale-snap.
// Ear-safe chain: per-voice gain → panner → wet/dry → master gain (≤0.4) →
// compressor → destination, with a soft master fade-in.

type AC = AudioContext;

// D Dorian over a low D root. Frequencies in Hz for the reference octave.
// Degrees: D E F G A B C  (Dorian = natural minor with a raised 6th).
const D_DORIAN: Record<string, number> = {
  D: 146.83,
  E: 164.81,
  F: 174.61,
  G: 196.0,
  A: 220.0,
  B: 246.94,
  C: 261.63,
};

// A small chord cycle with homeward gravity (Dm is home). Each chord is a set
// of scale-degree names; the engine assigns degrees to voices by register.
const CHORDS: string[][] = [
  ["D", "F", "A", "C"], // Dm7  (home)
  ["G", "B", "D", "F"], // G7   (subdominant lift, the Dorian colour)
  ["A", "C", "E", "G"], // Am7  (gentle tension)
  ["F", "A", "C", "E"], // Fmaj7 (relative warmth)
  ["D", "F", "A", "C"], // Dm7  (return home)
];

function noteToFreq(name: string, octaveShift: number): number {
  return D_DORIAN[name] * Math.pow(2, octaveShift);
}

// The seven voices of the ensemble. Each maps to a body region. `octave` sets
// the register the voice prefers; `role` is just documentation.
export interface VoiceSpec {
  id: string;
  region:
    | "head"
    | "leftWrist"
    | "rightWrist"
    | "leftElbow"
    | "rightElbow"
    | "torso"
    | "hips";
  octave: number; // octave shift applied to its chord tone
  chordIndex: number; // which tone of the 4-note chord it sings
}

export const VOICES: VoiceSpec[] = [
  { id: "head", region: "head", octave: 1, chordIndex: 2 }, // centred lead
  { id: "lw", region: "leftWrist", octave: 1, chordIndex: 3 },
  { id: "rw", region: "rightWrist", octave: 1, chordIndex: 1 },
  { id: "le", region: "leftElbow", octave: 0, chordIndex: 2 },
  { id: "re", region: "rightElbow", octave: 0, chordIndex: 0 },
  { id: "torso", region: "torso", octave: 0, chordIndex: 1 }, // mid anchor
  { id: "hips", region: "hips", octave: -1, chordIndex: 0 }, // low anchor
];

interface Voice {
  spec: VoiceSpec;
  osc: OscillatorNode; // primary
  osc2: OscillatorNode; // detuned partner for chorus warmth
  vGain: GainNode; // voice envelope/level
  panner: PannerNode; // HRTF spatializer — the instrument
  wet: GainNode; // send into reverb
  targetFreq: number;
  curFreq: number;
}

// A voice position request in normalized room coordinates.
// x,y,z each in roughly [-1.5, 1.5]; the engine scales to metres.
export interface VoicePos {
  x: number;
  y: number;
  z: number;
  level: number; // 0..1 desired loudness for this voice this frame
}

export type PositionMap = Partial<Record<VoiceSpec["region"], VoicePos>>;

export class PresenceEngine {
  private ctx: AC | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private voices: Voice[] = [];
  private chordPos = 0;
  private nextChordAt = 0;
  private started = false;

  get audioCtx(): AC | null {
    return this.ctx;
  }

  get currentChord(): string[] {
    return CHORDS[this.chordPos];
  }

  async start(): Promise<void> {
    if (this.started) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    // Master chain: master gain (fades in) → compressor → destination.
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-18, ctx.currentTime);
    comp.ratio.setValueAtTime(3, ctx.currentTime);
    comp.attack.setValueAtTime(0.02, ctx.currentTime);
    comp.release.setValueAtTime(0.3, ctx.currentTime);
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;
    this.comp = comp;

    // Listener at origin, facing -Z (looking into the room).
    const lis = ctx.listener;
    if (lis.positionX) {
      lis.positionX.setValueAtTime(0, ctx.currentTime);
      lis.positionY.setValueAtTime(0, ctx.currentTime);
      lis.positionZ.setValueAtTime(0, ctx.currentTime);
      lis.forwardX.setValueAtTime(0, ctx.currentTime);
      lis.forwardY.setValueAtTime(0, ctx.currentTime);
      lis.forwardZ.setValueAtTime(-1, ctx.currentTime);
      lis.upX.setValueAtTime(0, ctx.currentTime);
      lis.upY.setValueAtTime(1, ctx.currentTime);
      lis.upZ.setValueAtTime(0, ctx.currentTime);
    } else {
      // Deprecated fallback for older Safari.
      const l = lis as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(
          fx: number,
          fy: number,
          fz: number,
          ux: number,
          uy: number,
          uz: number,
        ): void;
      };
      l.setPosition(0, 0, 0);
      l.setOrientation(0, 0, -1, 0, 1, 0);
    }

    // Shared reverb — opens up as the arms spread (set via setSpread()).
    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(ctx, 3.2, 2.6);
    const reverbGain = ctx.createGain();
    reverbGain.gain.setValueAtTime(0.25, ctx.currentTime);
    reverb.connect(reverbGain);
    reverbGain.connect(master);
    this.reverb = reverb;
    this.reverbGain = reverbGain;

    // Build the voices.
    for (const spec of VOICES) {
      this.voices.push(this.makeVoice(ctx, spec, master, reverb));
    }

    // Schedule first chord + soft master fade-in (~0.6s, eased a touch longer).
    this.chordPos = 0;
    this.nextChordAt = ctx.currentTime + 11;
    this.applyChord(0.0);
    master.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 0.7);

    this.started = true;
  }

  private makeVoice(
    ctx: AC,
    spec: VoiceSpec,
    master: GainNode,
    reverb: ConvolverNode,
  ): Voice {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = "sine";
    osc2.type = "triangle";
    osc2.detune.setValueAtTime(7, ctx.currentTime);

    const vGain = ctx.createGain();
    vGain.gain.setValueAtTime(0.0001, ctx.currentTime);

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 12;
    panner.rolloffFactor = 0.9;

    const wet = ctx.createGain();
    wet.gain.setValueAtTime(0.5, ctx.currentTime);

    osc.connect(vGain);
    osc2.connect(vGain);
    vGain.connect(panner);
    panner.connect(master); // dry
    panner.connect(wet);
    wet.connect(reverb); // wet send

    const f = noteToFreq(CHORDS[0][spec.chordIndex], spec.octave);
    osc.frequency.setValueAtTime(f, ctx.currentTime);
    osc2.frequency.setValueAtTime(f, ctx.currentTime);
    osc.start();
    osc2.start();

    return {
      spec,
      osc,
      osc2,
      vGain,
      panner,
      wet,
      targetFreq: f,
      curFreq: f,
    };
  }

  private makeImpulse(ctx: AC, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // Re-tune every voice to the current chord. `glide` seconds for the pitch ramp.
  private applyChord(glide: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const chord = CHORDS[this.chordPos];
    for (const v of this.voices) {
      const f = noteToFreq(chord[v.spec.chordIndex], v.spec.octave);
      v.targetFreq = f;
      const t = ctx.currentTime;
      v.osc.frequency.cancelScheduledValues(t);
      v.osc2.frequency.cancelScheduledValues(t);
      v.osc.frequency.setValueAtTime(v.curFreq, t);
      v.osc2.frequency.setValueAtTime(v.curFreq, t);
      v.osc.frequency.linearRampToValueAtTime(f, t + glide);
      v.osc2.frequency.linearRampToValueAtTime(f, t + glide);
      v.curFreq = f;
    }
  }

  // Called once per animation frame from the page.
  // `positions` is the per-region target position+level map.
  // `spread` 0..1 widens reverb; `brightness` 0..1 lifts overall level.
  update(
    positions: PositionMap,
    spread: number,
    brightness: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    // Drifting chord progression (every ~8–14s, here ~11s) with a long glide.
    if (t >= this.nextChordAt) {
      this.chordPos = (this.chordPos + 1) % CHORDS.length;
      this.applyChord(2.2); // slow, meditative voice-leading
      this.nextChordAt = t + 9 + Math.random() * 4;
    }

    // Reverb opens with arm spread.
    if (this.reverbGain) {
      const target = 0.18 + spread * 0.4;
      this.reverbGain.gain.setTargetAtTime(target, t, 0.4);
    }

    const baseLevel = 0.18 + brightness * 0.14;

    for (const v of this.voices) {
      const p = positions[v.spec.region];
      // Smoothly move the panner toward the body region's 3D position.
      if (p) {
        const sx = p.x * 4.0; // metres
        const sy = p.y * 2.4;
        const sz = -1.4 - (1 - p.z) * 3.5; // push voices into the room (−Z)
        if (v.panner.positionX) {
          v.panner.positionX.setTargetAtTime(sx, t, 0.08);
          v.panner.positionY.setTargetAtTime(sy, t, 0.08);
          v.panner.positionZ.setTargetAtTime(sz, t, 0.08);
        } else {
          (
            v.panner as unknown as {
              setPosition(x: number, y: number, z: number): void;
            }
          ).setPosition(sx, sy, sz);
        }
        const lvl = baseLevel * (0.4 + p.level * 0.9);
        v.vGain.gain.setTargetAtTime(lvl, t, 0.12);
        const wetAmt = 0.35 + spread * 0.5;
        v.wet.gain.setTargetAtTime(wetAmt, t, 0.4);
      } else {
        // Region not present → ease this voice down to a soft floor.
        v.vGain.gain.setTargetAtTime(baseLevel * 0.25, t, 0.5);
      }
    }
  }

  // Stillness → ease the whole field toward a soft enveloping drone.
  settle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const v of this.voices) {
      v.vGain.gain.setTargetAtTime(0.07, t, 1.2);
      // Pull voices gently inward for an enveloping feel.
      if (v.panner.positionZ) {
        v.panner.positionZ.setTargetAtTime(-1.2, t, 1.5);
      }
    }
    if (this.reverbGain) this.reverbGain.gain.setTargetAtTime(0.4, t, 1.5);
  }

  async stop(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (this.master) {
        const t = ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      }
      for (const v of this.voices) {
        try {
          v.osc.stop(ctx.currentTime + 0.5);
          v.osc2.stop(ctx.currentTime + 0.5);
        } catch {
          /* already stopped */
        }
      }
      await new Promise((r) => setTimeout(r, 450));
      await ctx.close();
    } catch {
      /* best-effort teardown */
    } finally {
      this.ctx = null;
      this.master = null;
      this.voices = [];
      this.started = false;
    }
  }
}
