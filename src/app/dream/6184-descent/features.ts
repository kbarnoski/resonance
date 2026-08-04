// features.ts — the ear the descent listens through.
//
// Everything is analytic and allocation-light so the loss can be evaluated
// thousands of times per frame (a whole 2-D loss landscape, plus finite-
// difference gradients). The pipeline follows DDSP (Engel et al., ICLR 2020):
// describe a timbre by a compact log-band magnitude spectrum, then measure
// distance as a spectral loss. The SAME representation is used for the
// analytic FM synth and for the live mic, so target and chaser are comparable.

import { type SynthParams } from "./synth";

/** Number of log-spaced analysis bins (a coarse mel-ish spectrum). */
export const N_BINS = 48;
const F_LO = 55;
const F_HI = 9500;

const LOG_LO = Math.log(F_LO);
const LOG_HI = Math.log(F_HI);

/** Normalized log-frequency position in [0,1] of each bin. */
export const BIN_POS: Float32Array = (() => {
  const a = new Float32Array(N_BINS);
  for (let i = 0; i < N_BINS; i++) a[i] = i / (N_BINS - 1);
  return a;
})();

function binIndexOf(hz: number): number {
  if (hz <= F_LO) return 0;
  if (hz >= F_HI) return N_BINS - 1;
  const t = (Math.log(hz) - LOG_LO) / (LOG_HI - LOG_LO);
  return Math.round(t * (N_BINS - 1));
}

/** Bessel function of the first kind J_k(x) via its ascending series — stable
 *  and cheap on the x∈[0,8] range the modulation index spans. FM sideband
 *  amplitudes are J_k(index) (Chowning 1973), which gives the loss landscape
 *  its rippled, genuinely non-convex structure. */
function besselJ(k: number, x: number): number {
  const hx = x * 0.5;
  let t = 1;
  for (let i = 1; i <= k; i++) t *= hx / i;
  let sum = t;
  const h2 = hx * hx;
  for (let m = 1; m < 36; m++) {
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
  const denom = (1 - r2) * (1 - r2) + r2 / (q * q);
  return 1 / Math.max(denom, 1e-9);
}

const K_SIDE = 11; // sidebands each side of the carrier

/** Analytic magnitude-squared spectrum of the FM patch, binned into the
 *  log-spaced bands. Writes per-bin energy into `out`. */
export function fmBins(p: SynthParams, out: Float32Array): Float32Array {
  out.fill(0);
  const fm = p.f0 * p.ratio;
  for (let k = 0; k <= K_SIDE; k++) {
    const amp = besselJ(k, p.index);
    const a2 = amp * amp;
    if (a2 < 1e-7 && k > 0) continue;
    if (k === 0) {
      out[binIndexOf(p.f0)] += a2 * lowpassMag2(p.f0, p.cutoff, p.q);
    } else {
      const up = p.f0 + k * fm;
      const dn = p.f0 - k * fm;
      if (up > 0 && up < F_HI) out[binIndexOf(up)] += a2 * lowpassMag2(up, p.cutoff, p.q);
      if (dn > 0 && dn < F_HI) out[binIndexOf(dn)] += a2 * lowpassMag2(dn, p.cutoff, p.q);
    }
  }
  return out;
}

/** Convert per-bin energy to a peak-normalized log (dB-ish) profile in [0,1],
 *  discarding overall loudness so the loss compares timbre SHAPE, not level. */
export function normDb(bins: Float32Array, out: Float32Array): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < N_BINS; i++) {
    const d = 10 * Math.log10(bins[i] + 1e-9);
    out[i] = d;
    if (d > max) max = d;
  }
  const FLOOR = 60;
  for (let i = 0; i < N_BINS; i++) {
    const v = (out[i] - max + FLOOR) / FLOOR;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

/** Spectral loss between two normalized-dB profiles: mean squared error.
 *  Lower = timbrally closer. This scalar is the height the point descends. */
export function spectralLoss(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < N_BINS; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / N_BINS;
}

const specScratch = new Float32Array(N_BINS);

/** Convenience: normalized-dB spectrum for a set of synth params, into `out`.
 *  Used for the synthetic-singer target (the descent has its own scratch). */
export function spectrumOf(p: SynthParams, out: Float32Array): Float32Array {
  fmBins(p, specScratch);
  return normDb(specScratch, out);
}

/** A small, normalized feature vector for the HUD / readout — centroid,
 *  spread (bandwidth), flatness (noise-vs-tone), rms. Computed from a
 *  normalized-dB profile. */
export interface Features {
  centroid: number;
  spread: number;
  flatness: number;
  rms: number;
}

export function featuresOf(db: Float32Array): Features {
  let e = 0;
  let cen = 0;
  let logSum = 0;
  let sum = 0;
  for (let i = 0; i < N_BINS; i++) {
    const v = db[i];
    e += v;
    cen += v * BIN_POS[i];
    logSum += Math.log(v + 1e-4);
    sum += v;
  }
  if (e <= 1e-6) return { centroid: 0.5, spread: 0, flatness: 0, rms: 0 };
  cen /= e;
  let varr = 0;
  for (let i = 0; i < N_BINS; i++) {
    const d = BIN_POS[i] - cen;
    varr += db[i] * d * d;
  }
  const spread = Math.min(1, Math.sqrt(varr / e) * 2.4);
  const geo = Math.exp(logSum / N_BINS);
  const arith = sum / N_BINS + 1e-4;
  const flatness = Math.min(1, geo / arith);
  const rms = Math.min(1, sum / N_BINS);
  return { centroid: cen, spread, flatness, rms };
}

/** Resample a linear-frequency magnitude spectrum (from an AnalyserNode,
 *  `mag[i]` the magnitude at frequency i·binHz) into our log bands, so live
 *  mic input and the analytic synth share one representation. */
export function resampleLinearToBins(
  mag: Float32Array,
  binHz: number,
  out: Float32Array,
): Float32Array {
  out.fill(0);
  const counts = new Float32Array(N_BINS);
  for (let i = 1; i < mag.length; i++) {
    const f = i * binHz;
    if (f < F_LO || f > F_HI) continue;
    const idx = binIndexOf(f);
    out[idx] += mag[i] * mag[i];
    counts[idx] += 1;
  }
  for (let i = 0; i < N_BINS; i++) if (counts[i] > 0) out[i] /= counts[i];
  return out;
}
