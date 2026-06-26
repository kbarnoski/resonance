// pitch.ts — real-time monophonic pitch detection for a child's hum.
//
// Method: the Normalized Square Difference Function (NSDF), the core of the
// McLeod Pitch Method (P. McLeod & G. Wyvill, "A Smarter Way to Find Pitch",
// ICMC 2005). NSDF is a normalized autocorrelation that is robust at low
// amplitude and gives a clarity score in [0,1] we can gate on so that room
// noise and consonants don't trigger a note.
//
// Kid voices skew high and wobbly, so after detection we EMA-smooth the
// frequency and apply a small hysteresis on the snapped note (handled by the
// caller) so the choir doesn't flicker between adjacent scale degrees.

export interface PitchResult {
  /** Detected fundamental in Hz, or null if no confident pitch. */
  hz: number | null;
  /** NSDF peak clarity in [0,1]; higher = more tonal / less noisy. */
  clarity: number;
  /** RMS loudness in [0,1]-ish, used to open creature mouths. */
  rms: number;
}

const MIN_HZ = 80; // below a low kid voice
const MAX_HZ = 800; // kid hums skew high; cap generously
const CLARITY_THRESHOLD = 0.9; // NSDF peak must be this tonal to count
const RMS_GATE = 0.01; // ignore near-silence

/**
 * Run NSDF pitch detection over a time-domain buffer (Float32, -1..1) at the
 * given sample rate. Returns the best fundamental + a clarity score.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): PitchResult {
  const n = buf.length;

  // RMS / loudness.
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i];
  const rms = Math.sqrt(sumSq / n);
  if (rms < RMS_GATE) {
    return { hz: null, clarity: 0, rms };
  }

  const maxLag = Math.min(n - 1, Math.floor(sampleRate / MIN_HZ));
  const minLag = Math.max(1, Math.floor(sampleRate / MAX_HZ));

  // NSDF: for each lag tau, n'(tau) = 2*r(tau) / m(tau), where r is the
  // autocorrelation and m is the sum of squared terms in the overlap window.
  const nsdf = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let acf = 0;
    let div = 0;
    for (let i = 0; i + tau < n; i++) {
      acf += buf[i] * buf[i + tau];
      div += buf[i] * buf[i] + buf[i + tau] * buf[i + tau];
    }
    nsdf[tau] = div > 0 ? (2 * acf) / div : 0;
  }

  // Peak picking: find the first major positive peak after the function rises
  // back above zero. We collect local maxima between positive-going zero
  // crossings, then take the one closest to the global max (within a threshold)
  // — McLeod's rule that defeats octave errors.
  const peaks: { lag: number; val: number }[] = [];
  let pos = false;
  let curMaxLag = -1;
  let curMaxVal = -Infinity;
  for (let tau = minLag; tau <= maxLag; tau++) {
    const v = nsdf[tau];
    if (!pos && v > 0) {
      pos = true;
      curMaxLag = tau;
      curMaxVal = v;
    } else if (pos && v > curMaxVal) {
      curMaxVal = v;
      curMaxLag = tau;
    }
    if (pos && v < 0) {
      if (curMaxLag >= 0) peaks.push({ lag: curMaxLag, val: curMaxVal });
      pos = false;
      curMaxVal = -Infinity;
      curMaxLag = -1;
    }
  }
  if (pos && curMaxLag >= 0) peaks.push({ lag: curMaxLag, val: curMaxVal });

  if (peaks.length === 0) {
    return { hz: null, clarity: 0, rms };
  }

  // Global max value among peaks; accept the first peak within k of it.
  let globalMax = 0;
  for (const p of peaks) if (p.val > globalMax) globalMax = p.val;
  const k = 0.9; // McLeod constant: accept earliest strong peak
  const threshold = k * globalMax;
  let chosen = peaks[0];
  for (const p of peaks) {
    if (p.val >= threshold) {
      chosen = p;
      break;
    }
  }

  const clarity = chosen.val;
  if (clarity < CLARITY_THRESHOLD) {
    return { hz: null, clarity, rms };
  }

  // Parabolic interpolation around the chosen lag for sub-sample accuracy.
  const lag = chosen.lag;
  const y0 = nsdf[lag - 1] ?? chosen.val;
  const y1 = chosen.val;
  const y2 = nsdf[lag + 1] ?? chosen.val;
  const denom = 2 * (y0 - 2 * y1 + y2);
  const shift = denom !== 0 ? (y0 - y2) / denom : 0;
  const refinedLag = lag + shift;

  const hz = sampleRate / refinedLag;
  if (hz < MIN_HZ || hz > MAX_HZ || !Number.isFinite(hz)) {
    return { hz: null, clarity, rms };
  }
  return { hz, clarity, rms };
}

/**
 * Exponential moving-average smoother for the detected frequency. A wobbly
 * 4-year-old hum bounces around; this damps it so a held note reads as stable.
 * Holds the last value through brief dropouts (null) for `holdFrames`.
 */
export class PitchSmoother {
  private value: number | null = null;
  private holdLeft = 0;
  constructor(
    private readonly alpha = 0.25,
    private readonly holdFrames = 8,
  ) {}

  push(hz: number | null): number | null {
    if (hz == null) {
      if (this.holdLeft > 0) {
        this.holdLeft--;
        return this.value;
      }
      this.value = null;
      return null;
    }
    this.holdLeft = this.holdFrames;
    if (this.value == null) {
      this.value = hz;
    } else {
      // If the new reading is ~an octave off (common detection error), nudge
      // gently rather than jumping — keeps the lead from flickering octaves.
      const ratio = hz / this.value;
      if (ratio > 1.8 && ratio < 2.2) hz = hz / 2;
      else if (ratio < 0.55 && ratio > 0.45) hz = hz * 2;
      this.value = this.alpha * hz + (1 - this.alpha) * this.value;
    }
    return this.value;
  }

  reset() {
    this.value = null;
    this.holdLeft = 0;
  }
}
