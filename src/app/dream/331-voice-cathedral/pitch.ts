// ─────────────────────────────────────────────────────────────────────────────
// pitch.ts — a small YIN-style autocorrelation pitch detector.
//
// Pipeline (the classic YIN, condensed):
//   1. squared difference function d(τ) over the time-domain frame
//   2. cumulative-mean-normalized difference d'(τ)
//   3. absolute threshold (~0.12) → first dip below threshold
//   4. parabolic interpolation around that dip for sub-bin accuracy
//
// Plus a tiny median tracker (window ~5) to suppress octave jumps / outliers.
//
// Everything here is analysis-only: it reads a Float32Array of samples and
// returns a frequency (Hz) or null. No audio is recorded, stored, or sent.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD = 0.12;

// Difference function d(τ) — sum of squared differences for each lag τ.
function difference(buf: Float32Array, maxLag: number): Float32Array {
  const d = new Float32Array(maxLag);
  const n = buf.length;
  for (let lag = 0; lag < maxLag; lag++) {
    let sum = 0;
    const limit = n - lag;
    for (let i = 0; i < limit; i++) {
      const delta = buf[i] - buf[i + lag];
      sum += delta * delta;
    }
    d[lag] = sum;
  }
  return d;
}

// Cumulative-mean-normalized difference d'(τ).
function cumulativeMeanNormalize(d: Float32Array): Float32Array {
  const out = new Float32Array(d.length);
  out[0] = 1;
  let running = 0;
  for (let lag = 1; lag < d.length; lag++) {
    running += d[lag];
    out[lag] = running === 0 ? 1 : (d[lag] * lag) / running;
  }
  return out;
}

// Find the first τ where d'(τ) dips below the absolute threshold, then descend
// to the local minimum of that dip.
function absoluteThreshold(dPrime: Float32Array, threshold: number): number {
  for (let lag = 2; lag < dPrime.length; lag++) {
    if (dPrime[lag] < threshold) {
      let t = lag;
      while (t + 1 < dPrime.length && dPrime[t + 1] < dPrime[t]) t++;
      return t;
    }
  }
  return -1;
}

// Parabolic interpolation around the chosen lag for sub-sample precision.
function parabolicInterpolate(dPrime: Float32Array, tau: number): number {
  if (tau <= 0 || tau >= dPrime.length - 1) return tau;
  const x0 = dPrime[tau - 1];
  const x1 = dPrime[tau];
  const x2 = dPrime[tau + 1];
  const denom = x0 + x2 - 2 * x1;
  if (denom === 0) return tau;
  return tau + (x0 - x2) / (2 * denom);
}

// Rough RMS so silence / breath noise doesn't yield phantom pitches.
function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export interface DetectOptions {
  sampleRate: number;
  threshold?: number;
  minHz?: number;
  maxHz?: number;
  rmsGate?: number;
}

// Detect the fundamental frequency of a time-domain frame. Returns Hz or null.
export function detectPitch(
  buf: Float32Array,
  opts: DetectOptions,
): number | null {
  const {
    sampleRate,
    threshold = DEFAULT_THRESHOLD,
    minHz = 60,
    maxHz = 1200,
    rmsGate = 0.01,
  } = opts;

  if (rms(buf) < rmsGate) return null;

  const maxLag = Math.min(
    Math.floor(sampleRate / minHz),
    Math.floor(buf.length / 2),
  );
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  if (maxLag <= minLag) return null;

  const d = difference(buf, maxLag);
  const dPrime = cumulativeMeanNormalize(d);
  const tau = absoluteThreshold(dPrime, threshold);
  if (tau < minLag) return null;

  const betterTau = parabolicInterpolate(dPrime, tau);
  const hz = sampleRate / betterTau;
  if (hz < minHz || hz > maxHz || !isFinite(hz)) return null;
  return hz;
}

// ── median tracker ───────────────────────────────────────────────────────────
// A short sliding window whose median we report — kills single-frame octave
// jumps and outliers without the lag of a heavy average.
export class MedianTracker {
  private window: number[] = [];
  private readonly size: number;

  constructor(size = 5) {
    this.size = Math.max(1, size | 0);
  }

  push(value: number): number {
    this.window.push(value);
    if (this.window.length > this.size) this.window.shift();
    const sorted = [...this.window].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  reset(): void {
    this.window = [];
  }

  get length(): number {
    return this.window.length;
  }
}
