// ─────────────────────────────────────────────────────────────────────────────
// EmberAudio — the convection layer sings its own overturning.
//
//   • A warm low CONVECTIVE DRONE (two deliberately inharmonic oscillators +
//     a brown-noise "boil" bed) whose brightness and level track total
//     convective vigor (kinetic energy). Never silent once started.
//   • Per-cell OVERTURN CHIMES: when a plume tip breaks through, a short
//     struck-metal tone rings on inharmonic free-bar partials (1 : 2.76 : 5.40 :
//     8.93, octave-stretched, per-hit detuned). Voice-capped, panned by cell x.
//
// Deliberately NOT 12-TET, NOT pentatonic, NOT pure just-intonation. The whole
// mix is routed through the shared ear-safety master bus.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// Free-bar / struck-metal inharmonic partial ratios (non-integer on purpose).
const PARTIALS = [1.0, 2.76, 5.404, 8.933];
const DECAYS = [1.9, 1.3, 0.85, 0.55]; // per-partial decay time constants (s)
const WEIGHTS = [1.0, 0.55, 0.32, 0.18];
const MAX_VOICES = 16;

export class EmberAudio {
  private ctx: AudioContext;
  private master: SafeMaster;
  private rng: () => number;

  // Drone
  private droneA: OscillatorNode;
  private droneB: OscillatorNode;
  private droneLp: BiquadFilterNode;
  private droneGain: GainNode;
  // Boil bed
  private boilSrc: AudioBufferSourceNode;
  private boilLp: BiquadFilterNode;
  private boilGain: GainNode;

  private voices = 0;
  private started = false;

  constructor(ctx: AudioContext, rng: () => number) {
    this.ctx = ctx;
    this.rng = rng;
    this.master = createSafeMaster(ctx, { gain: 0.85 });

    // Convective drone: two low oscillators an inharmonic ratio apart.
    this.droneA = ctx.createOscillator();
    this.droneA.type = "sawtooth";
    this.droneA.frequency.value = 46;
    this.droneB = ctx.createOscillator();
    this.droneB.type = "sine";
    this.droneB.frequency.value = 69.24; // ratio ≈ 1.505 — off the just fifth
    this.droneLp = ctx.createBiquadFilter();
    this.droneLp.type = "lowpass";
    this.droneLp.frequency.value = 220;
    this.droneLp.Q.value = 0.6;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneA.connect(this.droneLp);
    this.droneB.connect(this.droneLp);
    this.droneLp.connect(this.droneGain);
    this.droneGain.connect(this.master.input);

    // Boil bed: looping brown noise through a lowpass — the sound of a rolling
    // simmer, level and cutoff tracking vigor.
    const sr = ctx.sampleRate;
    const len = sr * 2;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = rng() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.4;
    }
    this.boilSrc = ctx.createBufferSource();
    this.boilSrc.buffer = buf;
    this.boilSrc.loop = true;
    this.boilLp = ctx.createBiquadFilter();
    this.boilLp.type = "lowpass";
    this.boilLp.frequency.value = 320;
    this.boilGain = ctx.createGain();
    this.boilGain.gain.value = 0;
    this.boilSrc.connect(this.boilLp);
    this.boilLp.connect(this.boilGain);
    this.boilGain.connect(this.master.input);
  }

  start() {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.droneA.start(t);
    this.droneB.start(t);
    this.boilSrc.start(t);
    this.droneGain.gain.setTargetAtTime(0.12, t, 0.6);
    this.boilGain.gain.setTargetAtTime(0.05, t, 0.6);
  }

  /** vigor 0..1 (mean kinetic energy). Brighter + louder when the layer boils. */
  setVigor(vigor: number) {
    if (!this.started) return;
    const v = Math.min(1, Math.max(0, vigor));
    const t = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(0.1 + 0.22 * v, t, 0.3);
    this.droneLp.frequency.setTargetAtTime(180 + 520 * v, t, 0.3);
    this.boilGain.gain.setTargetAtTime(0.04 + 0.14 * v, t, 0.25);
    this.boilLp.frequency.setTargetAtTime(260 + 900 * v, t, 0.25);
  }

  /** Ring a struck-metal overturn chime. pan −1..1 by cell x; intensity 0..1. */
  strike(pan: number, intensity: number) {
    if (!this.started || this.voices >= MAX_VOICES) return;
    const t = this.ctx.currentTime;
    // Seeded warm base frequency + per-hit detune; octave-stretch the partials.
    const base = 150 + this.rng() * 210;
    const stretch = 1.0 + 0.012 * this.rng();
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    const bus = this.ctx.createGain();
    bus.gain.value = 1;
    panner.connect(this.master.input);
    bus.connect(panner);

    const nyq = this.ctx.sampleRate * 0.5;
    const oscs: OscillatorNode[] = [];
    this.voices += 1;
    let longest = 0;
    for (let i = 0; i < PARTIALS.length; i++) {
      const freq = base * PARTIALS[i] * Math.pow(stretch, i) * (1 + (this.rng() - 0.5) * 0.006);
      if (freq > nyq * 0.9) continue;
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      const peak = WEIGHTS[i] * 0.16 * (0.4 + 0.6 * intensity);
      const dec = DECAYS[i];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      osc.connect(g);
      g.connect(bus);
      osc.start(t);
      osc.stop(t + dec + 0.05);
      oscs.push(osc);
      longest = Math.max(longest, dec);
    }
    // Release the voice slot when the longest partial has died.
    window.setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, (longest + 0.1) * 1000);
  }

  async stop() {
    const t = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(0, t, 0.2);
    this.boilGain.gain.setTargetAtTime(0, t, 0.2);
    await new Promise((res) => setTimeout(res, 320));
    for (const o of [this.droneA, this.droneB]) {
      try { o.stop(); } catch { /* already stopped */ }
    }
    try { this.boilSrc.stop(); } catch { /* already stopped */ }
    this.master.disconnect();
  }
}
