// ─────────────────────────────────────────────────────────────────────────────
// 23120-sever · hpss.ts — OFFLINE harmonic / percussive source separation.
//
//   Fitzgerald, "Harmonic/Percussive Separation using Median Filtering" (DAFx
//   2010). Runs ONCE at load (chunked, with a progress callback) — not realtime.
//
//   Pipeline:
//     1. Mono downmix, capped to MAX_SECONDS so the heavy pass stays tractable.
//     2. STFT — Hann window (size 2048), hop 512 (75% overlap).
//     3. Two median filters on the magnitude spectrogram:
//          harmonic estimate h = median along the TIME axis   (horizontal, len 17)
//          percussive estimate p = median along the FREQ axis (vertical,   len 17)
//        A piano's sustained strings are long horizontal ridges → survive the
//        time-median; its hammer attacks are vertical broadband streaks →
//        survive the frequency-median.
//     4. Soft (Wiener-style) masks:  H = h²/(h²+p²),  P = p²/(h²+p²).
//        Applied to the COMPLEX STFT (original phase preserved — a real mask
//        scales magnitude only).
//     5. Inverse STFT + windowed overlap-add → two mono AudioBuffers.
//
//   This is the *decomposition* idea from D-Composer (arXiv:2610.22535, 19 Oct
//   2026, "Simultaneous Drum Transcription and Sound Event Decomposition"),
//   realised with the classic median-filtering algorithm above.
// ─────────────────────────────────────────────────────────────────────────────

export interface HpssOptions {
  fftSize?: number;
  hop?: number;
  /** Median length along time (harmonic). Odd. */
  harmLen?: number;
  /** Median length along frequency (percussive). Odd. */
  percLen?: number;
  /** Hard cap on processed duration, seconds. */
  maxSeconds?: number;
}

export interface HpssResult {
  harmonic: AudioBuffer;
  percussive: AudioBuffer;
  sampleRate: number;
  seconds: number;
  method: string;
}

const DEFAULTS = {
  fftSize: 2048,
  hop: 512,
  harmLen: 17,
  percLen: 17,
  maxSeconds: 75,
};

// ── Radix-2 iterative FFT (in place, precomputed twiddles) ───────────────────

function fftInPlace(
  re: Float32Array,
  im: Float32Array,
  cosT: Float32Array,
  sinT: Float32Array,
  n: number,
  inverse: boolean,
): void {
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
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
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = (n / len) | 0;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const tw = k * step;
        const c = cosT[tw];
        const s = inverse ? sinT[tw] : -sinT[tw];
        const a = i + k;
        const b = a + half;
        const xr = re[b] * c - im[b] * s;
        const xi = re[b] * s + im[b] * c;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

// ── Median of a short scratch slice (insertion sort — fast for ≤17 items) ────

function medianOf(scratch: Float32Array, count: number): number {
  for (let i = 1; i < count; i++) {
    const v = scratch[i];
    let j = i - 1;
    while (j >= 0 && scratch[j] > v) {
      scratch[j + 1] = scratch[j];
      j--;
    }
    scratch[j + 1] = v;
  }
  const mid = count >> 1;
  return count & 1
    ? scratch[mid]
    : 0.5 * (scratch[mid - 1] + scratch[mid]);
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export async function runHpss(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  onProgress: (frac: number, label: string) => void,
  options: HpssOptions = {},
): Promise<HpssResult> {
  const N = options.fftSize ?? DEFAULTS.fftSize;
  const hop = options.hop ?? DEFAULTS.hop;
  const harmLen = options.harmLen ?? DEFAULTS.harmLen;
  const percLen = options.percLen ?? DEFAULTS.percLen;
  const maxSeconds = options.maxSeconds ?? DEFAULTS.maxSeconds;
  const sr = source.sampleRate;
  const nBins = (N >> 1) + 1;

  onProgress(0.01, "reading the take");
  await yieldToUi();

  // 1) Mono downmix, capped length.
  const capSamples = Math.min(source.length, Math.ceil(maxSeconds * sr));
  const mono = new Float32Array(capSamples);
  const chans = source.numberOfChannels;
  for (let c = 0; c < chans; c++) {
    const data = source.getChannelData(c);
    for (let i = 0; i < capSamples; i++) mono[i] += data[i] / chans;
  }

  // Precompute Hann window + FFT twiddles.
  const win = new Float32Array(N);
  for (let n = 0; n < N; n++) win[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / N));
  const cosT = new Float32Array(N);
  const sinT = new Float32Array(N);
  for (let t = 0; t < N; t++) {
    cosT[t] = Math.cos((2 * Math.PI * t) / N);
    sinT[t] = Math.sin((2 * Math.PI * t) / N);
  }

  const numFrames = Math.max(1, Math.floor((capSamples - N) / hop) + 1);
  const specRe = new Float32Array(numFrames * nBins);
  const specIm = new Float32Array(numFrames * nBins);
  const mag = new Float32Array(numFrames * nBins);
  const harmMed = new Float32Array(numFrames * nBins);

  const fr = new Float32Array(N);
  const fi = new Float32Array(N);

  // 2) Forward STFT.
  for (let t = 0; t < numFrames; t++) {
    const start = t * hop;
    for (let n = 0; n < N; n++) {
      fr[n] = mono[start + n] * win[n];
      fi[n] = 0;
    }
    fftInPlace(fr, fi, cosT, sinT, N, false);
    const base = t * nBins;
    for (let k = 0; k < nBins; k++) {
      const re = fr[k];
      const im = fi[k];
      specRe[base + k] = re;
      specIm[base + k] = im;
      mag[base + k] = Math.hypot(re, im);
    }
    if ((t & 127) === 0) {
      onProgress(0.03 + 0.32 * (t / numFrames), "analysing spectrum");
      await yieldToUi();
    }
  }

  // 3a) Harmonic estimate — median along TIME axis (per bin, across frames).
  const rH = harmLen >> 1;
  const scratch = new Float32Array(Math.max(harmLen, percLen));
  for (let k = 0; k < nBins; k++) {
    for (let t = 0; t < numFrames; t++) {
      let cnt = 0;
      const lo = Math.max(0, t - rH);
      const hi = Math.min(numFrames - 1, t + rH);
      for (let j = lo; j <= hi; j++) scratch[cnt++] = mag[j * nBins + k];
      harmMed[t * nBins + k] = medianOf(scratch, cnt);
    }
    if ((k & 63) === 0) {
      onProgress(0.35 + 0.22 * (k / nBins), "pulling the ringing apart");
      await yieldToUi();
    }
  }

  // 4 + 5) Percussive estimate (freq-axis median, per frame on the fly), soft
  // masks, apply to complex STFT, inverse STFT + overlap-add.
  const rP = percLen >> 1;
  const outLen = (numFrames - 1) * hop + N;
  const harmOut = new Float32Array(outLen);
  const percOut = new Float32Array(outLen);
  const winSum = new Float32Array(outLen); // shared normaliser (same window/positions)
  const percMed = new Float32Array(nBins);

  const hr = new Float32Array(N);
  const hi = new Float32Array(N);
  const pr = new Float32Array(N);
  const pi = new Float32Array(N);
  const eps = 1e-10;

  for (let t = 0; t < numFrames; t++) {
    const base = t * nBins;
    // freq-axis median for this frame
    for (let k = 0; k < nBins; k++) {
      let cnt = 0;
      const lo = Math.max(0, k - rP);
      const hi2 = Math.min(nBins - 1, k + rP);
      for (let j = lo; j <= hi2; j++) scratch[cnt++] = mag[base + j];
      percMed[k] = medianOf(scratch, cnt);
    }
    // soft masks → one-sided complex for each layer
    for (let k = 0; k < nBins; k++) {
      const h = harmMed[base + k];
      const p = percMed[k];
      const h2 = h * h;
      const p2 = p * p;
      const denom = h2 + p2 + eps;
      const Hm = h2 / denom;
      const Pm = p2 / denom;
      const re = specRe[base + k];
      const im = specIm[base + k];
      hr[k] = re * Hm;
      hi[k] = im * Hm;
      pr[k] = re * Pm;
      pi[k] = im * Pm;
    }
    // rebuild full Hermitian spectra
    for (let k = 1; k < nBins - 1; k++) {
      const m = N - k;
      hr[m] = hr[k];
      hi[m] = -hi[k];
      pr[m] = pr[k];
      pi[m] = -pi[k];
    }
    hi[0] = 0;
    hi[nBins - 1] = 0;
    pi[0] = 0;
    pi[nBins - 1] = 0;

    fftInPlace(hr, hi, cosT, sinT, N, true);
    fftInPlace(pr, pi, cosT, sinT, N, true);

    const invN = 1 / N;
    const start = t * hop;
    for (let n = 0; n < N; n++) {
      const w = win[n];
      harmOut[start + n] += hr[n] * invN * w;
      percOut[start + n] += pr[n] * invN * w;
      winSum[start + n] += w * w;
    }
    if ((t & 63) === 0) {
      onProgress(0.57 + 0.4 * (t / numFrames), "re-layering the hammers");
      await yieldToUi();
    }
  }

  // Normalise overlap-add.
  for (let i = 0; i < outLen; i++) {
    const w = winSum[i];
    if (w > 1e-6) {
      harmOut[i] /= w;
      percOut[i] /= w;
    }
  }

  // Build mono AudioBuffers.
  const finalLen = capSamples;
  const harmonic = ctx.createBuffer(1, finalLen, sr);
  const percussive = ctx.createBuffer(1, finalLen, sr);
  harmonic.getChannelData(0).set(harmOut.subarray(0, finalLen));
  percussive.getChannelData(0).set(percOut.subarray(0, finalLen));

  onProgress(1, "separated");
  return {
    harmonic,
    percussive,
    sampleRate: sr,
    seconds: finalLen / sr,
    method: "median-filter HPSS (Fitzgerald 2010)",
  };
}
