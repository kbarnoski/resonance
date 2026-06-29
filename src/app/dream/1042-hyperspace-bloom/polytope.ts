/* ── 1042-hyperspace-bloom · 4D polytope geometry + rotation/projection ──
 *
 *  CPU-side generation of a regular polytope's 4D vertices and edges, the
 *  six-plane 4D rotation, and stereographic 4D→3D projection.
 *
 *  We default to the 24-cell (24 vertices, 96 edges): richer than a
 *  tesseract but still tiny and bulletproof. The animated xw/yw/zw rotation
 *  planes are what make the projected 3D frame bloom and turn inside-out —
 *  that impossible morphing is the hyperdimensional read.
 *
 *  Reference for the technique: rotate-in-4D then stereographic-project
 *  (the classic Shadertoy 4D raymarch / hypercube lineage).
 */

export type Vec4 = [number, number, number, number];

export interface Polytope {
  verts: Vec4[];
  edges: [number, number][];
}

/** The 24-cell: all permutations of (±1, ±1, 0, 0). 24 vertices.
 *  Edges connect vertices at squared-distance 2 (the minimal edge length). */
export function build24Cell(): Polytope {
  const verts: Vec4[] = [];
  const axes = [0, 1, 2, 3];
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const v: Vec4 = [0, 0, 0, 0];
          v[axes[a]] = sa;
          v[axes[b]] = sb;
          verts.push(v);
        }
      }
    }
  }

  const edges: [number, number][] = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const dx = verts[i][0] - verts[j][0];
      const dy = verts[i][1] - verts[j][1];
      const dz = verts[i][2] - verts[j][2];
      const dw = verts[i][3] - verts[j][3];
      const d2 = dx * dx + dy * dy + dz * dz + dw * dw;
      // minimal edge in the 24-cell has squared length 2
      if (Math.abs(d2 - 2) < 1e-6) edges.push([i, j]);
    }
  }
  return { verts, edges };
}

/** Tesseract fallback: 16 vertices (±1)^4, 32 edges (Hamming-distance 1). */
export function buildTesseract(): Polytope {
  const verts: Vec4[] = [];
  for (let i = 0; i < 16; i++) {
    verts.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ]);
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      const diff = i ^ j;
      // power of two → differ in exactly one coordinate → an edge
      if (diff && (diff & (diff - 1)) === 0) edges.push([i, j]);
    }
  }
  return { verts, edges };
}

/** Rotate a 4D point in a single coordinate plane (i, j) by angle a. */
function rotPlane(v: Vec4, i: number, j: number, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const vi = v[i];
  const vj = v[j];
  v[i] = vi * c - vj * s;
  v[j] = vi * s + vj * c;
}

export interface Angles6 {
  xy: number;
  xz: number;
  xw: number;
  yz: number;
  yw: number;
  zw: number;
}

/** Apply all six 4D rotation planes to a copy of v. The w-planes
 *  (xw, yw, zw) are the "hyper" rotations that morph the 3D slice. */
export function rotate4(v: Vec4, a: Angles6): Vec4 {
  const r: Vec4 = [v[0], v[1], v[2], v[3]];
  rotPlane(r, 0, 1, a.xy);
  rotPlane(r, 0, 2, a.xz);
  rotPlane(r, 0, 3, a.xw);
  rotPlane(r, 1, 2, a.yz);
  rotPlane(r, 1, 3, a.yw);
  rotPlane(r, 2, 3, a.zw);
  return r;
}

/** Stereographic projection 4D → 3D from the pole w = +d.
 *  As a vertex's w nears the pole it balloons toward infinity — the classic
 *  hyperdimensional "near edges explode outward" look. We clamp the scale so
 *  the raymarch never sees a degenerate capsule. */
export function project4to3(
  v: Vec4,
  dist = 2.2,
): [number, number, number] {
  const denom = dist - v[3];
  const k = dist / Math.max(0.18, denom); // clamp keeps it finite
  return [v[0] * k, v[1] * k, v[2] * k];
}
