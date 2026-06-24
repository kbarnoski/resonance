"use client";

/**
 * Real-time fundamental-frequency estimation for the "sing a path" prototype.
 *
 * DESIGN LAW (PESTO, arXiv 2508.01488): pitch CONTOUR — relative up/down/hold
 * motion — is robust and meaningful; absolute pitch is not. So the estimator
 * here only needs to be good enough to recover the *shape* of a child's
 * singing. We use a normalized-square-difference (YIN-lite / NSDF) detector in
 * the time domain. It is forgiving, cheap, and stable for sung vowels.
 *
 * RESEARCH §532 (2026-06-24) — PESTO transposition-equivariant real-time pitch
 * (arXiv 2508.01488): track contour, not absolute pitch.
 */

export interface PitchFrame {
  /** Estimated fundamental in Hz, or 0 when no confident pitch. */
  hz: number;
  /** Detector confidence 0..1 (NSDF peak clarity). */
  clarity: number;
  /** Root-mean-square loudness 0..1 — quiet = no draw. */
  rms: number;
}

const MIN_HZ = 80; // below a child's comfortable low sung note
const MAX_HZ = 1100; // above a child's excited squeal

/**
 * Estimate pitch from a window of time-domain samples using a normalized
 * square difference function (the core of the McLeod / YIN family).
 *
 * Returns hz=0 when the signal is too quiet or no clear period is found —
 * callers treat that as "hold / no new draw".
 */
export function trackPitch(buf: Float32Array, sampleRate: number): PitchFrame {
  const n = buf.length;

  // --- Loudness (RMS) ---
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i];
  const rms = Math.sqrt(sumSq / n);

  // Too quiet to be a sung note — bail early (this is the "quiet = no draw"
  // gate). 0.01 RMS is roughly a soft hum at mic distance.
  if (rms < 0.01) {
    return { hz: 0, clarity: 0, rms };
  }

  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_HZ), Math.floor(n / 2));

  // --- Normalized square difference function (NSDF) ---
  // nsdf(lag) = 2 * sum(x[i]*x[i+lag]) / sum(x[i]^2 + x[i+lag]^2)
  // We find the first strong peak after the initial zero-lag region.
  let bestLag = -1;
  let bestVal = 0;

  let prev = 0;
  let prevPrev = 0;
  let rising = false;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf = 0; // autocorrelation numerator
    let energy = 0; // normalizing denominator
    for (let i = 0; i < n - lag; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      acf += a * b;
      energy += a * a + b * b;
    }
    const nsdf = energy > 0 ? (2 * acf) / energy : 0;

    // Track local maxima of the NSDF. We want the first peak that crosses a
    // clarity threshold — that corresponds to the fundamental period.
    if (rising && nsdf < prev && prev > 0.4) {
      // prevPrev < prev > nsdf  → local max at (lag-1)
      // Parabolic interpolation around the peak for sub-sample accuracy.
      const a = prevPrev;
      const b = prev;
      const c = nsdf;
      const denom = a - 2 * b + c;
      const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
      const peakLag = lag - 1 + shift;
      if (prev > bestVal) {
        bestVal = prev;
        bestLag = peakLag;
      }
      // First clear peak wins — children's vowels are stable enough.
      if (prev > 0.8) break;
    }
    rising = nsdf > prev;
    prevPrev = prev;
    prev = nsdf;
  }

  if (bestLag <= 0) {
    return { hz: 0, clarity: 0, rms };
  }

  const hz = sampleRate / bestLag;
  if (hz < MIN_HZ || hz > MAX_HZ) {
    return { hz: 0, clarity: bestVal, rms };
  }

  return { hz, clarity: bestVal, rms };
}

/**
 * Exponential pitch smoother that works in the log (musical) domain, so a
 * jump from 200→400 Hz (one octave) smooths the same as 400→800. Keeps the
 * drawn contour calm without lagging a child's playful swoops too much.
 */
export class PitchSmoother {
  private value = 0; // smoothed log2(hz), 0 = silent
  private readonly alpha: number;

  constructor(alpha = 0.25) {
    this.alpha = alpha;
  }

  /** Feed a new hz (0 = no pitch). Returns smoothed hz (0 while silent). */
  push(hz: number): number {
    if (hz <= 0) {
      // Decay confidence toward silence but keep last value briefly so short
      // consonant gaps don't snap the line. We simply hold the value.
      return this.value > 0 ? Math.pow(2, this.value) : 0;
    }
    const target = Math.log2(hz);
    if (this.value === 0) {
      this.value = target;
    } else {
      this.value = this.value * (1 - this.alpha) + target * this.alpha;
    }
    return Math.pow(2, this.value);
  }

  /** Force-reset (e.g. on a long silence) so the next note starts fresh. */
  reset() {
    this.value = 0;
  }
}

/**
 * Contour-relative engine. THIS is the PESTO insight in code: we do not care
 * what absolute note the child hit. We track a slow-moving baseline (their
 * "center" pitch) and report how far ABOVE or BELOW that center they are right
 * now, normalized to roughly [-1, 1]. A child singing in any key, in or out of
 * tune, produces the same expressive rising/falling path.
 */
export class ContourEngine {
  private baseline = 0; // log2(hz), slow EMA = the child's drifting center
  private readonly baselineAlpha: number;
  /** Half the vertical range, in octaves. ~0.6 octave swing fills the screen. */
  private readonly span: number;

  constructor(baselineAlpha = 0.012, spanOctaves = 0.6) {
    this.baselineAlpha = baselineAlpha;
    this.span = spanOctaves;
  }

  /**
   * Map a smoothed hz to a contour height in [-1, 1] where +1 = high (top of
   * screen) and -1 = low. Returns null when silent (nothing to draw).
   */
  height(hz: number): number | null {
    if (hz <= 0) return null;
    const l = Math.log2(hz);
    if (this.baseline === 0) {
      this.baseline = l;
      return 0;
    }
    const rel = (l - this.baseline) / this.span; // octaves above/below center
    // Drift the baseline slowly toward the current pitch so the child can
    // wander up and the path re-centers — keeps them on-screen forever.
    this.baseline = this.baseline * (1 - this.baselineAlpha) + l * this.baselineAlpha;
    return Math.max(-1, Math.min(1, rel));
  }

  reset() {
    this.baseline = 0;
  }
}
