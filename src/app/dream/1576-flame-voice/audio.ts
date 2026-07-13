// audio.ts — the drone the flame sings. This is the OTHER half of the weld:
// each of the 8 sonified variations owns one partial of a Just-Intonation
// chord, and its loudness IS that variation's live dominance in the picture.
// When a variation swells on screen, its partial swells in your ears.
//
// Signal path: 8 partial oscillators (+ one sub) -> per-voice gains -> a shared
// DynamicsCompressor -> master gain (<= 0.18) -> destination. The mic analyser
// is never connected here, so the loop cannot feed back.

// Just-Intonation ratios over the fundamental, one per sonified variation
// (linear, spherical, swirl, horseshoe, handkerchief, disc, spiral, julia):
//   1  9/8  5/4  4/3  3/2  5/3  15/8  2  — a stacked JI major scale to octave.
const RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
const BASE_HZ = 110; // A2

export class Drone {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly voices: OscillatorNode[] = [];
  private readonly gains: GainNode[] = [];
  private sub: OscillatorNode | null = null;
  private subGain: GainNode | null = null;
  private started = false;

  constructor(ctx: AudioContext, masterLevel = 0.16) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = Math.min(0.18, masterLevel);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -24;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.28;

    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // 8 partials.
    for (let i = 0; i < RATIOS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : i % 2 === 0 ? "triangle" : "sine";
      osc.frequency.value = BASE_HZ * RATIOS[i];
      // A hair of detune per partial for a living, non-sterile chord.
      osc.detune.value = (i - 4) * 1.5;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(this.comp);
      this.voices.push(osc);
      this.gains.push(g);
    }

    // A steady sub an octave below the fundamental for warmth.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = BASE_HZ * 0.5;
    const sg = ctx.createGain();
    sg.gain.value = 0.0001;
    sub.connect(sg);
    sg.connect(this.comp);
    this.sub = sub;
    this.subGain = sg;
  }

  start() {
    if (this.started) return;
    const t = this.ctx.currentTime;
    for (const o of this.voices) o.start(t);
    this.sub?.start(t);
    // Gentle fade-in so nothing clicks.
    this.subGain?.gain.setTargetAtTime(0.05, t, 0.6);
    this.started = true;
  }

  /** Drive the partial amplitudes from the flame's live feature vector (0..1
   *  per sonified variation). Smoothed so the chord glides, never jumps. */
  setPartials(features: Float32Array) {
    const t = this.ctx.currentTime;
    const tau = 0.16; // one-pole smoothing on every partial
    const n = Math.min(features.length, this.gains.length);
    for (let i = 0; i < n; i++) {
      const amp = 0.006 + Math.max(0, Math.min(1, features[i])) * 0.085;
      this.gains[i].gain.setTargetAtTime(amp, t, tau);
    }
  }

  setMaster(level: number) {
    this.master.gain.setTargetAtTime(Math.min(0.18, level), this.ctx.currentTime, 0.2);
  }

  stop() {
    const t = this.ctx.currentTime;
    for (const g of this.gains) {
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(0.0001, t);
      } catch {
        /* noop */
      }
    }
    for (const o of this.voices) {
      try {
        o.stop(t);
        o.disconnect();
      } catch {
        /* already stopped */
      }
    }
    try {
      this.sub?.stop(t);
      this.sub?.disconnect();
    } catch {
      /* already stopped */
    }
    try {
      this.subGain?.disconnect();
      this.comp.disconnect();
      this.master.disconnect();
    } catch {
      /* noop */
    }
    this.voices.length = 0;
    this.gains.length = 0;
    this.sub = null;
    this.subGain = null;
  }
}
