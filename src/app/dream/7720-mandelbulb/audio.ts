// ─────────────────────────────────────────────────────────────────────────────
// 7720-mandelbulb · audio.ts — the drone that blooms with the fractal.
//
//   A just-intonation drone (root + fifth + major third + octave, lightly
//   detuned) through a lowpass, plus a shimmer stack an octave up gated by the
//   same energy scalar that grows the geometry. When the fractal blooms the
//   filter opens, the shimmer swells and a slow amplitude LFO deepens — so the
//   ear hears the visionary breakthrough the eye is falling into. It swells with the
//   virtual performer even when the mic is denied: no silent page.
//
//   No Math.random / Date.now / new Date — the tiny detune spread comes from a
//   seeded mulberry32(0x7720); all time comes from AudioContext.currentTime.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster } from "../_shared/visionary/safeMaster";

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

const ROOT = 65.41; // C2
// Just-intonation ratios: unison, octave, fifth (3/2), major third (5/4),
// twelfth (3/1). A consonant, glassy drone bed.
const DRONE_RATIOS = [1, 2, 1.5, 1.25, 3];
// Shimmer partials two octaves up — the jeweled top end.
const SHIMMER_RATIOS = [4, 5, 6, 8];

export class MandelbulbAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private lp: BiquadFilterNode;
  private droneGain: GainNode;
  private shimmerGain: GainNode;
  private tremGain: GainNode;
  private oscs: OscillatorNode[] = [];
  private lfo: OscillatorNode;
  private started = false;
  private stopped = false;
  private muted = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;
    const rnd = mulberry32(0x7720);

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    // Route through the shared ear-safety bus (shelf + lowpass + limiter)
    // instead of connecting to ctx.destination directly. The page's ctx.close()
    // on unmount tears the whole chain down.
    const safe = createSafeMaster(ctx);
    this.master.connect(safe.input);

    // Slow amplitude LFO (a swell, never a flutter — ~0.15 Hz).
    this.tremGain = ctx.createGain();
    this.tremGain.gain.value = 1.0;
    this.tremGain.connect(this.master);

    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.15;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.12;
    this.lfo.connect(lfoDepth);
    lfoDepth.connect(this.tremGain.gain);

    // Drone: lowpass so it opens with energy.
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 380;
    this.lp.Q.value = 0.7;
    this.lp.connect(this.tremGain);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.5;
    this.droneGain.connect(this.lp);

    for (const ratio of DRONE_RATIOS) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const detune = (rnd() - 0.5) * 8; // cents, deterministic
      osc.frequency.value = ROOT * ratio;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = ratio >= 2 ? 0.18 : 0.32; // tame the upper partials
      osc.connect(g);
      g.connect(this.droneGain);
      osc.start(now);
      this.oscs.push(osc);
    }

    // Shimmer: sines two octaves up, gated near-silent until energy rises.
    this.shimmerGain = ctx.createGain();
    this.shimmerGain.gain.value = 0.0001;
    this.shimmerGain.connect(this.tremGain);

    for (const ratio of SHIMMER_RATIOS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = ROOT * ratio;
      osc.detune.value = (rnd() - 0.5) * 10;
      const g = ctx.createGain();
      g.gain.value = 0.16 / ratio;
      osc.connect(g);
      g.connect(this.shimmerGain);
      osc.start(now);
      this.oscs.push(osc);
    }

    this.lfo.start(now);
  }

  /** Fade the bed in from silence once (call after the start gesture). */
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.28, now + 2.5);
  }

  /** Push the current energy scalar in. Smoothed so nothing zippers. */
  setEnergy(energy: number, bass: number, treble: number): void {
    if (this.stopped || !this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const e = Math.min(1, Math.max(0, energy));
    // Filter opens with bass-weighted energy — the drone "blooms".
    const cutoff = 320 + (0.6 * e + 0.4 * Math.min(1, bass)) * 2600;
    this.lp.frequency.setTargetAtTime(cutoff, now, 0.2);
    // Shimmer swells with treble+energy.
    const sh = this.muted ? 0.0001 : 0.0001 + (0.5 * e + 0.5 * Math.min(1, treble)) * 0.5;
    this.shimmerGain.gain.setTargetAtTime(sh, now, 0.25);
    // Master lifts a touch on loud passages for the breakthrough intensity.
    const m = this.muted ? 0.0001 : 0.2 + e * 0.22;
    this.master.gain.setTargetAtTime(m, now, 0.4);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.started || this.stopped) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(muted ? 0.0001 : 0.26, now, 0.2);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.1);
      for (const o of this.oscs) o.stop(now + 0.3);
      this.lfo.stop(now + 0.3);
    } catch {
      /* ignore */
    }
  }
}
