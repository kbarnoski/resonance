// ─────────────────────────────────────────────────────────────────────────────
// gyroid.ts — the scalar field for Alan Schoen's gyroid triply-periodic minimal
// surface, plus its analytic gradient (used for smooth vertex normals).
//
//   Gyroid:     f(x,y,z) = sin x·cos y + sin y·cos z + sin z·cos x
//   Schwarz-P:  p(x,y,z) = cos x + cos y + cos z
//
// The isosurface f = t is space-filling and periodic with period 2π on every
// axis, so marching one 2π³ chunk and tiling it fills space seamlessly. `morph`
// blends gyroid → Schwarz-P; gyroid (morph = 0) is the default and the star.
// ─────────────────────────────────────────────────────────────────────────────

/** Gyroid scalar field. Zero on the classic minimal surface. */
export function gyroid(x: number, y: number, z: number): number {
  return (
    Math.sin(x) * Math.cos(y) +
    Math.sin(y) * Math.cos(z) +
    Math.sin(z) * Math.cos(x)
  );
}

/** Schwarz-P scalar field. */
export function schwarzP(x: number, y: number, z: number): number {
  return Math.cos(x) + Math.cos(y) + Math.cos(z);
}

/**
 * Blended field: gyroid at morph = 0, Schwarz-P at morph = 1.
 * Both are 2π-periodic so the blend stays perfectly tileable.
 */
export function field(x: number, y: number, z: number, morph = 0): number {
  if (morph <= 0) return gyroid(x, y, z);
  if (morph >= 1) return schwarzP(x, y, z);
  return (1 - morph) * gyroid(x, y, z) + morph * schwarzP(x, y, z);
}

/**
 * Analytic gradient ∇field, written into `out` (out[0..2]). Direction of
 * steepest ascent — used, normalized, as the outward vertex normal.
 *
 *   ∂gyroid/∂x =  cos x·cos y − sin z·sin x
 *   ∂gyroid/∂y = −sin x·sin y + cos y·cos z
 *   ∂gyroid/∂z = −sin y·sin z + cos z·cos x
 *   ∂schwarzP  = (−sin x, −sin y, −sin z)
 */
export function gradient(
  x: number,
  y: number,
  z: number,
  out: [number, number, number],
  morph = 0,
): [number, number, number] {
  const sx = Math.sin(x);
  const sy = Math.sin(y);
  const sz = Math.sin(z);
  const cx = Math.cos(x);
  const cy = Math.cos(y);
  const cz = Math.cos(z);

  const gx = cx * cy - sz * sx;
  const gy = -sx * sy + cy * cz;
  const gz = -sy * sz + cz * cx;

  if (morph <= 0) {
    out[0] = gx;
    out[1] = gy;
    out[2] = gz;
  } else if (morph >= 1) {
    out[0] = -sx;
    out[1] = -sy;
    out[2] = -sz;
  } else {
    const w = 1 - morph;
    out[0] = w * gx + morph * -sx;
    out[1] = w * gy + morph * -sy;
    out[2] = w * gz + morph * -sz;
  }
  return out;
}

/** Squared magnitude of the gradient at a point — a cheap curvature/energy proxy. */
export function gradientMagnitude(
  x: number,
  y: number,
  z: number,
  morph = 0,
): number {
  const g: [number, number, number] = [0, 0, 0];
  gradient(x, y, z, g, morph);
  return Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]);
}
