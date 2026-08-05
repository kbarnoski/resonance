// ════════════════════════════════════════════════════════════════════════════
// 6872 · GANZFLICKER — the entrainment drone
//
// A soft, warm, slowly-beating hypnagogic pad. A just-intonation stack over a
// low root feeds a lowpass whose cutoff — and whose upper-partial gains — open
// as `complexity` climbs, so sound and vision escalate together. A stereo detune
// on the root gives a gentle binaural-ish ~5 Hz beat (theta band, the drowsy
// sleep-threshold rhythm) without demanding headphones. Everything sits under a
// limiter and a low master so it is alive-but-quiet, never harsh.
//
// No React, no external libs. Deterministic: no Math.random / Date.now.
// ════════════════════════════════════════════════════════════════════════════

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  base: number; // gain at complexity 0
  peak: number; // gain at complexity 1
}

export class DroneEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private lp: BiquadFilterNode;
  private limiter: DynamicsCompressorNode;
  private voices: Voice[] = [];
  private lfo?: OscillatorNode;
  private lfoGain?: GainNode;
  private started = false;
  private stopped = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.005;
    this.limiter.release.value = 0.28;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 340;
    this.lp.Q.value = 0.6;
    this.lp.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const root = 55; // A1 — warm and low

    // just-intonation partials: unison, fifth, octave, and higher shimmer
    const spec: { ratio: number; pan: number; base: number; peak: number; type: OscillatorType }[] = [
      { ratio: 1, pan: -0.25, base: 0.22, peak: 0.24, type: "sine" },
      { ratio: 1, pan: 0.25, base: 0.22, peak: 0.24, type: "sine" }, // detuned twin → beat
      { ratio: 3 / 2, pan: -0.35, base: 0.1, peak: 0.14, type: "sine" },
      { ratio: 2, pan: 0.3, base: 0.07, peak: 0.12, type: "triangle" },
      { ratio: 5 / 2, pan: -0.4, base: 0.0, peak: 0.09, type: "triangle" },
      { ratio: 3, pan: 0.4, base: 0.0, peak: 0.07, type: "triangle" },
      { ratio: 4, pan: -0.2, base: 0.0, peak: 0.05, type: "sine" },
    ];

    for (let i = 0; i < spec.length; i++) {
      const s = spec[i];
      const osc = ctx.createOscillator();
      osc.type = s.type;
      let f = root * s.ratio;
      if (i === 1) f += 5.2; // binaural-ish beat against voice 0
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.value = s.base;
      const pan = ctx.createStereoPanner();
      pan.pan.value = s.pan;
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(this.lp);
      osc.start(now);
      this.voices.push({ osc, gain, base: s.base, peak: s.peak });
    }

    // slow amplitude LFO on the master for a breathing swell
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.07;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.02;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.master.gain);
    this.lfo.start(now);

    // ramp in
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.13, now + 3.0);
  }

  /** Couple the pad's brightness + upper-partial density to complexity 0..1. */
  setComplexity(c: number): void {
    if (!this.started || this.stopped) return;
    const cc = c < 0 ? 0 : c > 1 ? 1 : c;
    const now = this.ctx.currentTime;
    const cutoff = 340 + cc * cc * 3000; // 340 → ~3340 Hz
    this.lp.frequency.setTargetAtTime(cutoff, now, 0.3);
    for (const v of this.voices) {
      const g = v.base + (v.peak - v.base) * cc;
      v.gain.gain.setTargetAtTime(g, now, 0.3);
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.4);
    } catch {
      /* closing */
    }
    const t = now + 1.2;
    for (const v of this.voices) {
      try {
        v.osc.stop(t);
      } catch {
        /* already stopped */
      }
    }
    try {
      this.lfo?.stop(t);
    } catch {
      /* already stopped */
    }
  }
}
