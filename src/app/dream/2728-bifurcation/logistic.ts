// ════════════════════════════════════════════════════════════════════════════
// LOGISTIC MAP CORE (2728-bifurcation)
//
// x_{n+1} = r · x_n · (1 − x_n)   — Robert May, Nature (1976).
//
// As the control parameter r rises from ~2.8 → 4.0 the map undergoes the
// period-doubling cascade: one fixed point → 2-cycle → 4 → 8 → … → chaos
// (accumulating at the Feigenbaum rate δ ≈ 4.669), then chaotic bands shot
// through with clean periodic windows (the famous period-3 near r ≈ 3.83).
//
// Pure functions — no React, no audio, no canvas. Sonified in audio.ts and
// drawn in viz.ts.
// ════════════════════════════════════════════════════════════════════════════

export const R_MIN = 2.8;
export const R_MAX = 4.0;

/** One iterate of the logistic map. */
export function stepLogistic(x: number, r: number): number {
  return r * x * (1 - x);
}

export interface Attractor {
  /** distinct settled x-values (ascending) the orbit lands on */
  points: number[];
  /** detected period: 1,2,4,8,3,… ; 0 = chaotic / aperiodic cloud */
  period: number;
}

/**
 * Determine the current attractor. Iterate from a fixed seed, discard the
 * transient, then collect the settled orbit and count distinct values within
 * a tolerance. A short list of distinct values ⇒ a p-cycle; a dense cloud ⇒
 * chaos (period 0).
 */
export function computeAttractor(
  r: number,
  transient = 800,
  sample = 400,
  tol = 0.0018,
): Attractor {
  let x = 0.5;
  for (let i = 0; i < transient; i++) x = r * x * (1 - x);
  const vals: number[] = [];
  for (let i = 0; i < sample; i++) {
    x = r * x * (1 - x);
    vals.push(x);
  }
  const sorted = vals.slice().sort((a, b) => a - b);
  const distinct: number[] = [];
  for (const v of sorted) {
    if (distinct.length === 0 || v - distinct[distinct.length - 1] > tol) {
      distinct.push(v);
    }
  }
  const period = distinct.length <= 16 ? distinct.length : 0;
  return { points: distinct, period };
}

/**
 * Raw settled orbit for plotting one vertical column of the bifurcation
 * diagram at a given r. Returns the cloud of visited x-values (dense in the
 * chaotic zone, tight in a periodic window).
 */
export function sampleOrbit(
  r: number,
  transient = 350,
  count = 360,
): Float32Array {
  let x = 0.5;
  for (let i = 0; i < transient; i++) x = r * x * (1 - x);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    x = r * x * (1 - x);
    out[i] = x;
  }
  return out;
}
