/* ── 1450-supershape-bloom · the substrate: superformula + 3D supershape mesh ──
 *
 *  The 2D superformula (Johan Gielis, 2003) gives a radius as a function of
 *  angle θ:
 *
 *      r(θ) = ( |cos(m·θ/4)/a|^n2 + |sin(m·θ/4)/b|^n3 )^(-1/n1)
 *
 *  The 3D *supershape* (Paul Bourke) is the spherical product of two such
 *  superformulas — one for longitude θ∈[-π,π], one for latitude φ∈[-π/2,π/2]:
 *
 *      x = r1(θ)·cos θ · r2(φ)·cos φ
 *      y = r1(θ)·sin θ · r2(φ)·cos φ
 *      z =                r2(φ)·sin φ
 *
 *  m = symmetry (lobe count), n1/n2/n3 = roundness / pinch.  This module owns
 *  the pure math and rebuilds the vertex + normal buffers each frame from a
 *  parameter set.  No React, no GL — just numbers.
 */

export interface SuperParams {
  // longitude superformula (θ)
  m1: number;
  n1a: number;
  n2a: number;
  n3a: number;
  // latitude superformula (φ)
  m2: number;
  n1b: number;
  n2b: number;
  n3b: number;
  a: number;
  b: number;
}

/** One 2D superformula radius, clamped so a near-zero n1 can't blow up. */
export function superRadius(
  m: number,
  n1: number,
  n2: number,
  n3: number,
  a: number,
  b: number,
  theta: number,
): number {
  const t = (m * theta) / 4;
  const c = Math.abs(Math.cos(t) / a);
  const s = Math.abs(Math.sin(t) / b);
  const p = Math.pow(c, n2) + Math.pow(s, n3);
  if (p <= 1e-9 || !isFinite(p)) return 1.0;
  const r = Math.pow(p, -1 / Math.max(1e-3, n1));
  if (!isFinite(r)) return 1.0;
  // clamp so a spiky preset can't send a vertex to infinity
  return Math.min(2.6, r);
}

export interface Mesh {
  U: number;
  V: number;
  positions: Float32Array; // (U+1)*(V+1)*3
  normals: Float32Array; // (U+1)*(V+1)*3
  triIndices: Uint16Array; // solid fill
  lineIndices: Uint16Array; // wireframe sheen
}

/** Allocate the buffers + static index topology for a (U×V) parameter grid. */
export function makeMesh(U: number, V: number): Mesh {
  const nVert = (U + 1) * (V + 1);
  const positions = new Float32Array(nVert * 3);
  const normals = new Float32Array(nVert * 3);

  // solid triangle indices
  const tri: number[] = [];
  const idx = (u: number, v: number) => v * (U + 1) + u;
  for (let v = 0; v < V; v++) {
    for (let u = 0; u < U; u++) {
      const a = idx(u, v);
      const b = idx(u + 1, v);
      const c = idx(u, v + 1);
      const d = idx(u + 1, v + 1);
      tri.push(a, b, d, a, d, c);
    }
  }

  // wireframe: subsampled grid lines so it reads as an engraved sheen, not mud
  const line: number[] = [];
  const stride = 2;
  for (let v = 0; v <= V; v += stride) {
    for (let u = 0; u < U; u++) line.push(idx(u, v), idx(u + 1, v));
  }
  for (let u = 0; u <= U; u += stride) {
    for (let v = 0; v < V; v++) line.push(idx(u, v), idx(u, v + 1));
  }

  return {
    U,
    V,
    positions,
    normals,
    triIndices: Uint16Array.from(tri),
    lineIndices: Uint16Array.from(line),
  };
}

// scratch arrays reused across frames (radius/trig depend only on u or v)
let _r1: Float64Array | null = null;
let _c1: Float64Array | null = null;
let _s1: Float64Array | null = null;
let _r2: Float64Array | null = null;
let _c2: Float64Array | null = null;
let _s2: Float64Array | null = null;

/**
 * Recompute positions + normals for the current parameter set.
 * Returns the max vertex extent so the caller can auto-normalize the scale.
 */
export function computeMesh(mesh: Mesh, p: SuperParams): number {
  const { U, V, positions } = mesh;
  if (!_r1 || _r1.length !== U + 1) {
    _r1 = new Float64Array(U + 1);
    _c1 = new Float64Array(U + 1);
    _s1 = new Float64Array(U + 1);
  }
  if (!_r2 || _r2.length !== V + 1) {
    _r2 = new Float64Array(V + 1);
    _c2 = new Float64Array(V + 1);
    _s2 = new Float64Array(V + 1);
  }
  const r1 = _r1!,
    c1 = _c1!,
    s1 = _s1!,
    r2 = _r2!,
    c2 = _c2!,
    s2 = _s2!;

  for (let u = 0; u <= U; u++) {
    const theta = -Math.PI + (u / U) * 2 * Math.PI;
    r1[u] = superRadius(p.m1, p.n1a, p.n2a, p.n3a, p.a, p.b, theta);
    c1[u] = Math.cos(theta);
    s1[u] = Math.sin(theta);
  }
  for (let v = 0; v <= V; v++) {
    const phi = -Math.PI / 2 + (v / V) * Math.PI;
    r2[v] = superRadius(p.m2, p.n1b, p.n2b, p.n3b, p.a, p.b, phi);
    c2[v] = Math.cos(phi);
    s2[v] = Math.sin(phi);
  }

  let maxExt = 1e-4;
  for (let v = 0; v <= V; v++) {
    const rv = r2[v];
    const cv = c2[v];
    const sv = s2[v];
    const rowBase = v * (U + 1);
    for (let u = 0; u <= U; u++) {
      const i = (rowBase + u) * 3;
      const ru = r1[u];
      const x = ru * c1[u] * rv * cv;
      const y = ru * s1[u] * rv * cv;
      const z = rv * sv;
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = z;
      const ext = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
      if (ext > maxExt) maxExt = ext;
    }
  }

  computeNormals(mesh);
  return maxExt;
}

/** Finite-difference normals from grid neighbours; degenerate poles guarded. */
function computeNormals(mesh: Mesh): void {
  const { U, V, positions, normals } = mesh;
  const at = (u: number, v: number) => (v * (U + 1) + u) * 3;
  for (let v = 0; v <= V; v++) {
    for (let u = 0; u <= U; u++) {
      const um = u > 0 ? u - 1 : u;
      const up = u < U ? u + 1 : u;
      const vm = v > 0 ? v - 1 : v;
      const vp = v < V ? v + 1 : v;
      const iu0 = at(um, v);
      const iu1 = at(up, v);
      const iv0 = at(u, vm);
      const iv1 = at(u, vp);
      const dux = positions[iu1] - positions[iu0];
      const duy = positions[iu1 + 1] - positions[iu0 + 1];
      const duz = positions[iu1 + 2] - positions[iu0 + 2];
      const dvx = positions[iv1] - positions[iv0];
      const dvy = positions[iv1 + 1] - positions[iv0 + 1];
      const dvz = positions[iv1 + 2] - positions[iv0 + 2];
      // n = du × dv
      let nx = duy * dvz - duz * dvy;
      let ny = duz * dvx - dux * dvz;
      let nz = dux * dvy - duy * dvx;
      const len = Math.hypot(nx, ny, nz);
      const o = at(u, v);
      if (len < 1e-7) {
        // pole / degenerate: point outward along z
        nx = 0;
        ny = 0;
        nz = positions[o + 2] >= 0 ? 1 : -1;
      } else {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      normals[o] = nx;
      normals[o + 1] = ny;
      normals[o + 2] = nz;
    }
  }
}

/** Linearly interpolate every field of two parameter sets. */
export function lerpParams(
  a: SuperParams,
  b: SuperParams,
  t: number,
  out: SuperParams,
): SuperParams {
  const L = (x: number, y: number) => x + (y - x) * t;
  out.m1 = L(a.m1, b.m1);
  out.n1a = L(a.n1a, b.n1a);
  out.n2a = L(a.n2a, b.n2a);
  out.n3a = L(a.n3a, b.n3a);
  out.m2 = L(a.m2, b.m2);
  out.n1b = L(a.n1b, b.n1b);
  out.n2b = L(a.n2b, b.n2b);
  out.n3b = L(a.n3b, b.n3b);
  out.a = L(a.a, b.a);
  out.b = L(a.b, b.b);
  return out;
}

export function cloneParams(p: SuperParams): SuperParams {
  return { ...p };
}

/** A curated zoo of alien organisms — the deterministic idle tour walks these. */
export interface Preset {
  name: string;
  key: string;
  p: SuperParams;
}

export const PRESETS: Preset[] = [
  {
    name: "Starfish",
    key: "1",
    p: { m1: 5, n1a: 0.28, n2a: 0.3, n3a: 0.3, m2: 5, n1b: 0.28, n2b: 0.3, n3b: 0.3, a: 1, b: 1 },
  },
  {
    name: "Sea urchin",
    key: "2",
    p: { m1: 12, n1a: 0.45, n2a: 0.5, n3a: 0.5, m2: 12, n1b: 0.45, n2b: 0.5, n3b: 0.5, a: 1, b: 1 },
  },
  {
    name: "Chrysanthemum",
    key: "3",
    p: { m1: 8, n1a: 1.0, n2a: 0.4, n3a: 0.4, m2: 3, n1b: 0.7, n2b: 1.0, n3b: 1.0, a: 1, b: 1 },
  },
  {
    name: "Diatom",
    key: "4",
    p: { m1: 6, n1a: 40, n2a: 10, n3a: 10, m2: 6, n1b: 40, n2b: 10, n3b: 10, a: 1, b: 1 },
  },
  {
    name: "Radiolaria",
    key: "5",
    p: { m1: 20, n1a: 0.6, n2a: 0.7, n3a: 0.7, m2: 10, n1b: 0.4, n2b: 0.5, n3b: 0.5, a: 1, b: 1 },
  },
  {
    name: "Bloom",
    key: "6",
    p: { m1: 7, n1a: 0.2, n2a: 1.7, n3a: 1.7, m2: 0, n1b: 1, n2b: 1, n3b: 1, a: 1, b: 1 },
  },
  {
    name: "Prime thorn",
    key: "7",
    p: { m1: 11, n1a: 0.3, n2a: 0.45, n3a: 0.45, m2: 7, n1b: 0.3, n2b: 0.5, n3b: 0.5, a: 1, b: 1 },
  },
  {
    name: "Orb",
    key: "8",
    p: { m1: 4, n1a: 60, n2a: 20, n3a: 20, m2: 4, n1b: 60, n2b: 20, n3b: 20, a: 1, b: 1 },
  },
];
