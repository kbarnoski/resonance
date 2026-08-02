/**
 * Formless — implicit triply-periodic minimal-surface (TPMS) field, the
 * deterministic absorption arc, and the marching-cubes field filler.
 *
 * The surface is a soap-film manifold: no boundary, no centre, everywhere
 * self-similar and connected. We blend three classic minimal surfaces
 * (gyroid ⇄ Schwarz-P ⇄ Schwarz-D) so the structure feels alive and
 * self-transforming, and we evaluate it in ABSOLUTE world coordinates so the
 * camera can fly forever through the same infinite lattice.
 */

/** Seeded PRNG — every random draw in this piece flows from here. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ArcState {
  /** absorption parameter, 0 → 1, ping-ponged for the gentle return/loop. */
  a: number;
  /** lattice frequency (dilation): smaller = larger cells = opening space. */
  k: number;
  /** morph position 0..3 cycling gyroid(0) → Schwarz-P(1) → Schwarz-D(2). */
  morph: number;
  /** isosurface level: drifts up so the walls thin, dissolve and open. */
  c: number;
  /** integer surface index currently crossing (for the morph bell). */
  morphIndex: number;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const DURATION_MS = 162_000; // ~2.7 min one-way; ping-pong ≈ 5.4 min loop

/**
 * Map wall-clock elapsed to the arūpa arc. A triangle wave gives an
 * eased outward flight (space → consciousness → nothingness) and a gentle
 * return, then loops. Pure function of time — no hidden state.
 */
export function stepArc(elapsedMs: number): ArcState {
  const phase = (elapsedMs % (2 * DURATION_MS)) / DURATION_MS; // 0..2
  const tri = phase <= 1 ? phase : 2 - phase; // 0→1→0
  const a = tri * tri * (3 - 2 * tri); // eased absorption

  // Stage 1 — infinite space: the lattice dilates (cells grow larger).
  const k = 1.05 - 0.46 * smoothstep(0.0, 0.6, a);

  // Stage 2 — infinite consciousness: the surface morphs continuously.
  const morph = a * 2.999;

  // Stage 3 — nothingness: the isolevel drifts, thinning and opening walls.
  const c = 1.02 * smoothstep(0.58, 1.0, a);

  return { a, k, morph, c, morphIndex: Math.floor(morph) % 3 };
}

/**
 * Fill a MarchingCubes field buffer with the blended TPMS evaluated in world
 * space around `center`, scaled so the grid maps to [-R, R] on each axis.
 *
 * Uses separable per-axis sin/cos tables so the inner triple loop does only
 * multiplies — a full 40³ grid costs a few hundred trig calls, not 64k.
 */
export function fillField(
  field: Float32Array,
  size: number,
  center: [number, number, number],
  radius: number,
  k: number,
  morph: number,
): void {
  const half = size / 2;
  const sx = new Float32Array(size);
  const cx = new Float32Array(size);
  const sy = new Float32Array(size);
  const cy = new Float32Array(size);
  const sz = new Float32Array(size);
  const cz = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    const f = (i - half) / half; // [-1, 1)
    const ax = k * (center[0] + radius * f);
    const ay = k * (center[1] + radius * f);
    const az = k * (center[2] + radius * f);
    sx[i] = Math.sin(ax);
    cx[i] = Math.cos(ax);
    sy[i] = Math.sin(ay);
    cy[i] = Math.cos(ay);
    sz[i] = Math.sin(az);
    cz[i] = Math.cos(az);
  }

  // Fractional blend between the two neighbouring surfaces.
  const seg = Math.floor(morph) % 3;
  const frac = morph - Math.floor(morph);
  const s0 = seg;
  const s1 = (seg + 1) % 3;

  const size2 = size * size;

  for (let z = 0; z < size; z++) {
    const szz = sz[z];
    const czz = cz[z];
    const zoff = size2 * z;
    for (let y = 0; y < size; y++) {
      const syy = sy[y];
      const cyy = cy[y];
      const yoff = zoff + size * y;
      for (let x = 0; x < size; x++) {
        const sxx = sx[x];
        const cxx = cx[x];

        // gyroid, Schwarz-P, Schwarz-D from the shared per-axis tables
        const gyroid = sxx * cyy + syy * czz + szz * cxx;
        const schwarzP = cxx + cyy + czz;
        const schwarzD =
          sxx * syy * szz +
          sxx * cyy * czz +
          cxx * syy * czz +
          cxx * cyy * szz;

        const surf = [gyroid, schwarzP, schwarzD];
        field[yoff + x] = surf[s0] * (1 - frac) + surf[s1] * frac;
      }
    }
  }
}
