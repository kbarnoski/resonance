// ─────────────────────────────────────────────────────────────────────────────
// 11776-lissaknot · pitch.ts — a lightweight in-browser fundamental-pitch
// estimator (YIN-lite) plus the harmonic-ratio LOCK.
//
//   estimatePitch() runs a small YIN cumulative-mean-normalized difference
//   function over a time-domain window and returns {freq, clarity}. It is the
//   real-time pitch estimate that CRYSTALLIZES a held note into a stable knot —
//   in the spirit of PESTO real-time pitch estimation (arXiv:2508.01488),
//   scaled down to a few thousand ops so it runs every frame in a phone browser.
//
//   quantizeRatio() takes the sung frequency over the drone root and, when the
//   pitch is clear and steady, SNAPS the ratio to the nearest simple integer
//   ratio (an octave, a fifth, a fourth …) so the X-Y Lissajous figure locks
//   into a clean, classic multi-lobe knot. Uncertain pitch → the true detuned
//   ratio is drawn instead, so the figure precesses and scribbles until you
//   commit to a note.
// ─────────────────────────────────────────────────────────────────────────────

import { clamp } from "./prng";

export interface Pitch {
  /** Estimated fundamental in Hz. */
  freq: number;
  /** 0..1 confidence — how periodic the window is (1 = a pure held tone). */
  clarity: number;
}

const MIN_HZ = 75; // lowest fundamental we track (a low male vowel)
const MAX_HZ = 1000; // highest (a high sung note / whistle-ish)
const YIN_THRESHOLD = 0.15;

/** YIN-lite fundamental estimate over a time-domain buffer (values ~[-1,1]).
 *  Returns null on silence / no clear period. */
export function estimatePitch(buf: Float32Array, sampleRate: number): Pitch | null {
  const n = buf.length;
  // Only look at the first half so tau + i stays in-bounds.
  const w = n >> 1;

  // Gate on RMS — don't chase noise in a silent room.
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.004) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  const tauMax = Math.min(w - 1, Math.ceil(sampleRate / MIN_HZ));
  if (tauMax <= tauMin) return null;

  // Difference function d(tau) = Σ (x[i] - x[i+tau])²
  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalized difference (the YIN trick).
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[tauMin] = 1;
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * (tau - tauMin + 1)) / running : 1;
  }

  // First tau under threshold that is a local minimum, else the global min.
  let best = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD && cmnd[tau] <= cmnd[tau + 1]) {
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let min = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau] < min) {
        min = cmnd[tau];
        best = tau;
      }
    }
    if (best < 0 || min > 0.6) return null; // too aperiodic to call a pitch
  }

  // Parabolic interpolation around the dip for a sub-sample period.
  let tau = best;
  if (best > tauMin && best < tauMax) {
    const a = cmnd[best - 1];
    const b = cmnd[best];
    const c = cmnd[best + 1];
    const denom = a + c - 2 * b;
    if (Math.abs(denom) > 1e-9) tau = best + (0.5 * (a - c)) / denom;
  }

  const freq = sampleRate / tau;
  if (freq < MIN_HZ || freq > MAX_HZ) return null;

  const clarity = clamp(1 - cmnd[best], 0, 1);
  return { freq, clarity };
}

export interface Ratio {
  /** X-axis (reference / drone root) integer multiplier. */
  den: number;
  /** Y-axis (sung partial) integer multiplier of the locked ratio. */
  num: number;
  /** Left-over detune added to num when the pitch has NOT snapped. */
  detune: number;
  /** 0..1 — how firmly the figure is locked to a clean knot. */
  lock: number;
}

/** Fold a raw frequency ratio into [0.5, 4] by octaves so any sung register
 *  maps onto the same small family of knots. */
function foldRatio(r: number): number {
  let x = r;
  while (x > 4) x *= 0.5;
  while (x < 0.5) x *= 2;
  return x;
}

/** Nearest simple fraction num/den (both small) to a folded ratio. */
function nearestFraction(r: number): { num: number; den: number; err: number } {
  let best = { num: 1, den: 1, err: Infinity };
  for (let den = 1; den <= 6; den++) {
    const num = Math.round(r * den);
    if (num < 1 || num > 8) continue;
    const err = Math.abs(r - num / den);
    // Prefer smaller denominators (simpler, more legible knots).
    const score = err + den * 0.0008;
    if (score < best.err) best = { num, den, err };
  }
  return best;
}

/** Turn a sung frequency (over the drone root) + clarity into a Lissajous
 *  ratio, snapping to a clean integer ratio when the note is held clearly. */
export function quantizeRatio(sungFreq: number, rootFreq: number, clarity: number): Ratio {
  const folded = foldRatio(sungFreq / rootFreq);
  const { num, den, err } = nearestFraction(folded);
  // Closeness: within ~6% of a simple ratio counts as "on the note".
  const closeness = clamp(1 - err / 0.06, 0, 1);
  const lock = clamp(clarity * closeness, 0, 1);
  // True (detuned) offset from the snapped ratio, faded out as the note locks.
  const detune = (folded - num / den) * den * (1 - lock);
  return { num, den, detune, lock };
}
