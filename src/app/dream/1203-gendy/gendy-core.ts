// Plain-TypeScript GENDYN engine.
//
// AudioWorklet code lives in `worklet-source.ts` as a string (it runs in a
// separate global scope and cannot import modules). This file is the
// SAME dynamic-stochastic-synthesis algorithm as a normal module, driven
// by a ScriptProcessorNode fallback when the worklet fails to load — so
// the piece always makes sound. The two copies are intentionally kept in
// lock-step; see worklet-source.ts for the annotated version.

export interface WaveSnapshot {
  amp: Float32Array;
  dur: Float32Array;
  level: number;
  chaos: number;
}

/** Elastic mirror barrier: reflect v back into [lo,hi]. */
function reflect(v: number, lo: number, hi: number): number {
  const span = hi - lo;
  if (span <= 1e-6) return lo;
  let x = v - lo;
  const p = 2 * span;
  x = x - Math.floor(x / p) * p;
  if (x > span) x = p - x;
  return lo + x;
}

class Rng {
  private s: number;
  private spare: number | null = null;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  gauss(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    while (u < 1e-9) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    const a = 6.283185307179586 * v;
    this.spare = r * Math.sin(a);
    return r * Math.cos(a);
  }
}

class Voice {
  readonly amp: Float32Array;
  readonly dur: Float32Array;
  private stepA = 0.01;
  private stepD = 0.01;
  private ampBound = 0.6;
  private durLo = 0.7;
  private durHi = 1.3;
  private pitchJit = 0;
  private seg = 0;
  private pos = 0;
  private scale = 1;
  private segLen = 1;

  constructor(
    private readonly sr: number,
    private readonly n: number,
    private freq: number,
    private readonly rng: Rng,
  ) {
    this.amp = new Float32Array(n);
    this.dur = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.amp[i] = Math.sin((6.283185307179586 * i) / n) * 0.4;
      this.dur[i] = 1;
    }
    this.startCycle(true);
  }

  setFreq(f: number): void {
    this.freq = f;
  }

  setChaos(
    stepA: number,
    stepD: number,
    ampBound: number,
    durLo: number,
    durHi: number,
    pitchJit: number,
  ): void {
    this.stepA = stepA;
    this.stepD = stepD;
    this.ampBound = ampBound;
    this.durLo = durLo;
    this.durHi = durHi;
    this.pitchJit = pitchJit;
  }

  private startCycle(seed: boolean): void {
    if (!seed) {
      for (let i = 0; i < this.n; i++) {
        this.amp[i] = reflect(
          this.amp[i] + this.rng.gauss() * this.stepA,
          -this.ampBound,
          this.ampBound,
        );
        this.dur[i] = reflect(
          this.dur[i] + this.rng.gauss() * this.stepD,
          this.durLo,
          this.durHi,
        );
      }
    }
    let sum = 0;
    for (let i = 0; i < this.n; i++) sum += this.dur[i];
    if (sum < 1e-6) sum = this.n;
    const jit = 1 + (this.rng.next() * 2 - 1) * this.pitchJit;
    const target = (this.sr / this.freq) * jit;
    this.scale = target / sum;
    this.seg = 0;
    this.pos = 0;
    this.segLen = Math.max(1, this.dur[0] * this.scale);
  }

  tick(): number {
    const n = this.n;
    const amp = this.amp;
    const i1 = this.seg + 1 < n ? this.seg + 1 : 0;
    const t = this.pos / this.segLen;
    const s = amp[this.seg] * (1 - t) + amp[i1] * t;
    this.pos++;
    if (this.pos >= this.segLen) {
      this.seg++;
      this.pos = 0;
      if (this.seg >= n) {
        this.startCycle(false);
      } else {
        this.segLen = Math.max(1, this.dur[this.seg] * this.scale);
      }
    }
    return s;
  }
}

export class GendyEngine {
  private readonly voices: Voice[];
  private readonly mults: number[];
  private readonly gains: number[];
  private rms = 0;
  private chaos = 0.35;

  constructor(
    sampleRate: number,
    n = 12,
    base = 55,
    seed = 123456789,
    mults: number[] = [0.5, 1.0, 2.0],
    gains: number[] = [0.5, 0.7, 0.34],
  ) {
    this.mults = mults;
    this.gains = gains;
    this.voices = mults.map(
      (m, i) => new Voice(sampleRate, n, base * m, new Rng(seed + i * 7919)),
    );
    this.setChaos(0.35);
  }

  setChaos(c: number): void {
    c = Math.max(0, Math.min(1, c));
    this.chaos = c;
    for (const v of this.voices) {
      v.setChaos(
        0.0012 + c * 0.07,
        0.0008 + c * 0.055,
        0.42 + c * 0.5,
        0.85 - c * 0.55,
        1.15 + c * 0.8,
        c * 0.045,
      );
    }
  }

  setBase(base: number): void {
    for (let i = 0; i < this.voices.length; i++) {
      this.voices[i].setFreq(base * this.mults[i]);
    }
  }

  /** Fill an output block; returns nothing (writes into buf). */
  render(buf: Float32Array): void {
    const vs = this.voices;
    const gains = this.gains;
    const nv = vs.length;
    let acc = 0;
    for (let s = 0; s < buf.length; s++) {
      let mix = 0;
      for (let i = 0; i < nv; i++) mix += vs[i].tick() * gains[i];
      mix = Math.tanh(mix * 0.9);
      if (mix > 0.98) mix = 0.98;
      else if (mix < -0.98) mix = -0.98;
      buf[s] = mix;
      acc += mix * mix;
    }
    this.rms += (Math.sqrt(acc / buf.length) - this.rms) * 0.2;
  }

  snapshot(): WaveSnapshot {
    const lead = this.voices[1] || this.voices[0];
    return {
      amp: lead.amp,
      dur: lead.dur,
      level: this.rms,
      chaos: this.chaos,
    };
  }
}
