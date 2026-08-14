// ─────────────────────────────────────────────────────────────────────────────
// 11776-lissaknot · beam.ts — the electron-beam PATH generator.
//
//   The X-Y vector-scope traces a Lissajous figure: X deflection oscillates at
//   the reference (drone-root) rate, Y at the sung-partial rate. A held note
//   whose ratio has snapped to small integers closes into a clean loop; a
//   detuned / unlocked ratio precesses over several turns into a living
//   scribble. A gentle harmonic-enrichment term (driven by vocal brightness)
//   folds the plain ellipse into an ornate KNOT — the "drawn sound" look.
//
//   buildBeamPath fills a flat [x0,y0,x1,y1,…] array in normalized scope space
//   (roughly [-1,1]) and returns the sample COUNT actually written. The CPU
//   owns this curve; the GPU (gl.ts) only draws it additively over a fade trail.
// ─────────────────────────────────────────────────────────────────────────────

import { clamp } from "./prng";

export interface BeamShape {
  /** X-axis integer multiplier (reference rate). */
  den: number;
  /** Y-axis integer multiplier (sung-partial rate). */
  num: number;
  /** Detune added to the Y multiplier when unlocked → precession. */
  detune: number;
  /** Relative phase δ between the two axes (shapes the figure). */
  phase: number;
  /** 0..1 harmonic enrichment → extra lobes / a knottier figure. */
  rich: number;
  /** 0..1 figure radius (rides amplitude). */
  amp: number;
  /** 0..1 lock — high lock draws a single clean turn; low draws many. */
  lock: number;
}

const TWO_PI = Math.PI * 2;

/** Number of turns to trace: locked → 1 clean closed loop; unlocked → several
 *  so the detuned figure spreads into a precessing scribble. */
function turnsFor(lock: number): number {
  return 1 + Math.round(3 * (1 - lock));
}

/** Fill `out` with the beam path. `out` must hold at least maxCount*2 floats. */
export function buildBeamPath(out: Float32Array, s: BeamShape, maxCount: number): number {
  const turns = turnsFor(s.lock);
  const ky = s.num + s.detune;
  const complexity = Math.max(s.den, Math.abs(ky), 1);
  let count = Math.round((260 + 150 * complexity) * turns);
  count = clamp(count, 400, maxCount) | 0;

  const radius = 0.82 * (0.34 + 0.66 * s.amp);
  const norm = 1 / (1 + s.rich * 0.28);

  for (let i = 0; i < count; i++) {
    const u = (i / (count - 1)) * TWO_PI * turns;
    let x = Math.sin(s.den * u);
    let y = Math.sin(ky * u + s.phase);
    if (s.rich > 0.001) {
      x = (x + s.rich * 0.28 * Math.sin(3 * s.den * u + 0.6)) * norm;
      y = (y + s.rich * 0.28 * Math.sin(3 * ky * u + s.phase * 2.0)) * norm;
    }
    out[i * 2] = x * radius;
    out[i * 2 + 1] = y * radius;
  }
  return count;
}
