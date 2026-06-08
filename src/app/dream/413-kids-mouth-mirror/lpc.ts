/**
 * lpc.ts — Real Linear Predictive Coding (LPC) formant tracking +
 *          formant → tongue articulatory inversion.
 *
 * Pipeline (runs on every animation frame from a raw time-domain frame):
 *   1. RMS gate on the windowed frame (skip silence).
 *   2. Pre-emphasis (1 - 0.97 z^-1) to flatten the glottal -6 dB/oct tilt so
 *      the spectral peaks we want (the vocal-tract formants) stand out.
 *   3. Hamming window the frame.
 *   4. Autocorrelation r[0..p].
 *   5. Levinson-Durbin recursion → LPC coefficients a[1..p] (order p ~ 14).
 *   6. Evaluate the all-pole LPC spectral ENVELOPE H(f) = 1 / |A(e^jw)| on a
 *      frequency grid and peak-pick F1 (250-900 Hz) and F2 (900-2800 Hz).
 *   7. INVERT (F1,F2) → tongue articulation (height, frontness), jaw, lips.
 *   8. Exponential smoothing (alpha = 0.15) so articulators glide.
 *
 * Why LPC beats FFT peak-picking for children:
 *   A child's f0 is high (250-400 Hz), so harmonics are widely spaced. A raw
 *   FFT shows tall harmonic spikes that a naive peak-picker mistakes for
 *   formants. LPC fits a smooth all-pole vocal-tract MODEL — its poles ARE the
 *   resonances (formants) independent of which harmonics happen to excite them,
 *   so it recovers F1/F2 even when harmonics straddle the true formant.
 *
 * References:
 *   - Markel, J. D., & Gray, A. H. (1976). Linear Prediction of Speech.
 *   - Fant, G. (1960). Acoustic Theory of Speech Production. (source-filter)
 *   - Peterson, G. E., & Barney, H. L. (1952). JASA 24(2), 175-184.
 *   - AURORA formant-to-tongue inversion (arXiv:2603.17543, March 2026).
 */

export type VowelId = "a" | "e" | "i" | "o" | "u";

export interface Articulation {
  /** Smoothed first formant (Hz). */
  f1: number;
  /** Smoothed second formant (Hz). */
  f2: number;
  /** Tongue height 0 (low, /a/) .. 1 (high, /i/,/u/) — driven by 1/F1. */
  height: number;
  /** Tongue frontness 0 (back, /u/,/o/) .. 1 (front, /i/) — driven by F2. */
  frontness: number;
  /** Jaw opening 0 (closed) .. 1 (wide, /a/) — driven by F1. */
  jaw: number;
  /** Lip rounding 0 (spread) .. 1 (pursed, /u/,/o/) — driven by low F2. */
  round: number;
  /** Nearest Peterson-Barney vowel (friendly label + sing-back note). */
  vowel: VowelId;
  /** RMS amplitude 0..1 of the current frame. */
  rms: number;
  /** True while voice is above the silence gate. */
  active: boolean;
}

// ── Peterson & Barney (1952) canonical centroids (Hz) ────────────────────────
// Used ONLY to snap a friendly label / sing-back note. The tongue moves
// continuously from raw formants — it never teleports between these poses.
const VOWEL_CENTROIDS: Record<VowelId, { f1: number; f2: number }> = {
  a: { f1: 730, f2: 1090 }, // "aaah"  — jaw wide, tongue low-back
  e: { f1: 530, f2: 1840 }, // "eh/ay" — tongue mid-front
  i: { f1: 270, f2: 2290 }, // "eee"   — tongue high-front
  o: { f1: 570, f2: 840 },  // "ooo/oh"— tongue back, lips round
  u: { f1: 300, f2: 870 },  // "ooo"   — tongue high-back, lips pursed
};

// Formant working ranges (Hz) — also the inversion clamp bounds.
const F1_LO = 250, F1_HI = 900;
const F2_LO = 900, F2_HI = 2800;

const RMS_GATE = 0.012;
const LPC_ORDER = 14;
const ALPHA = 0.15; // articulator smoothing (gentle glide)

// ── Smoother state (module-level; reset on (re)start) ────────────────────────
let smF1 = 500;
let smF2 = 1500;
let smRms = 0;
let lastVowel: VowelId = "a";

export function resetArticulation(): void {
  smF1 = 500;
  smF2 = 1500;
  smRms = 0;
  lastVowel = "a";
}

// ── 1. RMS ────────────────────────────────────────────────────────────────────
function computeRms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

// ── 2+3. Pre-emphasis + Hamming window (into a scratch buffer) ───────────────
function applyWindow(x: Float32Array, out: Float32Array): void {
  const N = x.length;
  // Pre-emphasis y[n] = x[n] - 0.97 x[n-1]
  let prev = x[0];
  for (let n = 0; n < N; n++) {
    const pre = x[n] - 0.97 * prev;
    prev = x[n];
    // Hamming window
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
    out[n] = pre * w;
  }
}

// ── 4. Autocorrelation r[0..order] ───────────────────────────────────────────
function computeAutocorr(x: Float32Array, order: number, r: Float32Array): void {
  const N = x.length;
  for (let lag = 0; lag <= order; lag++) {
    let sum = 0;
    for (let n = lag; n < N; n++) sum += x[n] * x[n - lag];
    r[lag] = sum;
  }
}

// ── 5. Levinson-Durbin recursion → LPC coeffs a[1..order] ────────────────────
// Returns the all-pole denominator coefficients with a[0] = 1 implied.
function runLevinsonDurbin(r: Float32Array, order: number): Float32Array {
  const a = new Float32Array(order + 1);
  a[0] = 1;
  if (r[0] <= 0) return a; // silent / degenerate frame
  let err = r[0];
  const aPrev = new Float32Array(order + 1);

  for (let i = 1; i <= order; i++) {
    // Reflection coefficient k_i
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;

    // Update coefficients
    for (let j = 0; j <= order; j++) aPrev[j] = a[j];
    a[i] = k;
    for (let j = 1; j < i; j++) a[j] = aPrev[j] + k * aPrev[i - j];

    err *= 1 - k * k;
    if (err <= 0) break; // numerical floor
  }
  return a;
}

// ── 6. LPC spectral envelope peak-pick within a band ─────────────────────────
// H(f) = 1 / |A(e^{jw})|, A(z) = 1 + a1 z^-1 + ... + ap z^-p.
// We evaluate |A| on a grid and pick the frequency of MINIMUM |A| (= max gain
// = a formant resonance) inside the band.
function pickFormant(
  a: Float32Array,
  order: number,
  sampleRate: number,
  loHz: number,
  hiHz: number,
  steps: number
): number {
  let bestHz = (loHz + hiHz) / 2;
  let bestMag = Infinity;
  for (let s = 0; s <= steps; s++) {
    const hz = loHz + ((hiHz - loHz) * s) / steps;
    const w = (2 * Math.PI * hz) / sampleRate;
    // Evaluate A(e^{jw}) = sum a[k] e^{-jwk}
    let re = 0;
    let im = 0;
    for (let k = 0; k <= order; k++) {
      re += a[k] * Math.cos(w * k);
      im -= a[k] * Math.sin(w * k);
    }
    const mag = re * re + im * im; // |A|^2 ; minimum => resonance peak of 1/|A|
    if (mag < bestMag) {
      bestMag = mag;
      bestHz = hz;
    }
  }
  return bestHz;
}

// ── 7. Formant → articulation inversion (the heart) ──────────────────────────
function invert(f1: number, f2: number): {
  height: number;
  frontness: number;
  jaw: number;
  round: number;
} {
  const f1n = (clamp(f1, F1_LO, F1_HI) - F1_LO) / (F1_HI - F1_LO); // 0..1
  const f2n = (clamp(f2, F2_LO, F2_HI) - F2_LO) / (F2_HI - F2_LO); // 0..1

  // Tongue HEIGHT ∝ 1/F1: high F1 (/a/) = low tongue; low F1 (/i/,/u/) = high.
  const height = 1 - f1n;
  // Tongue FRONTNESS ∝ F2: high F2 (/i/) = front; low F2 (/u/,/o/) = back.
  const frontness = f2n;
  // JAW open ∝ F1: high F1 (/a/) = wide jaw.
  const jaw = f1n;
  // LIP rounding ∝ low F2: small F2 (/u/,/o/) = pursed. Only when tongue is
  // not high-front (avoids "rounding" a relaxed /a/ edge).
  const round = clamp(1 - f2n, 0, 1);

  return { height, frontness, jaw, round };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Bark-ish perceptual warp for friendlier vowel classification distance.
function bark(hz: number): number {
  return 13 * Math.atan(0.00076 * hz) + 3.5 * Math.atan((hz / 7500) ** 2);
}

function nearestVowel(f1: number, f2: number): VowelId {
  let best: VowelId = "a";
  let bestD = Infinity;
  const f1b = bark(f1), f2b = bark(f2);
  (Object.keys(VOWEL_CENTROIDS) as VowelId[]).forEach((v) => {
    const c = VOWEL_CENTROIDS[v];
    const d = (f1b - bark(c.f1)) ** 2 + 0.7 * (f2b - bark(c.f2)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  });
  return best;
}

// ── Scratch buffers (avoid per-frame allocation) ─────────────────────────────
let scratch: Float32Array | null = null;
const acorr = new Float32Array(LPC_ORDER + 1);

/**
 * Main entry — call every animation frame with a fresh raw time-domain frame
 * (from analyser.getFloatTimeDomainData). Returns the smoothed articulation.
 */
export function computeArticulation(
  timeData: Float32Array,
  sampleRate: number
): Articulation {
  const rms = computeRms(timeData);
  smRms = smRms + 0.22 * (rms - smRms);

  if (smRms < RMS_GATE) {
    const inv = invert(smF1, smF2);
    return {
      f1: smF1, f2: smF2, ...inv, vowel: lastVowel, rms: smRms, active: false,
    };
  }

  if (!scratch || scratch.length !== timeData.length) {
    scratch = new Float32Array(timeData.length);
  }
  applyWindow(timeData, scratch);
  computeAutocorr(scratch, LPC_ORDER, acorr);
  // Tiny white-noise floor / lag-window for numerical stability.
  acorr[0] *= 1.0001;
  const a = runLevinsonDurbin(acorr, LPC_ORDER);

  const rawF1 = pickFormant(a, LPC_ORDER, sampleRate, F1_LO, F1_HI, 220);
  const rawF2 = pickFormant(a, LPC_ORDER, sampleRate, F2_LO, F2_HI, 320);

  smF1 = smF1 + ALPHA * (rawF1 - smF1);
  smF2 = smF2 + ALPHA * (rawF2 - smF2);

  const inv = invert(smF1, smF2);
  lastVowel = nearestVowel(smF1, smF2);

  return {
    f1: smF1, f2: smF2, ...inv, vowel: lastVowel, rms: smRms, active: true,
  };
}

// ── Friendly labels + attract-mode reference poses ───────────────────────────
export const VOWEL_LABELS: Record<VowelId, string> = {
  a: "aaah", e: "ehh", i: "eee", o: "ohh", u: "ooo",
};

/** Reference (F1,F2) used by attract mode to drive the head hands-free. */
export const VOWEL_REF: Record<VowelId, { f1: number; f2: number }> =
  VOWEL_CENTROIDS;

export const ATTRACT_SEQUENCE: VowelId[] = ["a", "e", "i", "o", "u"];

/** Pure formant→articulation for attract/demo mode (no smoothing state). */
export function articulationFromFormants(f1: number, f2: number) {
  return { f1, f2, ...invert(f1, f2), vowel: nearestVowel(f1, f2) };
}
