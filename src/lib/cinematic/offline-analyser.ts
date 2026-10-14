/**
 * OFFLINE ANALYSER — the kiosk's Web Audio AnalyserNode, recomputed from a
 * decoded track so a pre-rendered piece (Unreal, docs/unreal-pipeline.md)
 * hears exactly the numbers the live show hears.
 *
 * The kiosk's shared analyser (audio-engine.ts): fftSize 256, smoothing 0.8,
 * the default dB range (-100 … -30). The browser's getByteFrequencyData
 * (Chromium RealtimeAnalyser, the Web Audio spec §1.8.6):
 *   1. the latest fftSize samples of the input, DOWN-MIXED TO MONO;
 *   2. a Blackman window (α = 0.16);
 *   3. an FFT; magnitude |X[k]| / fftSize;
 *   4. smoothing over time: X̂[k] = τ·X̂prev[k] + (1 − τ)·|X[k]| — applied once
 *      per CALL (per rendered frame), so the time constant belongs to the
 *      call rate: the kiosk reads it once per animation frame (~60 Hz);
 *   5. dB = 20·log10(X̂), byte = ⌊255 · (dB − min) / (max − min)⌋ clamped.
 *
 * Pure + deterministic (offline-analyser.test.ts).
 */

export const KIOSK_ANALYSER = {
  fftSize: 256,
  smoothing: 0.8,
  minDecibels: -100,
  maxDecibels: -30,
  /** the kiosk reads the analyser once per animation frame */
  readHz: 60,
  /** the kiosk's AudioContext rate (bin width 187.5 Hz) */
  sampleRate: 48000,
} as const;

/** Blackman window (the spec's α = 0.16). */
export function blackman(n: number): Float64Array {
  const w = new Float64Array(n);
  const a0 = 0.42, a1 = 0.5, a2 = 0.08;
  for (let i = 0; i < n; i++) w[i] = a0 - a1 * Math.cos((2 * Math.PI * i) / n) + a2 * Math.cos((4 * Math.PI * i) / n);
  return w;
}

/** In-place iterative radix-2 FFT (n a power of two). */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error(`fft size ${n} is not a power of two`);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export class OfflineAnalyser {
  readonly fftSize: number;
  readonly frequencyBinCount: number;
  private readonly win: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly smoothed: Float64Array;
  constructor(
    readonly smoothing: number = KIOSK_ANALYSER.smoothing,
    fftSize: number = KIOSK_ANALYSER.fftSize,
    readonly minDecibels: number = KIOSK_ANALYSER.minDecibels,
    readonly maxDecibels: number = KIOSK_ANALYSER.maxDecibels,
  ) {
    this.fftSize = fftSize;
    this.frequencyBinCount = fftSize / 2;
    this.win = blackman(fftSize);
    this.re = new Float64Array(fftSize);
    this.im = new Float64Array(fftSize);
    this.smoothed = new Float64Array(fftSize / 2);
  }

  /** One getByteFrequencyData call at `endSample` (exclusive) of a mono track:
   *  the window is the fftSize samples before it (zeros before the start). */
  read(mono: Float32Array, endSample: number, out: Uint8Array): Uint8Array {
    const N = this.fftSize;
    const start = Math.floor(endSample) - N;
    for (let i = 0; i < N; i++) {
      const j = start + i;
      const s = j >= 0 && j < mono.length ? mono[j] : 0;
      this.re[i] = s * this.win[i];
      this.im[i] = 0;
    }
    fftInPlace(this.re, this.im);
    const k = Math.max(0, Math.min(1, this.smoothing));
    const range = this.maxDecibels - this.minDecibels;
    for (let b = 0; b < this.frequencyBinCount; b++) {
      const mag = Math.hypot(this.re[b], b === 0 ? 0 : this.im[b]) / N;
      const v = k * this.smoothed[b] + (1 - k) * mag;
      this.smoothed[b] = Number.isFinite(v) ? v : 0;
      const db = this.smoothed[b] > 0 ? 20 * Math.log10(this.smoothed[b]) : -Infinity;
      const scaled = (255 / range) * (db - this.minDecibels);
      out[b] = scaled <= 0 || !Number.isFinite(scaled) ? 0 : scaled >= 255 ? 255 : Math.floor(scaled);
    }
    return out;
  }
}

/** Interleaved (or planar) channels → mono, the AnalyserNode's down-mix (mean). */
export function downmixInterleaved(pcm: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return pcm;
  const n = Math.floor(pcm.length / channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += pcm[i * channels + c];
    out[i] = s / channels;
  }
  return out;
}
