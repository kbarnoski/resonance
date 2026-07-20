// ─────────────────────────────────────────────────────────────────────────────
// figure.ts — deterministic geometry for the Leviant "Enigma" figure.
//
// Concentric colored annuli (a restrained INDIGO ↔ BONE duotone) crossed by a
// dense field of fine radial spokes. It is the spokes cutting across the rings
// that makes the rings appear to STREAM / rotate — a real property of visual
// cortex (microsaccade + luminance-edge interaction), not any actual motion.
//
// Everything here is pure and deterministic: no Math.random(), no Date.now().
// Geometry is generated ONCE (on mount / control change), never per frame.
// ─────────────────────────────────────────────────────────────────────────────

export const VIEW = 1000; // SVG viewBox is 0 0 VIEW VIEW
export const CX = VIEW / 2;
export const CY = VIEW / 2;

/** Duotone — deep indigo vs pale bone. Raw hex is allowed INSIDE the art. */
export const INK_A = "#20244a"; // deep indigo
export const INK_B = "#e9e4d6"; // pale bone

export interface Ring {
  r: number;
  color: string;
  /** true for the pale-bone rings — used to bias "active annulus" glow. */
  pale: boolean;
}

/** Concentric rings from a small inner radius out to the edge, alternating
 *  indigo / bone. `count` rings, evenly spaced. */
export function buildRings(count: number): Ring[] {
  const rings: Ring[] = [];
  const rMin = 70;
  const rMax = 470;
  const span = rMax - rMin;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const pale = i % 2 === 1;
    rings.push({
      r: rMin + t * span,
      color: pale ? INK_B : INK_A,
      pale,
    });
  }
  return rings;
}

/** Per-ring stroke width so the annuli read as fat bands, not hairlines. */
export function ringBand(count: number): number {
  const rMin = 70;
  const rMax = 470;
  const gap = (rMax - rMin) / Math.max(1, count - 1);
  return Math.max(6, gap * 0.62);
}

/** One `<path>` d-string containing `n` radial spokes from an inner hub to the
 *  outer edge. A single path node keeps hundreds of spokes cheap for the DOM. */
export function buildSpokePath(n: number): string {
  const rInner = 34;
  const rOuter = 486;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const x1 = CX + cos * rInner;
    const y1 = CY + sin * rInner;
    const x2 = CX + cos * rOuter;
    const y2 = CY + sin * rOuter;
    d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return d;
}

/** Given a normalized pointer radius [0,1], pick the index of the nearest ring
 *  so it can be brightened as the "active annulus". */
export function activeRingIndex(pointerRadius01: number, count: number): number {
  const idx = Math.round(pointerRadius01 * (count - 1));
  return idx < 0 ? 0 : idx > count - 1 ? count - 1 : idx;
}
