// features.ts — the "ear" the search listens through.
//
// Everything here is analytic and allocation-light so a whole population of
// candidate synths can be scored per generation without touching Web Audio.
// The pipeline mirrors the DDSP idea (Engel et al., ICLR 2020): describe a
// synth by a compact spectral feature vector, then measure timbral distance
// as a spectral loss between candidate and target.

import { type SynthParams } from "./synth";

/** Number of log-spaced analysis bins (a coarse mel-ish spectrum). */
export const N_BINS = 48;
const F_LO = 55;
const F_HI = 9500;

/** Center frequency (Hz) of each log-spaced bin. */
export const BIN_HZ: Float32Array = (() => {
  const a = new Float32Array(N_BINS);
  const lo = Math.log(F_LO);
  const hi = Math.log(F_HI);
  for (let i = 0; i < N_BINS; i++) {
    a[i] = Math.exp(lo + ((hi - lo) * i) / (N_BINS - 1));
  }
  return a;
})();

/** Each bin's normalized log-frequency position in [0,1] — the x/y timbre
 *  coordinate axis. */
export const BIN_POS: Float32Array = (() => {
  const a = new Float32Array(N_BINS);
  const lo = Math.log(F_LO);
  const hi = Math.log(F_HI);
  for (let i = 0; i < N_BINS; i++) a[i] = (Math.log(BIN_HZ[i]) - lo) / (hi - lo);
  return a;
})();

function binIndexOf(hz: number): number {
  if (hz <= F_LO) return 0;
  if (hz >= F_HI) return N_BINS - 1;
  const lo = Math.log(F_LO);
  const hi = Math.log(F_HI);
  const t = (Math.log(hz) - lo) / (hi - lo);
  return Math.round(t * (N_BINS - 1));
}

/** Bessel function of the first kind J_k(x) via its ascending series —
 *  stable and cheap for the x∈[0,9] range the modulation index spans. FM
 *  sideband amplitudes are J_k(index) (Chowning 1973). */
function besselJ(k: number, x: number): number {
  const hx = x * 0.5;
  let t = 1;
  for (let i = 1; i <= k; i++) t *= hx / i; // (x/2)^k / k!
  let sum = t;
  const h2 = hx * hx;
  for (let m = 1; m < 40; m++) {
    t *= -h2 / (m * (m + k));
    sum += t;
    if (Math.abs(t) < 1e-12) break;
  }
  return sum;
}

/** Squared magnitude of an analog 2-pole resonant lowpass at frequency f. */
function lowpassMag2(f: number, cutoff: number, q: number): number {
  const r = f / cutoff;
  const r2 = r * r;
  const denom = (1 - r2) * (1 - r2) + (r2 / (q * q));
  return 1 / Math.max(denom, 1e-9);
}

const K_SIDE = 12; // sidebands each side of the carrier

/** Analytic magnitude-squared spectrum of an FM patch, binned into the
 *  log-spaced analysis bands. Returns per-bin energy. */
export function fmBins(p: SynthParams, out?: Float32Array): Float32Array {
  const bins = out ?? new Float32Array(N_BINS);
  bins.fill(0);
  const fm = p.f0 * p.ratio;
  // Precompute |J_k(index)| for k = 0..K_SIDE.
  for (let k = 0; k <= K_SIDE; k++) {
    const amp = besselJ(k, p.index);
    const a2 = amp * amp;
    if (a2 < 1e-7 && k > 0) continue;
    // Upper and lower sidebands: fc ± k·fm (k=0 is the carrier, once).
    const sides = k === 0 ? [p.f0] : [p.f0 + k * fm, p.f0 - k * fm];
    for (const f of sides) {
      if (f <= 0 || f >= F_HI) continue;
      const e = a2 * lowpassMag2(f, p.cutoff, p.q);
      bins[binIndexOf(f)] += e;
    }
  }
  return bins;
}

/** Convert per-bin energy to a peak-normalized log (dB-ish) profile in
 *  [0,1], discarding overall loudness so the loss compares timbre shape. */
export function normDb(bins: Float32Array, out?: Float32Array): Float32Array {
  const db = out ?? new Float32Array(N_BINS);
  let max = -Infinity;
  for (let i = 0; i < N_BINS; i++) {
    const d = 10 * Math.log10(bins[i] + 1e-9);
    db[i] = d;
    if (d > max) max = d;
  }
  const FLOOR = 60;
  for (let i = 0; i < N_BINS; i++) {
    const v = (db[i] - max + FLOOR) / FLOOR;
    db[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return db;
}

/** Multi-scale spectral loss between two normalized-dB profiles: mean
 *  squared error. Lower = timbrally closer. */
export function spectralLoss(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < N_BINS; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / N_BINS;
}

/** Project a spectrum to the 2-D timbre plane the swarm lives in:
 *  x = spectral centroid, y = spectral spread (bandwidth), both in [0,1]. */
export function projectBins(bins: Float32Array): { x: number; y: number } {
  let e = 0;
  let cen = 0;
  for (let i = 0; i < N_BINS; i++) {
    e += bins[i];
    cen += bins[i] * BIN_POS[i];
  }
  if (e <= 1e-9) return { x: 0.5, y: 0.5 };
  cen /= e;
  let varr = 0;
  for (let i = 0; i < N_BINS; i++) {
    const d = BIN_POS[i] - cen;
    varr += bins[i] * d * d;
  }
  const spread = Math.sqrt(varr / e);
  return { x: cen, y: Math.min(1, spread * 2.4) };
}

/** Resample a linear-frequency magnitude spectrum (e.g. from an
 *  AnalyserNode, `mag[i]` at frequency i·binHz) into our log bins. Used for
 *  mic input so real and analytic targets share one representation. */
export function resampleLinearToBins(
  mag: Float32Array,
  binHz: number,
  out?: Float32Array,
): Float32Array {
  const bins = out ?? new Float32Array(N_BINS);
  bins.fill(0);
  const counts = new Float32Array(N_BINS);
  for (let i = 1; i < mag.length; i++) {
    const f = i * binHz;
    if (f < F_LO || f > F_HI) continue;
    const idx = binIndexOf(f);
    bins[idx] += mag[i] * mag[i];
    counts[idx] += 1;
  }
  for (let i = 0; i < N_BINS; i++) if (counts[i] > 0) bins[i] /= counts[i];
  return bins;
}
