// ════════════════════════════════════════════════════════════════════════════
// audio.ts — the cross-modal drone for 3448-aura.
//
// The SHAPE of you steers a soft evolving drone (Web Audio API):
//   • area        → overall level + how many harmonic voices are audible
//                   (fuller body → fuller sound), floored so it is never silent.
//   • complexity  → low-pass filter brightness (ragged/reaching opens the tone;
//                   compact/still darkens it).
//   • reach       → the fundamental region, a CONTINUOUS glide — never snapped
//                   to a scale or chord, pitch bends smoothly.
//
// The voices are integer harmonics of one gliding fundamental: that is timbre,
// not melody, so the fundamental stays free to bend anywhere.
// ════════════════════════════════════════════════════════════════════════════

import type { Descriptors } from "./silhouette";

// Harmonic partial multipliers, with a per-voice loudness weight and the area
// threshold at which each voice fades in (fuller body → more partials sing).
const PARTIALS = [
  { mult: 1, weight: 1.0, on: 0.0 },
  { mult: 2, weight: 0.5, on: 0.06 },
  { mult: 3, weight: 0.34, on: 0.14 },
  { mult: 4, weight: 0.24, on: 0.24 },
  { mult: 5, weight: 0.18, on: 0.36 },
  { mult: 6, weight: 0.14, on: 0.5 },
];

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  mult: number;
  weight: number;
  on: number;
}

export class AuraAudio {
  readonly available: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private voices: Voice[] = [];
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private muted = false;
  private started = false;

  constructor() {
    const Ctor =
      typeof window !== "undefined"
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (Ctor) {
      try {
        // NOTE: constructed here, but this whole class is only instantiated from
        // the Start button handler — i.e. inside a user gesture.
        this.ctx = new Ctor();
        this.available = true;
      } catch {
        this.available = false;
      }
    } else {
      this.available = false;
    }
  }

  /** Build the graph and begin the drone at its quiet floor. */
  start(reduceMotion: boolean): void {
    const ctx = this.ctx;
    if (!ctx || this.started) return;
    this.started = true;
    const t = ctx.currentTime;

    // A soft limiter so stacking six voices can never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.3;
    comp.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(comp);
    this.master = master;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    filter.Q.value = 0.7;
    filter.connect(master);
    this.filter = filter;

    // A very slow detune LFO for gentle chorus movement (frozen if reduced motion).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = reduceMotion ? 0 : 6; // cents
    lfo.connect(lfoGain);
    lfo.start();
    this.lfo = lfo;
    this.lfoGain = lfoGain;

    const base = 90;
    PARTIALS.forEach((p, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? "sine" : "triangle";
      osc.frequency.value = base * p.mult;
      osc.detune.value = (i % 2 === 0 ? 1 : -1) * (3 + i * 2); // static spread
      lfoGain.connect(osc.detune);
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      this.voices.push({ osc, gain, mult: p.mult, weight: p.weight, on: p.on });
    });

    // Ease up from silence to the floor over ~1.2s.
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(0.06, t + 1.2);
  }

  /** Push the current shape descriptors into the drone. Called every frame. */
  update(d: Descriptors, reduceMotion: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.started) return;
    const t = ctx.currentTime;

    // A silhouette fills only a modest fraction of the frame, so map area
    // through a perceptual gain into the 0..1 the voices/level expect.
    const body = Math.min(1, d.area * 3.4);

    // Fundamental glides with reach — continuous, never quantized. 70..185 Hz.
    const base = 70 + d.reach * 115;
    for (const v of this.voices) {
      v.osc.frequency.setTargetAtTime(base * v.mult, t, 0.28);
      // Voice fades in past its area threshold (fuller body → more partials).
      const lit = smoothstep(v.on - 0.03, v.on + 0.14, body);
      const target = lit * v.weight * 0.32;
      v.gain.gain.setTargetAtTime(Math.max(target, 0.0002), t, 0.22);
    }

    // Complexity opens the filter — compact/dark 320 Hz .. ragged/bright 4600 Hz.
    if (this.filter) {
      const cutoff = 320 + d.complexity * 4280;
      this.filter.frequency.setTargetAtTime(cutoff, t, 0.16);
    }

    // Area sets overall level, floored so the drone is never fully silent.
    if (this.master && !this.muted) {
      const level = 0.05 + body * 0.42;
      this.master.gain.setTargetAtTime(level, t, 0.2);
    }

    if (this.lfoGain) {
      this.lfoGain.gain.setTargetAtTime(reduceMotion ? 0 : 6, t, 0.5);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    master.gain.setTargetAtTime(muted ? 0.0001 : 0.12, ctx.currentTime, 0.15);
  }

  async dispose(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    if (!ctx) return;
    try {
      for (const v of this.voices) {
        try {
          v.osc.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        this.lfo?.stop();
      } catch {
        /* already stopped */
      }
      this.voices = [];
      if (ctx.state !== "closed") await ctx.close();
    } catch {
      /* ignore teardown races */
    }
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = a === b ? (x < a ? 0 : 1) : (x - a) / (b - a);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}
