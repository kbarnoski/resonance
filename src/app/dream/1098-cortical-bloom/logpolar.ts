// ─────────────────────────────────────────────────────────────────────────────
// logpolar.ts — local copy of the retino-cortical map math (kept in-folder so
// this prototype is self-contained). Mirrors _shared/psych/logpolar.ts.
//
// The retina→V1 map is (approximately) a complex logarithm, so a screen point
// maps to cortical coordinates (log r, theta). Generate stripes/hexagons in
// cortical space, read them back through this map, and one pattern yields all of
// Klüver's form constants — tunnels, spirals, spokes and honeycombs.
// (Ermentrout & Cowan 1979; Bressloff et al. 2001.)
// ─────────────────────────────────────────────────────────────────────────────

/** Screen point (centred, aspect-normalised) → cortical (log r, theta). */
export function screenToCortex(x: number, y: number): [number, number] {
  const r = Math.hypot(x, y);
  return [Math.log(Math.max(r, 1e-8)), Math.atan2(y, x)];
}

/** Cortical coordinates → screen point (inverse exp warp). */
export function cortexToScreen(u: number, v: number): [number, number] {
  const r = Math.exp(u);
  return [r * Math.cos(v), r * Math.sin(v)];
}
