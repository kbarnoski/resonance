// ─────────────────────────────────────────────────────────────────────────────
// geometry.ts — the hidden cathedral, seeded as a point cloud.
//
//   The listener stands at the ORIGIN (0,0,0), ear height, facing -z. Around and
//   ahead of them a cathedral-void is generated deterministically: a ring of
//   marble pillars, a flagstone floor below, a barrel vault overhead, a great
//   curved apse far down the nave, and a few scattered iron monoliths. None of it
//   is ever lit until an echo-wavefront crosses it.
//
//   Points are grouped into ~37 SURFACES. Each surface carries a centroid, a
//   distance-from-listener (constant — the listener never moves, only turns), a
//   MATERIAL, and an inharmonic base frequency. The material's partial ratios are
//   STRETCHED / inharmonic (bell- and plate-like: ×2.76, ×5.40, ×8.93…), never a
//   consonant scale — so the revealed field sounds eerie and unresolved.
//
//   SPEED is the sim's "speed of sound": the visual wavefront expands at SPEED
//   world-units/sec and an echo returns to the ear at 2·dist/SPEED. Both the
//   renderer and the audio import SPEED so eye and ear agree.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, ECHO_SEED } from "./rng";

/** Sim speed of sound, world-units per second. Retune for pacing: lower = the
 *  space answers more slowly, the far apse arrives later. */
export const SPEED = 22;

/** Half-width (world units) of the glowing reveal shell as the wavefront passes
 *  a surface. Wider = softer, more smeared reveal. */
export const SHELL = 1.7;

export type MaterialId = 0 | 1 | 2 | 3 | 4;

export interface Material {
  name: string;
  /** Point-cloud glow colour, linear rgb 0..1. */
  color: [number, number, number];
  /** Inharmonic partial ratios (first is always 1). Stretched, bell/plate-like. */
  ratios: number[];
  /** Base-frequency window (Hz) for a surface of this material. */
  baseLo: number;
  baseHi: number;
  /** Resonator decay time (s) for the fundamental — how long the strike rings. */
  decay: number;
}

// Cosmic-ambient, dark. Frequencies + ratios chosen to be INHARMONIC (struck
// bell / plate / slab), so surfaces do not fuse into a sweet chord.
export const MATERIALS: Material[] = [
  {
    name: "flagstone",
    color: [0.34, 0.31, 0.58],
    ratios: [1, 2.31, 3.83],
    baseLo: 58,
    baseHi: 96,
    decay: 0.55,
  },
  {
    name: "marble",
    color: [0.72, 0.81, 0.97],
    ratios: [1, 2.76, 5.4],
    baseLo: 150,
    baseHi: 262,
    decay: 1.15,
  },
  {
    name: "iron",
    color: [0.42, 0.86, 0.79],
    ratios: [1, 2.76, 5.4, 8.93],
    baseLo: 196,
    baseHi: 430,
    decay: 1.95,
  },
  {
    name: "vault",
    color: [0.42, 0.36, 0.66],
    ratios: [1, 1.98, 3.12, 4.61],
    baseLo: 88,
    baseHi: 150,
    decay: 0.8,
  },
  {
    name: "apse",
    color: [0.87, 0.61, 0.74],
    ratios: [1, 2.7, 5.4],
    baseLo: 44,
    baseHi: 80,
    decay: 2.45,
  },
];

export interface Surface {
  id: number;
  material: MaterialId;
  centroid: [number, number, number];
  /** Euclidean distance from the listener at the origin. */
  dist: number;
  baseFreq: number;
  /** First point index (not float index) into the shared cloud. */
  start: number;
  count: number;
}

export interface Cathedral {
  positions: Float32Array; // xyz per point
  colors: Float32Array; // rgb per point
  distances: Float32Array; // per-point distance from origin
  pointCount: number;
  surfaces: Surface[];
  maxDist: number;
}

/** Build the whole seeded cathedral. Deterministic given the seed. */
export function buildCathedral(seed: number = ECHO_SEED): Cathedral {
  const rnd = mulberry32(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const dst: number[] = [];
  const surfaces: Surface[] = [];

  const push = (x: number, y: number, z: number, m: MaterialId): void => {
    const c = MATERIALS[m].color;
    pos.push(x, y, z);
    // Slight per-point brightness jitter so surfaces read as textured, not flat.
    const j = 0.8 + 0.4 * rnd();
    col.push(c[0] * j, c[1] * j, c[2] * j);
    dst.push(Math.hypot(x, y, z));
  };

  // Wrap a point-emitting closure into one Surface record (centroid + freq).
  const emit = (m: MaterialId, gen: () => void): void => {
    const start = pos.length / 3;
    gen();
    const count = pos.length / 3 - start;
    if (count === 0) return;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = start; i < start + count; i++) {
      cx += pos[i * 3];
      cy += pos[i * 3 + 1];
      cz += pos[i * 3 + 2];
    }
    cx /= count;
    cy /= count;
    cz /= count;
    const mat = MATERIALS[m];
    const baseFreq = mat.baseLo + rnd() * (mat.baseHi - mat.baseLo);
    surfaces.push({
      id: surfaces.length,
      material: m,
      centroid: [cx, cy, cz],
      dist: Math.hypot(cx, cy, cz),
      baseFreq,
      start,
      count,
    });
  };

  const FLOOR_Y = -3.2;

  // ── 10 marble pillars in a ring (each a vertical column) ──────────────────
  const PILLARS = 10;
  const RING_R = 11;
  for (let p = 0; p < PILLARS; p++) {
    const ang = (p / PILLARS) * Math.PI * 2 + 0.15;
    const px = Math.cos(ang) * RING_R;
    const pz = Math.sin(ang) * RING_R - 8; // shift ring down the nave
    emit(1, () => {
      const rows = 40;
      for (let i = 0; i < rows; i++) {
        const t = i / rows;
        const y = FLOOR_Y + t * 9.2;
        const rr = 0.55 + 0.15 * rnd();
        const a = rnd() * Math.PI * 2;
        push(px + Math.cos(a) * rr, y, pz + Math.sin(a) * rr, 1);
      }
    });
  }

  // ── flagstone floor, split into a 3×3 grid of tiles ───────────────────────
  const FX0 = -14;
  const FX1 = 14;
  const FZ0 = -32;
  const FZ1 = 8;
  for (let tx = 0; tx < 3; tx++) {
    for (let tz = 0; tz < 3; tz++) {
      emit(0, () => {
        const n = 8;
        const x0 = FX0 + (tx / 3) * (FX1 - FX0);
        const x1 = FX0 + ((tx + 1) / 3) * (FX1 - FX0);
        const z0 = FZ0 + (tz / 3) * (FZ1 - FZ0);
        const z1 = FZ0 + ((tz + 1) / 3) * (FZ1 - FZ0);
        for (let ix = 0; ix < n; ix++) {
          for (let iz = 0; iz < n; iz++) {
            const x = x0 + ((ix + rnd() * 0.6) / n) * (x1 - x0);
            const z = z0 + ((iz + rnd() * 0.6) / n) * (z1 - z0);
            push(x, FLOOR_Y + (rnd() - 0.5) * 0.15, z, 0);
          }
        }
      });
    }
  }

  // ── barrel-vault ribs overhead ────────────────────────────────────────────
  const RIB_Z = [6, 0, -6, -12, -18, -24];
  for (const zr of RIB_Z) {
    emit(3, () => {
      const n = 40;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = -8 + t * 16;
        // arch: peak at centre (~9.4), springs down to ~5.4 at the sides
        const y = 5.4 + 4.0 * Math.cos((x / 8) * (Math.PI / 2));
        push(x, y, zr + (rnd() - 0.5) * 0.6, 3);
      }
    });
  }

  // ── the great curved apse, far down the nave, split into 6 vertical strips ─
  const APSE_C: [number, number, number] = [0, 1.5, -31];
  const APSE_R = 8.5;
  for (let s = 0; s < 6; s++) {
    emit(4, () => {
      const phi0 = -Math.PI / 2 + (s / 6) * Math.PI;
      const phi1 = -Math.PI / 2 + ((s + 1) / 6) * Math.PI;
      const cols = 5;
      const elevN = 12;
      for (let c2 = 0; c2 < cols; c2++) {
        const phi = phi0 + (c2 / (cols - 1)) * (phi1 - phi0);
        for (let e = 0; e < elevN; e++) {
          const elev = (e / (elevN - 1)) * (Math.PI * 0.62);
          const ce = Math.cos(elev);
          const x = APSE_C[0] + APSE_R * ce * Math.sin(phi);
          const y = APSE_C[1] + APSE_R * Math.sin(elev);
          const z = APSE_C[2] + APSE_R * ce * Math.cos(phi); // curves toward ear
          push(x, y, z, 4);
        }
      }
    });
  }

  // ── scattered iron monoliths (tall slabs) ─────────────────────────────────
  const MONOS = 6;
  for (let mi = 0; mi < MONOS; mi++) {
    emit(2, () => {
      let mx = (rnd() - 0.5) * 18;
      let mz = -24 + rnd() * 24;
      // keep them out of the listener's lap
      if (Math.hypot(mx, mz) < 6) {
        mx *= 2.2;
        mz -= 6;
      }
      const h = 2.6 + rnd() * 3.4;
      const w = 0.5 + rnd() * 0.6;
      const n = 50;
      for (let i = 0; i < n; i++) {
        push(
          mx + (rnd() - 0.5) * w,
          FLOOR_Y + rnd() * h,
          mz + (rnd() - 0.5) * w * 0.6,
          2,
        );
      }
    });
  }

  const positions = new Float32Array(pos);
  const colors = new Float32Array(col);
  const distances = new Float32Array(dst);
  let maxDist = 0;
  for (const s of surfaces) if (s.dist > maxDist) maxDist = s.dist;

  return {
    positions,
    colors,
    distances,
    pointCount: pos.length / 3,
    surfaces,
    maxDist,
  };
}
