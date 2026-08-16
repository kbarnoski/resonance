// ─────────────────────────────────────────────────────────────────────────────
// hpss.ts — hand-rolled Harmonic/Percussive Source Separation.
//
// Method: Fitzgerald, "Harmonic/Percussive Separation using Median Filtering",
// Proc. DAFx-10, Graz, 2010. We compute a magnitude spectrogram via STFT, then:
//   • a median filter ACROSS TIME (per frequency bin) enhances sustained tones
//     → the HARMONIC estimate H (horizontal ridges survive, transients smear out).
//   • a median filter ACROSS FREQUENCY (per time frame) enhances broadband
//     attacks → the PERCUSSIVE estimate P (vertical spikes survive).
// Soft Wiener masks Mh = H²/(H²+P²+ε), Mp = P²/(H²+P²+ε) are applied to the
// ORIGINAL complex STFT (phase preserved) and inverted with overlap-add ISTFT,
// yielding two real time-domain buffers that sum back to (near) the original.
//
// No npm deps: the radix-2 FFT below is written from scratch.
// ─────────────────────────────────────────────────────────────────────────────

const FFT_SIZE = 2048;
const HOP = 512;
const N_BINS = FFT_SIZE / 2 + 1;
const MED = 17; // median window length (odd) for both axes
const HALF_MED = (MED - 1) / 2;
const EPS = 1e-8;

export interface Separation {
  harmonic: AudioBuffer;
  percussive: AudioBuffer;
  /** Seconds actually processed (may be capped below the source length). */
  seconds: number;
}

export interface SeparateOptions {
  /** Cap the processed duration to keep memory/CPU bounded. Default 30 s. */
  maxSeconds?: number;
  onProgress?: (fraction: number, label: string) => void;
}

/** In-place iterative radix-2 Cooley–Tukey FFT. `inverse` scales by 1/N. */
function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;
  // bit-reversal permutation
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
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cwr - im[b] * cwi;
        const xi = re[b] * cwi + im[b] * cwr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = ncwr;
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

/** Median of a small scratch window via insertion sort (window ≤ MED). */
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
  return scratch[count >> 1];
}

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Separate `input` into harmonic + percussive AudioBuffers. Deterministic —
 * given the same buffer it always returns the same result (no randomness, no
 * wall-clock). Progress is reported 0→1 with a short label per stage.
 */
export async function separateHPSS(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  opts: SeparateOptions = {},
): Promise<Separation> {
  const onProgress = opts.onProgress ?? (() => {});
  const sr = input.sampleRate;
  const maxSamples = Math.floor((opts.maxSeconds ?? 30) * sr);
  const total = Math.min(input.length, maxSamples);

  // ── mono-sum ──────────────────────────────────────────────────────────────
  const mono = new Float32Array(Math.max(total, FFT_SIZE));
  const nch = input.numberOfChannels;
  for (let ch = 0; ch < nch; ch++) {
    const data = input.getChannelData(ch);
    for (let i = 0; i < total; i++) mono[i] += data[i] / nch;
  }

  // Hann window (analysis + synthesis).
  const win = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  }

  const monoLen = mono.length;
  const frames = Math.max(1, Math.floor((monoLen - FFT_SIZE) / HOP) + 1);

  // Half-spectrum stores (Hermitian symmetry rebuilt at ISTFT).
  const reH = new Float32Array(frames * N_BINS);
  const imH = new Float32Array(frames * N_BINS);
  const mag = new Float32Array(frames * N_BINS);

  // ── STFT ────────────────────────────────────────────────────────────────
  {
    const re = new Float32Array(FFT_SIZE);
    const im = new Float32Array(FFT_SIZE);
    for (let f = 0; f < frames; f++) {
      const start = f * HOP;
      for (let i = 0; i < FFT_SIZE; i++) {
        re[i] = mono[start + i] * win[i];
        im[i] = 0;
      }
      fft(re, im, false);
      const base = f * N_BINS;
      for (let b = 0; b < N_BINS; b++) {
        const rr = re[b];
        const ii = im[b];
        reH[base + b] = rr;
        imH[base + b] = ii;
        mag[base + b] = Math.sqrt(rr * rr + ii * ii);
      }
      if ((f & 63) === 0) {
        onProgress((f / frames) * 0.4, "analysing spectrogram");
        await yieldToUI();
      }
    }
  }

  const Hmed = new Float32Array(frames * N_BINS);
  const Pmed = new Float32Array(frames * N_BINS);
  const scratch = new Float32Array(MED);

  // ── harmonic estimate: median ACROSS TIME (per bin) ─────────────────────
  for (let b = 0; b < N_BINS; b++) {
    for (let f = 0; f < frames; f++) {
      let c = 0;
      for (let k = -HALF_MED; k <= HALF_MED; k++) {
        let ff = f + k;
        if (ff < 0) ff = 0;
        else if (ff >= frames) ff = frames - 1;
        scratch[c++] = mag[ff * N_BINS + b];
      }
      Hmed[f * N_BINS + b] = medianOf(scratch, c);
    }
    if ((b & 31) === 0) {
      onProgress(0.4 + (b / N_BINS) * 0.25, "lifting the melody (harmonic)");
      await yieldToUI();
    }
  }

  // ── percussive estimate: median ACROSS FREQUENCY (per frame) ────────────
  for (let f = 0; f < frames; f++) {
    const base = f * N_BINS;
    for (let b = 0; b < N_BINS; b++) {
      let c = 0;
      for (let k = -HALF_MED; k <= HALF_MED; k++) {
        let bb = b + k;
        if (bb < 0) bb = 0;
        else if (bb >= N_BINS) bb = N_BINS - 1;
        scratch[c++] = mag[base + bb];
      }
      Pmed[base + b] = medianOf(scratch, c);
    }
    if ((f & 63) === 0) {
      onProgress(0.65 + (f / frames) * 0.2, "isolating the pulse (percussive)");
      await yieldToUI();
    }
  }

  // ── resynthesis: apply soft Wiener mask, ISTFT overlap-add ───────────────
  const outLen = (frames - 1) * HOP + FFT_SIZE;

  async function resynth(harmonic: boolean, label: string): Promise<Float32Array> {
    const out = new Float32Array(outLen);
    const norm = new Float32Array(outLen);
    const fre = new Float32Array(FFT_SIZE);
    const fim = new Float32Array(FFT_SIZE);
    for (let f = 0; f < frames; f++) {
      const base = f * N_BINS;
      for (let b = 0; b < N_BINS; b++) {
        const h = Hmed[base + b];
        const p = Pmed[base + b];
        const denom = h * h + p * p + EPS;
        const m = harmonic ? (h * h) / denom : (p * p) / denom;
        fre[b] = reH[base + b] * m;
        fim[b] = imH[base + b] * m;
      }
      // rebuild Hermitian-symmetric upper half
      for (let b = 1; b < N_BINS - 1; b++) {
        fre[FFT_SIZE - b] = fre[b];
        fim[FFT_SIZE - b] = -fim[b];
      }
      fft(fre, fim, true); // inverse → real part in fre
      const start = f * HOP;
      for (let i = 0; i < FFT_SIZE; i++) {
        const w = win[i];
        out[start + i] += fre[i] * w;
        norm[start + i] += w * w;
      }
      if ((f & 63) === 0) {
        onProgress(0.85 + (harmonic ? 0 : 0.075) + (f / frames) * 0.075, label);
        await yieldToUI();
      }
    }
    for (let i = 0; i < outLen; i++) {
      const nrm = norm[i];
      if (nrm > 1e-6) out[i] /= nrm;
    }
    return out;
  }

  const hData = await resynth(true, "resynthesising harmonic layer");
  const pData = await resynth(false, "resynthesising percussive layer");

  const harmonic = ctx.createBuffer(1, outLen, sr);
  harmonic.getChannelData(0).set(hData);
  const percussive = ctx.createBuffer(1, outLen, sr);
  percussive.getChannelData(0).set(pData);

  onProgress(1, "ready");
  return { harmonic, percussive, seconds: outLen / sr };
}
