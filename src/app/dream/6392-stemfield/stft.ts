// ─────────────────────────────────────────────────────────────────────────────
// stft.ts — a self-contained radix-2 FFT + Short-Time Fourier Transform engine.
//
//   No npm dependency: the FFT is a classic iterative Cooley-Tukey with a
//   precomputed bit-reversal table and twiddle factors. On top of it sit a
//   windowed forward STFT (Hann, 2048 window / 512 hop) and a masked inverse
//   STFT (overlap-add) used to resynthesize the separated streams. Real input
//   is exploited: we keep only the N/2+1 non-redundant bins and expand the
//   Hermitian symmetry back on the way out.
// ─────────────────────────────────────────────────────────────────────────────

/** Iterative in-place radix-2 FFT. Size must be a power of two. */
export class FFT {
  readonly n: number;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly rev: Uint32Array;

  constructor(n: number) {
    if ((n & (n - 1)) !== 0) throw new Error("FFT size must be a power of two");
    this.n = n;
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      const a = (-2 * Math.PI * i) / n;
      this.cos[i] = Math.cos(a);
      this.sin[i] = Math.sin(a);
    }
    this.rev = new Uint32Array(n);
    let bits = 0;
    while (1 << bits < n) bits++;
    for (let i = 0; i < n; i++) {
      let x = i;
      let r = 0;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | (x & 1);
        x >>= 1;
      }
      this.rev[i] = r;
    }
  }

  /** Forward transform, in place. re/im length === n. */
  transform(re: Float32Array, im: Float32Array): void {
    const n = this.n;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    const cos = this.cos;
    const sin = this.sin;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        let k = 0;
        for (let j = i; j < i + half; j++) {
          const wr = cos[k];
          const wi = sin[k];
          const a = j + half;
          const tr = wr * re[a] - wi * im[a];
          const ti = wr * im[a] + wi * re[a];
          re[a] = re[j] - tr;
          im[a] = im[j] - ti;
          re[j] += tr;
          im[j] += ti;
          k += step;
        }
      }
    }
  }

  /** Inverse transform, in place, scaled by 1/n. */
  inverse(re: Float32Array, im: Float32Array): void {
    for (let i = 0; i < this.n; i++) im[i] = -im[i];
    this.transform(re, im);
    const inv = 1 / this.n;
    for (let i = 0; i < this.n; i++) {
      re[i] *= inv;
      im[i] = -im[i] * inv;
    }
  }
}

export interface Spectrogram {
  reFrames: Float32Array[]; // per frame, length = bins
  imFrames: Float32Array[];
  mag: Float32Array; // flat, length = frames * bins, index frame*bins + bin
  frames: number;
  bins: number;
  n: number;
  hop: number;
}

function makeHann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** Forward STFT of a mono signal. */
export function runSTFT(signal: Float32Array, n = 2048, hop = 512): Spectrogram {
  const fft = new FFT(n);
  const win = makeHann(n);
  const bins = n / 2 + 1;
  const frames = signal.length <= n ? 1 : 1 + Math.floor((signal.length - n) / hop);
  const reFrames: Float32Array[] = new Array(frames);
  const imFrames: Float32Array[] = new Array(frames);
  const mag = new Float32Array(frames * bins);
  const re = new Float32Array(n);
  const im = new Float32Array(n);

  for (let f = 0; f < frames; f++) {
    const start = f * hop;
    for (let i = 0; i < n; i++) {
      const s = start + i;
      re[i] = s < signal.length ? signal[s] * win[i] : 0;
      im[i] = 0;
    }
    fft.transform(re, im);
    const fr = new Float32Array(bins);
    const fi = new Float32Array(bins);
    const base = f * bins;
    for (let b = 0; b < bins; b++) {
      fr[b] = re[b];
      fi[b] = im[b];
      mag[base + b] = Math.hypot(re[b], im[b]);
    }
    reFrames[f] = fr;
    imFrames[f] = fi;
  }
  return { reFrames, imFrames, mag, frames, bins, n, hop };
}

/**
 * Masked inverse STFT (overlap-add). Applies a soft mask (flat, frames*bins) to
 * the stored complex spectrogram, optionally inverted (1 - mask), and returns a
 * time-domain signal. Uses a Hann synthesis window normalized by the summed
 * squared window so 75%-overlap OLA reconstructs cleanly.
 */
export function runISTFT(
  spec: Spectrogram,
  mask: Float32Array,
  invert: boolean,
): Float32Array {
  const { reFrames, imFrames, frames, bins, n, hop } = spec;
  const fft = new FFT(n);
  const win = makeHann(n);
  const outLen = (frames - 1) * hop + n;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const re = new Float32Array(n);
  const im = new Float32Array(n);

  for (let f = 0; f < frames; f++) {
    const fr = reFrames[f];
    const fi = imFrames[f];
    const mbase = f * bins;
    // Expand Hermitian-symmetric full spectrum with the mask applied.
    for (let b = 0; b < bins; b++) {
      let m = mask[mbase + b];
      if (invert) m = 1 - m;
      const rr = fr[b] * m;
      const ii = fi[b] * m;
      re[b] = rr;
      im[b] = ii;
      if (b > 0 && b < bins - 1) {
        re[n - b] = rr;
        im[n - b] = -ii;
      }
    }
    fft.inverse(re, im);
    const start = f * hop;
    for (let i = 0; i < n; i++) {
      const w = win[i];
      out[start + i] += re[i] * w;
      norm[start + i] += w * w;
    }
  }
  for (let i = 0; i < outLen; i++) {
    if (norm[i] > 1e-8) out[i] /= norm[i];
  }
  return out;
}
