// ─── musaic-room · DSP core ──────────────────────────────────────────────────
// Pure, deterministic signal-processing helpers for classic concatenative
// musaicing. No machine learning: real FFT + hand-rolled feature extraction and
// a nearest-neighbour search over a growing corpus of past mic grains.
//
// Everything here is framework-free and side-effect-free (except the seeded
// PRNG's internal state) so it stays easy to reason about and test.

/** Deterministic PRNG (mulberry32). Seeded with 0x2744 per the house rule —
 *  we never call Math.random / Date.now anywhere in this prototype. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Radix-2 iterative FFT ────────────────────────────────────────────────────
// Operates in place on parallel real / imag arrays whose length is a power of 2.
// Used once per grain to get a magnitude spectrum for the spectral centroid.

/** Reusable FFT scratch so we allocate nothing in the audio callback. */
export interface FftScratch {
  size: number;
  re: Float32Array;
  im: Float32Array;
  win: Float32Array; // Hann window, precomputed
}

export function makeFftScratch(size: number): FftScratch {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    // Hann window reduces spectral leakage before the centroid estimate.
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return {
    size,
    re: new Float32Array(size),
    im: new Float32Array(size),
    win,
  };
}

function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
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
  // Danielson-Lanczos butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const bIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + half] = aRe - bRe;
        im[i + k + half] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

// ── Feature extraction ───────────────────────────────────────────────────────

export interface RawFeatures {
  rms: number; // linear RMS loudness
  centroid: number; // spectral centroid, Hz
  zcr: number; // zero-crossing rate, crossings / sample
}

/** Compute the three real features of a grain of PCM. All computed directly
 *  from the live signal — nothing is faked or synthesized here. */
export function extractFeatures(
  pcm: Float32Array,
  sampleRate: number,
  fft: FftScratch,
): RawFeatures {
  const n = pcm.length;

  // RMS loudness.
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += pcm[i] * pcm[i];
  const rms = Math.sqrt(sumSq / n);

  // Zero-crossing rate (a cheap, real brightness/noisiness proxy).
  let crossings = 0;
  for (let i = 1; i < n; i++) {
    if ((pcm[i - 1] >= 0 && pcm[i] < 0) || (pcm[i - 1] < 0 && pcm[i] >= 0)) {
      crossings++;
    }
  }
  const zcr = crossings / (n - 1);

  // Spectral centroid via windowed FFT magnitude.
  const { re, im, win, size } = fft;
  for (let i = 0; i < size; i++) {
    re[i] = i < n ? pcm[i] * win[i] : 0;
    im[i] = 0;
  }
  fftInPlace(re, im);
  const half = size >> 1;
  const binHz = sampleRate / size;
  let weighted = 0;
  let magSum = 0;
  for (let k = 1; k < half; k++) {
    const mag = Math.hypot(re[k], im[k]);
    weighted += k * binHz * mag;
    magSum += mag;
  }
  const centroid = magSum > 1e-9 ? weighted / magSum : 0;

  return { rms, centroid, zcr };
}

// ── Normalized feature vector (for distance + plotting) ──────────────────────

export interface FeatureVec {
  nrms: number; // 0..1 loudness
  ncent: number; // 0..1 log-brightness
  nzcr: number; // 0..1 noisiness
}

const CENT_MIN = 80;
const CENT_MAX = 8000;
const LOG_SPAN = Math.log(CENT_MAX / CENT_MIN);

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Map raw features to a perceptually-spaced 0..1 vector. Loudness gets a
 *  square-root taper, brightness a log map (both closer to how we hear). */
export function normalizeFeatures(f: RawFeatures): FeatureVec {
  const nrms = clamp01(Math.sqrt(f.rms) * 2.2);
  const ncent =
    f.centroid > CENT_MIN
      ? clamp01(Math.log(f.centroid / CENT_MIN) / LOG_SPAN)
      : 0;
  const nzcr = clamp01(Math.sqrt(f.zcr) * 2.0);
  return { nrms, ncent, nzcr };
}

// ── The corpus grain ─────────────────────────────────────────────────────────

export interface Grain {
  id: number; // monotonic counter, doubles as age order
  bornAt: number; // performance.now() ms when captured
  pcm: Float32Array; // the real recorded samples (grain audio)
  vec: FeatureVec; // normalized features
}

// Distance weights — brightness (centroid) and noisiness (zcr) both describe
// timbre, so zcr is weighted a little lower to avoid double-counting.
const W_RMS = 1.0;
const W_CENT = 1.0;
const W_ZCR = 0.7;

export function featureDistanceSq(a: FeatureVec, b: FeatureVec): number {
  const dr = (a.nrms - b.nrms) * W_RMS;
  const dc = (a.ncent - b.ncent) * W_CENT;
  const dz = (a.nzcr - b.nzcr) * W_ZCR;
  return dr * dr + dc * dc + dz * dz;
}

/** Find the nearest past grain to `query`, skipping any grain captured within
 *  `excludeMs` of `nowMs` so the room can't just echo the moment it just heard.
 *  Returns the corpus index of the match, or -1 when none qualifies. */
export function findNearest(
  corpus: Grain[],
  query: FeatureVec,
  nowMs: number,
  excludeMs: number,
): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < corpus.length; i++) {
    const g = corpus[i];
    if (nowMs - g.bornAt < excludeMs) continue;
    const d = featureDistanceSq(query, g.vec);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
