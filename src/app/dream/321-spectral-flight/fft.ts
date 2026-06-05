// ─────────────────────────────────────────────────────────────────────────────
// fft.ts — a tiny, dependency-free radix-2 Cooley–Tukey FFT plus an offline
// Short-Time Fourier Transform that turns a whole AudioBuffer into a normalized
// time × log-frequency magnitude grid. No npm deps — written by hand.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-place iterative radix-2 FFT. `re`/`im` are length N (a power of two).
 * Transforms in place. Inverse is unused here (analysis only).
 */
export function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    throw new Error("fftRadix2: length must be a power of two");
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + half];
        const bIm = im[i + k + half];
        const tRe = bRe * curRe - bIm * curIm;
        const tIm = bRe * curIm + bIm * curRe;
        re[i + k] = aRe + tRe;
        im[i + k] = aIm + tIm;
        re[i + k + half] = aRe - tRe;
        im[i + k + half] = aIm - tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Precompute a periodic Hann window of length n. */
function makeHann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  }
  return w;
}

export interface SpectralGrid {
  /** number of time columns */
  cols: number;
  /** number of log-spaced frequency rows */
  rows: number;
  /** cols * rows magnitudes in [0,1], row-major: idx = col * rows + row */
  data: Float32Array;
  /** sample rate of the analysed buffer */
  sampleRate: number;
  /** total duration in seconds */
  duration: number;
}

export interface StftOptions {
  fftSize?: number; // window/transform size (power of two)
  hop?: number; // hop in samples
  outCols?: number; // downsampled time columns for the whole track
  outRows?: number; // log-spaced frequency rows
  minHz?: number; // lowest frequency of the log axis
  maxHz?: number; // highest frequency of the log axis
}

/**
 * Run an offline STFT over a mono mix of `channels` and downsample the result
 * into a renderable time × log-frequency magnitude grid normalized to [0,1].
 */
export function buildSpectralGrid(
  channels: Float32Array[],
  sampleRate: number,
  opts: StftOptions = {},
): SpectralGrid {
  const fftSize = opts.fftSize ?? 2048;
  const hop = opts.hop ?? 1024;
  const outCols = opts.outCols ?? 320;
  const outRows = opts.outRows ?? 128;
  const minHz = opts.minHz ?? 40;
  const maxHz = opts.maxHz ?? Math.min(sampleRate / 2, 11000);

  const length = channels[0]?.length ?? 0;
  const duration = length / sampleRate;

  // Mono mix into a single Float32Array.
  const mono = new Float32Array(length);
  const ch = channels.length;
  for (let c = 0; c < ch; c++) {
    const data = channels[c];
    for (let i = 0; i < length; i++) mono[i] += data[i] / ch;
  }

  const hann = makeHann(fftSize);
  const half = fftSize >> 1; // usable spectrum bins (0..half-1)
  const frames = Math.max(1, Math.floor((length - fftSize) / hop) + 1);

  // Map each output frequency row to a source FFT bin via log spacing.
  const binHz = sampleRate / fftSize;
  const logMin = Math.log(minHz);
  const logMax = Math.log(maxHz);
  const rowBin = new Int32Array(outRows + 1);
  for (let r = 0; r <= outRows; r++) {
    const f = Math.exp(logMin + ((logMax - logMin) * r) / outRows);
    rowBin[r] = Math.min(half - 1, Math.max(1, Math.round(f / binHz)));
  }

  // For each output time column, average the frames that fall into it.
  const data = new Float32Array(outCols * outRows);
  const colCount = new Int32Array(outCols);

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let f = 0; f < frames; f++) {
    const start = f * hop;
    // window + load
    for (let i = 0; i < fftSize; i++) {
      re[i] = mono[start + i] * hann[i];
      im[i] = 0;
    }
    fftRadix2(re, im);

    // which output column this frame belongs to
    const tNorm = frames > 1 ? f / (frames - 1) : 0;
    const col = Math.min(outCols - 1, Math.floor(tNorm * outCols));
    colCount[col]++;

    for (let r = 0; r < outRows; r++) {
      // average magnitude across the bins spanned by this log row
      const b0 = rowBin[r];
      const b1 = Math.max(rowBin[r] + 1, rowBin[r + 1]);
      let mag = 0;
      let n = 0;
      for (let b = b0; b < b1 && b < half; b++) {
        mag += Math.hypot(re[b], im[b]);
        n++;
      }
      mag = n > 0 ? mag / n : 0;
      data[col * outRows + r] += mag;
    }
  }

  // Average accumulated frames per column.
  for (let col = 0; col < outCols; col++) {
    const n = colCount[col];
    if (n > 1) {
      for (let r = 0; r < outRows; r++) data[col * outRows + r] /= n;
    }
  }

  // Convert to dB and normalize to [0,1].
  let maxDb = -Infinity;
  let minDb = Infinity;
  const dbFloor = -90;
  for (let i = 0; i < data.length; i++) {
    const db = 20 * Math.log10(data[i] + 1e-8);
    const clamped = db < dbFloor ? dbFloor : db;
    data[i] = clamped;
    if (clamped > maxDb) maxDb = clamped;
    if (clamped < minDb) minDb = clamped;
  }
  const range = Math.max(1e-3, maxDb - minDb);
  for (let i = 0; i < data.length; i++) {
    data[i] = (data[i] - minDb) / range; // 0..1
  }

  return { cols: outCols, rows: outRows, data, sampleRate, duration };
}
