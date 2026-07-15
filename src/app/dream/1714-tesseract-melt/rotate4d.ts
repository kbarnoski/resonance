// ─────────────────────────────────────────────────────────────────────────────
// rotate4d.ts — the 4D geometry + rotation + projection math for the tesseract.
//
//   A tesseract (8-cell) is the 4D analogue of a cube: 16 vertices at every
//   (±1,±1,±1,±1), and 32 edges connecting vertices that differ in exactly one
//   coordinate. We rotate its vertices in true four-dimensional space (six
//   independent rotation planes: xy, xz, xw, yz, yw, zw), then project 4D→3D by
//   a perspective divide along the w axis, and 3D→2D by a second perspective
//   divide along z. The w-plane rotations (xw, yw, zw) are the ones with no 3D
//   analogue — they make the projected cage turn inside-out and "melt", which is
//   the whole point of the piece.  No React, no globals — pure functions.
// ─────────────────────────────────────────────────────────────────────────────

export interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Angles6 {
  xy: number;
  xz: number;
  xw: number;
  yz: number;
  yw: number;
  zw: number;
}

export interface Tesseract {
  verts: Vec4[];
  edges: [number, number][];
}

/** popcount of a small integer. */
function bitCount(n: number): number {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

/** Build the 16 vertices / 32 edges of a unit tesseract. */
export function buildTesseract(): Tesseract {
  const verts: Vec4[] = [];
  for (let i = 0; i < 16; i++) {
    verts.push({
      x: i & 1 ? 1 : -1,
      y: i & 2 ? 1 : -1,
      z: i & 4 ? 1 : -1,
      w: i & 8 ? 1 : -1,
    });
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      if (bitCount(i ^ j) === 1) edges.push([i, j]);
    }
  }
  return { verts, edges };
}

/** Rotate a single 4D vector through all six planes (applied in a fixed order). */
export function rotate4(v: Vec4, a: Angles6): Vec4 {
  let { x, y, z, w } = v;
  let c: number;
  let s: number;
  let na: number;
  let nb: number;

  // xy
  c = Math.cos(a.xy);
  s = Math.sin(a.xy);
  na = x * c - y * s;
  nb = x * s + y * c;
  x = na;
  y = nb;
  // xz
  c = Math.cos(a.xz);
  s = Math.sin(a.xz);
  na = x * c - z * s;
  nb = x * s + z * c;
  x = na;
  z = nb;
  // xw (hyperplane)
  c = Math.cos(a.xw);
  s = Math.sin(a.xw);
  na = x * c - w * s;
  nb = x * s + w * c;
  x = na;
  w = nb;
  // yz
  c = Math.cos(a.yz);
  s = Math.sin(a.yz);
  na = y * c - z * s;
  nb = y * s + z * c;
  y = na;
  z = nb;
  // yw (hyperplane)
  c = Math.cos(a.yw);
  s = Math.sin(a.yw);
  na = y * c - w * s;
  nb = y * s + w * c;
  y = na;
  w = nb;
  // zw (hyperplane)
  c = Math.cos(a.zw);
  s = Math.sin(a.zw);
  na = z * c - w * s;
  nb = z * s + w * c;
  z = na;
  w = nb;

  return { x, y, z, w };
}

export interface Projected {
  /** Screen-space 2D position, roughly in [-1, 1]. */
  sx: number;
  sy: number;
  /** The rotated 4th coordinate — drives the iridescent color (hyper-depth). */
  w: number;
  /** Normalised near/far depth in [0,1] — drives brightness. */
  depth: number;
}

/** Project a rotated 4D vertex to 2D via two perspective divides (w then z). */
export function project4(v: Vec4, distW: number, distZ: number): Projected {
  const k4 = 1 / (distW - v.w);
  const x3 = v.x * k4;
  const y3 = v.y * k4;
  const z3 = v.z * k4;
  const k3 = 1 / (distZ - z3);
  return {
    sx: x3 * k3,
    sy: y3 * k3,
    w: v.w,
    // depth: nearer (larger k3) → brighter. Squash to a soft [0,1].
    depth: Math.max(0, Math.min(1, (k3 - 0.3) * 0.9)),
  };
}
