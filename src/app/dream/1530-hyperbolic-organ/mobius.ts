// ─────────────────────────────────────────────────────────────────────────────
// mobius.ts — hyperbolic geometry for the Poincaré disk, kept self-contained.
//
//   Complex numbers as [re, im]. Orientation-preserving isometries of the unit
//   disk form SU(1,1): matrices [[a, b],[b̄, ā]] with |a|² − |b|² = 1, acting by
//   z ↦ (a·z + b) / (b̄·z + ā). Hyperbolic translations and rotations are the
//   playable generators. The {p,q} tiling is grown by reflecting a central
//   regular polygon across its geodesic edges (circle inversions orthogonal to
//   the unit circle) — a Fuchsian reflection group, à la Coxeter / Escher.
//
//   Determinism: no Math.random, no Date. Pure functions of their inputs.
// ─────────────────────────────────────────────────────────────────────────────

export type C = [number, number];

export function cmul(a: C, b: C): C {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}
export function cadd(a: C, b: C): C {
  return [a[0] + b[0], a[1] + b[1]];
}
export function cconj(a: C): C {
  return [a[0], -a[1]];
}
export function cabs2(a: C): number {
  return a[0] * a[0] + a[1] * a[1];
}
export function cdiv(a: C, b: C): C {
  const d = cabs2(b) || 1e-30;
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}

/** An SU(1,1) isometry [[a, b],[b̄, ā]]. */
export interface Iso {
  a: C;
  b: C;
}

export const IDENTITY: Iso = { a: [1, 0], b: [0, 0] };

/** z ↦ (a·z + b) / (b̄·z + ā) */
export function applyIso(m: Iso, z: C): C {
  const num = cadd(cmul(m.a, z), m.b);
  const den = cadd(cmul(cconj(m.b), z), cconj(m.a));
  return cdiv(num, den);
}

/** Matrix product of two SU(1,1) elements. */
export function mul(m: Iso, n: Iso): Iso {
  return {
    a: cadd(cmul(m.a, n.a), cmul(m.b, cconj(n.b))),
    b: cadd(cmul(m.a, n.b), cmul(m.b, cconj(n.a))),
  };
}

/** Re-project back onto SU(1,1) to fight floating-point drift. */
export function normalize(m: Iso): Iso {
  const det = cabs2(m.a) - cabs2(m.b);
  const s = 1 / Math.sqrt(Math.abs(det) || 1e-30);
  return { a: [m.a[0] * s, m.a[1] * s], b: [m.b[0] * s, m.b[1] * s] };
}

/** Hyperbolic translation of length `s` along direction `phi` (disk coords). */
export function translate(s: number, phi: number): Iso {
  const ch = Math.cosh(s / 2);
  const sh = Math.sinh(s / 2);
  return { a: [ch, 0], b: [Math.cos(phi) * sh, Math.sin(phi) * sh] };
}

/** Rotation about the disk centre by angle `t`. */
export function rotate(t: number): Iso {
  return { a: [Math.cos(t / 2), Math.sin(t / 2)], b: [0, 0] };
}

// ── Tiling generation ────────────────────────────────────────────────────────

export interface Tile {
  verts: C[];
  depth: number;
}

/** Reflect a point across the geodesic through disk points p1, p2. */
function reflector(p1: C, p2: C): (z: C) => C {
  const det = p1[0] * p2[1] - p1[1] * p2[0];
  if (Math.abs(det) < 1e-9) {
    // Geodesic is a diameter → reflect across the line through the origin.
    const len = Math.hypot(p1[0], p1[1]) || 1e-30;
    const ux = p1[0] / len;
    const uy = p1[1] / len;
    return (z: C): C => {
      const d = z[0] * ux + z[1] * uy;
      return [2 * d * ux - z[0], 2 * d * uy - z[1]];
    };
  }
  // Circle orthogonal to the unit circle through p1, p2: solve for its centre.
  const k1 = (cabs2(p1) + 1) / 2;
  const k2 = (cabs2(p2) + 1) / 2;
  const cx = (k1 * p2[1] - k2 * p1[1]) / det;
  const cy = (p1[0] * k2 - p2[0] * k1) / det;
  const r2 = cx * cx + cy * cy - 1;
  return (z: C): C => {
    const dx = z[0] - cx;
    const dy = z[1] - cy;
    const dd = dx * dx + dy * dy || 1e-30;
    const f = r2 / dd;
    return [cx + f * dx, cy + f * dy];
  };
}

function centroid(vs: C[]): C {
  let x = 0;
  let y = 0;
  for (const v of vs) {
    x += v[0];
    y += v[1];
  }
  return [x / vs.length, y / vs.length];
}

/**
 * Grow a {p,q} tiling of the Poincaré disk by breadth-first reflection of a
 * central regular polygon across its edges. Returns tiles in home coordinates.
 */
export function buildTiling(p: number, q: number, maxTiles: number): Tile[] {
  // Circumradius (hyperbolic) of the central polygon: cosh R = cot(π/p)·cot(π/q).
  const coshR = 1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q));
  const R = Math.acosh(Math.max(1, coshR));
  const rv = Math.tanh(R / 2); // → Euclidean radius in the disk

  const base: C[] = [];
  for (let k = 0; k < p; k++) {
    const ang = (2 * Math.PI * k) / p + Math.PI / p;
    base.push([rv * Math.cos(ang), rv * Math.sin(ang)]);
  }

  const key = (vs: C[]): string => {
    const c = centroid(vs);
    return `${Math.round(c[0] * 1000)},${Math.round(c[1] * 1000)}`;
  };

  const seen = new Set<string>();
  const out: Tile[] = [];
  const queue: Tile[] = [{ verts: base, depth: 0 }];
  seen.add(key(base));

  while (queue.length && out.length < maxTiles) {
    const tile = queue.shift() as Tile;
    out.push(tile);
    const c = centroid(tile.verts);
    if (Math.hypot(c[0], c[1]) > 0.9) continue; // stop expanding near the rim

    for (let i = 0; i < tile.verts.length; i++) {
      const reflect = reflector(tile.verts[i], tile.verts[(i + 1) % tile.verts.length]);
      const nv = tile.verts.map(reflect);
      const nc = centroid(nv);
      if (Math.hypot(nc[0], nc[1]) > 0.994) continue; // too small to matter
      const k = key(nv);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ verts: nv, depth: tile.depth + 1 });
    }
  }
  return out;
}

/**
 * Sample the interior of the geodesic between disk points p1, p2 (endpoints
 * excluded). Used to draw curved hyperbolic edges as SVG polylines.
 */
export function geodesicInterior(p1: C, p2: C, n: number): C[] {
  const det = p1[0] * p2[1] - p1[1] * p2[0];
  const pts: C[] = [];
  if (Math.abs(det) < 1e-7) {
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]);
    }
    return pts;
  }
  const k1 = (cabs2(p1) + 1) / 2;
  const k2 = (cabs2(p2) + 1) / 2;
  const cx = (k1 * p2[1] - k2 * p1[1]) / det;
  const cy = (p1[0] * k2 - p2[0] * k1) / det;
  const r = Math.hypot(p1[0] - cx, p1[1] - cy);
  const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
  const a2 = Math.atan2(p2[1] - cy, p2[0] - cx);
  let da = a2 - a1;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  for (let i = 1; i < n; i++) {
    const ang = a1 + (da * i) / n;
    pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  return pts;
}
