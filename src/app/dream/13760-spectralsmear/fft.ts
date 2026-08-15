// ─────────────────────────────────────────────────────────────────────────────
// fft.ts — a tiny, self-contained iterative radix-2 Cooley-Tukey FFT plus the
// small helpers the spectral engine needs (Hann window, principal-value phase
// wrap, and a seeded mulberry32 so nothing here reaches for Math.random()).
//
// The transform runs in-place on split real/imag Float32Arrays; twiddles and the
// bit-reversal permutation are precomputed once per size so the per-frame cost is
// just the butterflies. Size must be a power of two.
// ─────────────────────────────────────────────────────────────────────────────

export class FFT {
  readonly n: number;
  private readonly cosT: Float32Array;
  private readonly sinT: Float32Array;
  private readonly rev: Uint32Array;

  constructor(n: number) {
    if ((n & (n - 1)) !== 0) throw new Error("FFT size must be a power of two");
    this.n = n;
    const half = n >> 1;
    this.cosT = new Float32Array(half);
    this.sinT = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      this.cosT[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sinT[i] = Math.sin((-2 * Math.PI * i) / n);
    }
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let x = i;
      let r = 0;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | (x & 1);
        x >>= 1;
      }
      this.rev[i] = r >>> 0;
    }
  }

  /** In-place transform. `inverse` also divides by N so ifft(fft(x)) === x. */
  transform(re: Float32Array, im: Float32Array, inverse = false): void {
    const n = this.n;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const c = this.cosT[k];
          const s = inverse ? -this.sinT[k] : this.sinT[k];
          const a = i + j;
          const b = a + half;
          const tr = re[b] * c - im[b] * s;
          const ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
    if (inverse) {
      const inv = 1 / n;
      for (let i = 0; i < n; i++) {
        re[i] *= inv;
        im[i] *= inv;
      }
    }
  }
}

/** A periodic Hann window of length n (used for both analysis and synthesis). */
export function makeHann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  }
  return w;
}

/** Wrap a phase (radians) to the principal interval (-pi, pi]. */
export function princarg(phase: number): number {
  return phase - 2 * Math.PI * Math.round(phase / (2 * Math.PI));
}

/** Seeded PRNG — deterministic jitter, no Math.random() anywhere in the piece. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
