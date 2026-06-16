// hpss.ts — Median-filter Harmonic/Percussive Source Separation.
// Reference: Derry Fitzgerald, "Harmonic/Percussive Separation using Median
// Filtering", DAFx 2010.
//
// Pipeline (all pure functions, chunked at the caller for UI responsiveness):
//   1. mono slice, downsample to ~22050 Hz, start where energy first crosses a
//      threshold, ~8-10s long.
//   2. STFT: Hann window, FFT 1024, hop 256. Keep real+imag per bin.
//   3. magnitude spectrogram S.
//   4. H = per-bin median ACROSS TIME (kernel 17 frames)  -> sustained strings.
//   5. P = per-frame median ACROSS FREQ (kernel 17 bins)  -> hammer transients.
//   6. soft Wiener masks, power p=2.
//   7. apply masks to original complex STFT (keep phase), ISTFT overlap-add.

export const TARGET_SR = 22050;
export const FFT_SIZE = 1024;
export const HOP = 256;
export const TIME_KERNEL = 17; // frames (must be odd)
export const FREQ_KERNEL = 17; // bins (must be odd)
const FREQ_BINS = FFT_SIZE / 2 + 1; // 513
const SLICE_SECS = 9;
const EPS = 1e-8;

export interface Spectrogram {
  frames: number;
  bins: number;
  re: Float32Array; // frames * bins, row-major (frame * bins + bin)
  im: Float32Array;
  mag: Float32Array;
}

export interface HpssResult {
  harmonic: Float32Array; // mono PCM at TARGET_SR
  percussive: Float32Array;
  sampleRate: number;
  // Downsampled magnitude spectrograms for visualization (separated layers).
  harmonicSpec: Float32Array; // frames * bins
  percussiveSpec: Float32Array;
  specFrames: number;
  specBins: number;
}

// ─── Small helpers (NOT React hooks) ─────────────────────────────────────────

/** Downmix every channel of an AudioBuffer to a single mono Float32Array. */
export function downmixMono(buffer: AudioBuffer): Float32Array {
  const ch = buffer.numberOfChannels;
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i] += data[i];
  }
  if (ch > 1) for (let i = 0; i < out.length; i++) out[i] /= ch;
  return out;
}

/** Linear-interpolating resample from srcRate to dstRate. */
export function resample(src: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return src;
  const ratio = dstRate / srcRate;
  const outLen = Math.floor(src.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const a = src[i0] ?? 0;
    const b = src[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Find a slice of ~SLICE_SECS starting where short-term energy first exceeds a
 * threshold (so we skip leading silence). Returns the sliced signal.
 */
export function pickSlice(mono: Float32Array, sampleRate: number): Float32Array {
  const win = Math.floor(0.02 * sampleRate);
  // RMS of the whole signal as a reference for the threshold.
  let sumSq = 0;
  for (let i = 0; i < mono.length; i++) sumSq += mono[i] * mono[i];
  const globalRms = Math.sqrt(sumSq / Math.max(1, mono.length));
  const thresh = Math.max(1e-4, globalRms * 0.5);

  let startIdx = 0;
  for (let i = 0; i + win < mono.length; i += win) {
    let s = 0;
    for (let j = 0; j < win; j++) s += mono[i + j] * mono[i + j];
    if (Math.sqrt(s / win) > thresh) {
      startIdx = i;
      break;
    }
  }

  const sliceLen = Math.floor(SLICE_SECS * sampleRate);
  const end = Math.min(mono.length, startIdx + sliceLen);
  // If the signal is shorter than a slice, just take whatever exists from start.
  return mono.slice(startIdx, end);
}

/** Hann window of length n. */
function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

// ─── Radix-2 in-place iterative FFT ──────────────────────────────────────────

/** In-place complex FFT (length must be a power of two). */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wpr = Math.cos(ang);
    const wpi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const tr = wr * re[b] - wi * im[b];
        const ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nwr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr;
        wr = nwr;
      }
    }
  }
}

/** In-place inverse complex FFT. */
function ifft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

// ─── STFT / ISTFT ────────────────────────────────────────────────────────────

const WINDOW = hann(FFT_SIZE);

/** Forward STFT keeping real, imag and magnitude per bin. */
export function stft(signal: Float32Array): Spectrogram {
  const frames = Math.max(1, 1 + Math.floor((signal.length - FFT_SIZE) / HOP));
  const re = new Float32Array(frames * FREQ_BINS);
  const im = new Float32Array(frames * FREQ_BINS);
  const mag = new Float32Array(frames * FREQ_BINS);

  const fr = new Float32Array(FFT_SIZE);
  const fi = new Float32Array(FFT_SIZE);

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      fr[i] = (signal[off + i] ?? 0) * WINDOW[i];
      fi[i] = 0;
    }
    fft(fr, fi);
    const base = f * FREQ_BINS;
    for (let b = 0; b < FREQ_BINS; b++) {
      re[base + b] = fr[b];
      im[base + b] = fi[b];
      mag[base + b] = Math.hypot(fr[b], fi[b]);
    }
  }
  return { frames, bins: FREQ_BINS, re, im, mag };
}

/**
 * ISTFT via overlap-add. `re`/`im` are full complex spectra (freqBins) per
 * frame for the first half; we mirror to reconstruct the full FFT, apply the
 * synthesis Hann window, and normalize by the summed squared window.
 */
export function istft(re: Float32Array, im: Float32Array, frames: number, outLen: number): Float32Array {
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const fr = new Float32Array(FFT_SIZE);
  const fi = new Float32Array(FFT_SIZE);

  for (let f = 0; f < frames; f++) {
    const base = f * FREQ_BINS;
    // Reconstruct full spectrum from the half (conjugate symmetry).
    for (let b = 0; b < FREQ_BINS; b++) {
      fr[b] = re[base + b];
      fi[b] = im[base + b];
    }
    for (let b = 1; b < FREQ_BINS - 1; b++) {
      fr[FFT_SIZE - b] = re[base + b];
      fi[FFT_SIZE - b] = -im[base + b];
    }
    ifft(fr, fi);
    const off = f * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = off + i;
      if (idx >= outLen) break;
      const w = WINDOW[i];
      out[idx] += fr[i] * w;
      norm[idx] += w * w;
    }
  }
  for (let i = 0; i < outLen; i++) {
    if (norm[i] > EPS) out[i] /= norm[i];
  }
  return out;
}

// ─── Median filtering ────────────────────────────────────────────────────────

/** Median of a small fixed-size scratch array (insertion sort, k is tiny). */
function medianOf(scratch: Float32Array, k: number): number {
  // Insertion sort over the first k elements.
  for (let i = 1; i < k; i++) {
    const v = scratch[i];
    let j = i - 1;
    while (j >= 0 && scratch[j] > v) {
      scratch[j + 1] = scratch[j];
      j--;
    }
    scratch[j + 1] = v;
  }
  return scratch[k >> 1];
}

/**
 * Harmonic estimate: per-frequency-bin median ACROSS TIME (horizontal trails).
 */
export function medianTime(mag: Float32Array, frames: number, bins: number, kernel: number): Float32Array {
  const out = new Float32Array(frames * bins);
  const half = kernel >> 1;
  const scratch = new Float32Array(kernel);
  for (let b = 0; b < bins; b++) {
    for (let f = 0; f < frames; f++) {
      let k = 0;
      for (let d = -half; d <= half; d++) {
        let ff = f + d;
        if (ff < 0) ff = 0;
        else if (ff >= frames) ff = frames - 1;
        scratch[k++] = mag[ff * bins + b];
      }
      out[f * bins + b] = medianOf(scratch, k);
    }
  }
  return out;
}

/**
 * Percussive estimate: per-frame median ACROSS FREQUENCY (vertical lines).
 */
export function medianFreq(mag: Float32Array, frames: number, bins: number, kernel: number): Float32Array {
  const out = new Float32Array(frames * bins);
  const half = kernel >> 1;
  const scratch = new Float32Array(kernel);
  for (let f = 0; f < frames; f++) {
    const base = f * bins;
    for (let b = 0; b < bins; b++) {
      let k = 0;
      for (let d = -half; d <= half; d++) {
        let bb = b + d;
        if (bb < 0) bb = 0;
        else if (bb >= bins) bb = bins - 1;
        scratch[k++] = mag[base + bb];
      }
      out[base + b] = medianOf(scratch, k);
    }
  }
  return out;
}

// ─── Full decomposition (chunked driver) ─────────────────────────────────────

export type ProgressCb = (fraction: number, label: string) => void;

/** Yield to the event loop so the UI can paint between heavy stages. */
function nextTick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Run the whole HPSS pipeline on an AudioBuffer. Chunked with awaits so the UI
 * never hard-freezes. Returns separated PCM + downsampled spectrograms.
 */
export async function decompose(buffer: AudioBuffer, onProgress: ProgressCb): Promise<HpssResult> {
  onProgress(0.02, "downmix + resample");
  await nextTick();
  const mono = downmixMono(buffer);
  const ds = resample(mono, buffer.sampleRate, TARGET_SR);
  const slice = pickSlice(ds, TARGET_SR);

  onProgress(0.15, "stft");
  await nextTick();
  const S = stft(slice);
  const { frames, bins, re, im, mag } = S;

  onProgress(0.35, "median filter (strings)");
  await nextTick();
  const H = medianTime(mag, frames, bins, TIME_KERNEL);

  onProgress(0.55, "median filter (hammers)");
  await nextTick();
  const P = medianFreq(mag, frames, bins, FREQ_KERNEL);

  onProgress(0.7, "wiener masks + istft");
  await nextTick();

  // Soft Wiener masks, power p=2, applied to original complex STFT (keep phase).
  const hRe = new Float32Array(frames * bins);
  const hIm = new Float32Array(frames * bins);
  const pRe = new Float32Array(frames * bins);
  const pIm = new Float32Array(frames * bins);
  // Downsampled spectrograms for viz.
  const harmonicSpec = new Float32Array(frames * bins);
  const percussiveSpec = new Float32Array(frames * bins);

  for (let i = 0; i < frames * bins; i++) {
    const h2 = H[i] * H[i];
    const p2 = P[i] * P[i];
    const denom = h2 + p2 + EPS;
    const mH = h2 / denom;
    const mP = p2 / denom;
    hRe[i] = re[i] * mH;
    hIm[i] = im[i] * mH;
    pRe[i] = re[i] * mP;
    pIm[i] = im[i] * mP;
    harmonicSpec[i] = mag[i] * mH;
    percussiveSpec[i] = mag[i] * mP;
  }

  await nextTick();
  const outLen = slice.length;
  const harmonic = istft(hRe, hIm, frames, outLen);
  onProgress(0.85, "istft (strings)");
  await nextTick();
  const percussive = istft(pRe, pIm, frames, outLen);
  onProgress(0.97, "finalize");
  await nextTick();

  // Normalize both layers to a comfortable peak.
  normalizePeak(harmonic, 0.9);
  normalizePeak(percussive, 0.9);

  onProgress(1, "done");
  return {
    harmonic,
    percussive,
    sampleRate: TARGET_SR,
    harmonicSpec,
    percussiveSpec,
    specFrames: frames,
    specBins: bins,
  };
}

/** Scale a signal in place so its absolute peak hits `peak`. */
function normalizePeak(buf: Float32Array, peak: number): void {
  let max = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > max) max = a;
  }
  if (max < EPS) return;
  const g = peak / max;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
}
