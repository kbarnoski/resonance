// ─────────────────────────────────────────────────────────────────────────────
// knot.ts — the (p,q) torus-knot geometry AND its tuning.
//
//   A (p,q) torus knot is a single closed string wound through a donut: it wraps
//   p times the long way (around the axis) and q times the short way (through the
//   hole). The parametric curve, with θ ∈ [0, 2π]:
//
//       x = (R + r·cos(qθ))·cos(pθ)
//       y = (R + r·cos(qθ))·sin(pθ)
//       z =  r·sin(qθ)
//
//   The winding numbers ARE the instrument's tuning. We read the two integers as
//   two interlocking harmonic series — the partials {p, 2p, 3p, …} and
//   {q, 2q, 3q, …} — folded into a playable span. As your finger slides along the
//   one string (the arc parameter u ∈ [0,1]) you climb through that just-intoned
//   ladder, so changing (p,q) genuinely retunes the whole knot.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

/** A (p,q) preset. p and q must be coprime for a genuine single-string knot. */
export interface KnotPreset {
  readonly p: number;
  readonly q: number;
  readonly label: string;
  readonly name: string;
}

export const PRESETS: readonly KnotPreset[] = [
  { p: 2, q: 3, label: "(2,3)", name: "trefoil" },
  { p: 3, q: 2, label: "(3,2)", name: "inverted trefoil" },
  { p: 2, q: 5, label: "(2,5)", name: "cinquefoil" },
  { p: 3, q: 4, label: "(3,4)", name: "8₁₉ knot" },
];

/** Donut major/minor radii for the drawn knot. */
export const R_MAJOR = 2.6;
export const R_MINOR = 0.95;

/**
 * A THREE.Curve for the (p,q) torus knot, so we can hand it to TubeGeometry.
 * getPoint takes t ∈ [0,1] (= θ / 2π) and writes the world-space point.
 */
export class TorusKnotCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly p: number,
    private readonly q: number,
    private readonly R = R_MAJOR,
    private readonly r = R_MINOR,
  ) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const th = t * Math.PI * 2;
    const cq = Math.cos(this.q * th);
    const sq = Math.sin(this.q * th);
    const rad = this.R + this.r * cq;
    return target.set(
      rad * Math.cos(this.p * th),
      rad * Math.sin(this.p * th),
      this.r * sq,
    );
  }
}

/**
 * Build the tuning for a (p,q) knot: the union of the first few partials of the
 * p-series and the q-series, each folded into the span [1, SPAN), multiplied by
 * the base frequency, sorted ascending. Sliding u ∈ [0,1] across this array is
 * sliding up the string.
 */
export function buildTuning(p: number, q: number, base = 110): number[] {
  const SPAN = 6; // fold partials into a ~2.5-octave window
  const fold = (ratio: number): number => {
    let r = ratio;
    while (r >= SPAN) r /= 2;
    while (r < 1) r *= 2;
    return r;
  };
  const ratios = new Set<number>();
  for (let k = 1; k <= 6; k++) {
    ratios.add(Number(fold(p * k).toFixed(4)));
    ratios.add(Number(fold(q * k).toFixed(4)));
  }
  return [...ratios].sort((a, b) => a - b).map((r) => base * r);
}

/**
 * Map an arc position u ∈ [0,1] on the string to a frequency in the tuning.
 * The pick lands on the nearest rung of the interlocking ladder.
 */
export function pluckFrequency(u: number, tuning: number[]): number {
  const idx = Math.min(
    tuning.length - 1,
    Math.max(0, Math.round(u * (tuning.length - 1))),
  );
  return tuning[idx];
}
