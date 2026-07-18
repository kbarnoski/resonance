// ─────────────────────────────────────────────────────────────────────────────
// 1904-current-eden · audio engine
//
// A modal drone that MODULATES on encounters (no pentatonic — banned this week).
// Each species owns a home mode; the lead (most-massive) species sets the drone.
// When encounter energy crosses thresholds the tonal centre shifts and the mode
// pivots to a related colour; a strong encounter bites with Hijaz (double-
// harmonic) bells. Under sustained single-species dominance the centre eases
// home and the texture thins. Overlap ~0 ⇒ a lone sustained drone (the "dead
// without a human" proof).
//
// Real Web Audio synthesis only (oscillators / gain / filters / convolver). All
// scheduling uses ctx.currentTime (the audio clock) and an integer frame count —
// never Date.now / performance.now — so the sound path is deterministic.
// ─────────────────────────────────────────────────────────────────────────────

import type { SimMetrics } from "./sim";

// semitone sets (relative to a root)
const MODES: Record<string, number[]> = {
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 11], // double-harmonic — the biting colour
};

// per-species home: root (midi) + mode name
const HOME = [
  { root: 48, mode: "phrygian" }, // species 0 · madder
  { root: 50, mode: "lydian" }, //   species 1 · saffron
  { root: 45, mode: "dorian" }, //   species 2 · indigo
];

// which mode an encounter pivots toward, keyed by the two colliding species
function pivotMode(lead: number, strong: boolean): string {
  if (strong) return "hijaz";
  // gentle pivots between related modes
  if (lead === 0) return "dorian";
  if (lead === 1) return "phrygian";
  return "lydian";
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export type AudioState = {
  modeName: string;
  root: number;
};

export class EdenAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private reverb: ConvolverNode;
  private wet: GainNode;

  // drone
  private droneGain: GainNode;
  private droneFilter: BiquadFilterNode;
  private oscs: OscillatorNode[] = [];
  private oscGains: GainNode[] = [];

  private rnd = mulberry32(0x1904a0d1);
  private frame = 0;

  // musical state (smoothed toward targets)
  private root = HOME[0].root;
  private targetRoot = HOME[0].root;
  private modeName = HOME[0].mode;
  private lastBellFrame = -100;

  state: AudioState = { modeName: HOME[0].mode, root: HOME[0].root };

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    // soft tanh limiter so nothing clips
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 1.4);
    }
    shaper.curve = curve;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.2);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    const dry = ctx.createGain();
    dry.gain.value = 0.8;

    // graph: sources → master → shaper → (dry + reverb→wet) → destination
    this.master.connect(shaper);
    shaper.connect(dry);
    shaper.connect(this.reverb);
    this.reverb.connect(this.wet);
    dry.connect(ctx.destination);
    this.wet.connect(ctx.destination);

    // drone chain
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 520;
    this.droneFilter.Q.value = 0.7;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.5;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.master);

    // three drone voices: sub sine, body sawtooth, fifth triangle
    const shapes: OscillatorType[] = ["sine", "sawtooth", "triangle"];
    const rel = [0, 12, 19]; // sub, root-octave, fifth
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = shapes[i];
      o.frequency.value = midiToFreq(this.root + rel[i]);
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.28, 0.2][i];
      o.connect(g);
      g.connect(this.droneFilter);
      o.start();
      this.oscs.push(o);
      this.oscGains.push(g);
    }

    // fade the bed in gently
    this.master.gain.setTargetAtTime(0.22, ctx.currentTime, 1.4);
    void ctx.resume();
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buf = ctx.createBuffer(2, len, rate);
    const r = mulberry32(0x1904eeee);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private ringBell(midi: number, gain: number, dur: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const amp = ctx.createGain();
    const f = midiToFreq(midi);
    carrier.frequency.value = f;
    carrier.type = "sine";
    mod.frequency.value = f * 2.01; // inharmonic shimmer
    mod.type = "sine";
    modGain.gain.value = f * 1.2;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    carrier.connect(amp);
    amp.connect(this.master);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  /** call whenever sim metrics refresh (~every 4th sim frame) */
  update(m: SimMetrics) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.frame++;

    const total = m.mass[0] + m.mass[1] + m.mass[2] + 1e-5;
    const leadShare = m.mass[m.lead] / total;
    const dominant = leadShare > 0.62; // one species clearly on top
    const enc = m.encounter;

    // ── decide mode + tonal centre ────────────────────────────────────────────
    const strong = enc > 0.05;
    const encountering = enc > 0.014;
    if (dominant && !encountering) {
      // ease home to the lead species' own mode / root
      this.modeName = HOME[m.lead].mode;
      this.targetRoot = HOME[m.lead].root;
    } else if (encountering) {
      this.modeName = pivotMode(m.lead, strong);
      // shift the centre by encounter energy (up a step, up a fourth on a bite)
      const shift = strong ? 5 : 2;
      this.targetRoot = HOME[m.lead].root + shift;
    }
    this.state = { modeName: this.modeName, root: this.targetRoot };

    // glide the root
    this.root += (this.targetRoot - this.root) * 0.06;
    const rel = [0, 12, 19];
    for (let i = 0; i < 3; i++) {
      this.oscs[i].frequency.setTargetAtTime(midiToFreq(this.root + rel[i]), now, 0.25);
    }

    // texture: brighter & louder with encounters, thin under dominance
    const openness = 380 + enc * 5200 + (dominant ? 0 : 260);
    this.droneFilter.frequency.setTargetAtTime(Math.min(openness, 5200), now, 0.4);
    const bodyLevel = dominant && !encountering ? 0.14 : 0.3;
    this.oscGains[1].gain.setTargetAtTime(bodyLevel, now, 0.6);
    this.oscGains[2].gain.setTargetAtTime(encountering ? 0.24 : 0.12, now, 0.6);

    // overall level: near-silent lone drone at zero overlap → richer with music
    const level = 0.14 + Math.min(enc * 2.6, 0.34);
    this.master.gain.setTargetAtTime(level, now, 0.5);

    // ── bells on encounters ───────────────────────────────────────────────────
    if (encountering) {
      // faster ringing when the encounter is stronger
      const interval = strong ? 5 : 11;
      if (this.frame - this.lastBellFrame >= interval) {
        this.lastBellFrame = this.frame;
        const scale = MODES[this.modeName];
        const deg = scale[Math.floor(this.rnd() * scale.length)];
        const octave = 12 * (1 + Math.floor(this.rnd() * 2));
        const bellMidi = Math.round(this.root) + deg + octave;
        const g = strong ? 0.16 : 0.09;
        const dur = strong ? 2.4 : 1.6;
        this.ringBell(bellMidi, g, dur);
        // on a strong (Hijaz) encounter, ring the biting augmented-2nd colour tone
        if (strong) {
          this.ringBell(Math.round(this.root) + 3 + octave, 0.1, 2.0);
        }
      }
    }
  }

  get currentTime() {
    return this.ctx.currentTime;
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  dispose() {
    try {
      for (const o of this.oscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
        o.disconnect();
      }
      this.master.disconnect();
    } catch {
      /* teardown best-effort */
    }
    void this.ctx.close();
  }
}
