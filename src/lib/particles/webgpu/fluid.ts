// ─────────────────────────────────────────────────────────────────────────────
// fluid.ts — PHASE C: a real fluid for the smoke / ink souls (?fluid=1).
//
// The souls' smoke and ink are curl-noise today: beautiful, but nothing in it
// carries momentum — a plume never rolls over itself, ink never billows from
// where a drop landed. Here the motes live in a coarse velocity field that
// they themselves feed (PIC coupling) and that obeys incompressible flow:
//
//   P2G     each mote's velocity → its grid cell (fixed-point atomics)
//   blend   the persistent field eases toward the motes' momentum; damping;
//           buoyancy where motes gather; a plume source the BASS drives
//   curl    vorticity of the field
//   advect  semi-Lagrangian self-advection + vorticity confinement (keeps the
//           curls alive at this resolution)
//   div / Jacobi ×N / project — pressure solve: the field is made
//           divergence-free (smoke swirls, it doesn't compress)
//   G2P     each mote's velocity eases toward the field at its position
//
// LAWS: motion only (the field touches velocity, never light); every weight
// glides (FLUID_LAWS.GLIDE_SEC); the bass drives MOMENTUM into the plume, never
// brightness and never a step; only the fluid souls take part (FLUID_SOULS) —
// Snowflake's and Ghost's souls are not fluid souls, so their look is
// unchanged; image forms / emblems are untouched (gated by the image form).
// Grid: world-aligned 64³ over the field's box (the camera orbits, so a
// camera-aligned 2.5-D slab would have to re-sample as it turns).
// The CPU mirror below (grid maths, trilinear, divergence, Jacobi, project) is
// what fluid.test.ts proves; fluid-wgsl.ts is its GPU twin.
// ─────────────────────────────────────────────────────────────────────────────

import type { SoulId } from "../souls";

export const FLUID_LAWS = {
  /** cells per axis */
  N: 64,
  /** the box: [-HALF, HALF]³ world units */
  HALF: 3.2,
  /** fixed-point scale of the P2G atomics (|v| ≤ VMAX → ≤ 1,024 per mote) */
  SCALE: 256,
  VMAX: 4,
  /** pressure iterations (even: the solution lands in the first buffer) */
  JACOBI: 20,
  /** how fast the field follows the motes' momentum (per second, eased) */
  COUPLE_TAU: 0.35,
  /** how fast a mote follows the field (s) */
  FOLLOW_TAU: 0.5,
  /** field damping per second (it settles when the motes do) */
  DAMP_PER_SEC: 0.35,
  /** buoyancy where motes gather (u/s² at full density) */
  BUOYANCY: 0.35,
  /** density (motes per cell) at which buoyancy is full */
  DENSE_MOTES: 8,
  /** vorticity confinement strength */
  VORTICITY: 0.6,
  /** the bass plume: base + bass × gain (u/s² into the source cells) */
  PLUME_BASE: 0.2,
  PLUME_BASS: 1.2,
  /** the fluid's own weight glides (s) — a soul change fades it in / out */
  GLIDE_SEC: 2.0,
} as const;

/** The souls that ARE fluids, and how much (0..1). Every other soul: 0. */
export const FLUID_SOULS: Partial<Record<SoulId, number>> = {
  smoke: 1,
  ink: 1,
  smokering: 0.8,
  wisp: 0.7,
  flame: 0.6,
  aurora: 0.5,
};

export function fluidWeightFor(soul: SoulId | null | undefined): number {
  return soul ? FLUID_SOULS[soul] ?? 0 : 0;
}

/** The fluid is ON by default (filmed 2026-10-14: the smoke souls roll and
 *  billow where curl noise only drifted; flicker gate pass; only the fluid
 *  souls take part — Snowflake / Ghost untouched); `?fluid=0` turns it off. */
export function fluidRequested(search?: string): boolean {
  try { return new URLSearchParams(search ?? (typeof location !== "undefined" ? location.search : "")).get("fluid") !== "0"; } catch { return true; }
}

/** Eased follower (exponential, frame-rate independent). */
export function glide(x: number, target: number, dt: number, tau: number): number {
  return x + (target - x) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tau)));
}

// ── CPU mirror ──────────────────────────────────────────────────────────────

export interface Grid { n: number; half: number; cell: number }
export const grid = (n: number = FLUID_LAWS.N, half: number = FLUID_LAWS.HALF): Grid => ({ n, half, cell: (2 * half) / n });

export function cellOf(g: Grid, p: readonly number[]): number {
  const c = [0, 1, 2].map((k) => Math.floor((p[k] + g.half) / g.cell));
  if (c.some((x) => x < 0 || x >= g.n)) return -1;
  return (c[2] * g.n + c[1]) * g.n + c[0];
}

const at = (g: Grid, x: number, y: number, z: number) => {
  const cx = Math.max(0, Math.min(g.n - 1, x)), cy = Math.max(0, Math.min(g.n - 1, y)), cz = Math.max(0, Math.min(g.n - 1, z));
  return (cz * g.n + cy) * g.n + cx;
};

/** Trilinear sample of a 3-channel field (stride 3) at world p (cell centres). */
export function sample3(g: Grid, f: Float32Array, p: readonly number[]): [number, number, number] {
  const q = [0, 1, 2].map((k) => (p[k] + g.half) / g.cell - 0.5);
  const i = q.map(Math.floor), t = q.map((v, k) => v - i[k]);
  const out: [number, number, number] = [0, 0, 0];
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const w = (dx ? t[0] : 1 - t[0]) * (dy ? t[1] : 1 - t[1]) * (dz ? t[2] : 1 - t[2]);
    const c = at(g, i[0] + dx, i[1] + dy, i[2] + dz) * 3;
    out[0] += f[c] * w; out[1] += f[c + 1] * w; out[2] += f[c + 2] * w;
  }
  return out;
}

/** Central-difference divergence (closed box: zero normal velocity outside). */
export function divergence(g: Grid, u: Float32Array): Float32Array {
  const n = g.n, d = new Float32Array(n * n * n);
  const comp = (x: number, y: number, z: number, k: number) => (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n ? 0 : u[((z * n + y) * n + x) * 3 + k]);
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    d[(z * n + y) * n + x] = (comp(x + 1, y, z, 0) - comp(x - 1, y, z, 0) + comp(x, y + 1, z, 1) - comp(x, y - 1, z, 1) + comp(x, y, z + 1, 2) - comp(x, y, z - 1, 2)) / (2 * g.cell);
  return d;
}

/** One Jacobi sweep of ∇²p = div (Neumann edges: clamp). The WIDE stencil
 *  (±2 cells, (2h)²) is exactly the central divergence of the central gradient
 *  on this collocated grid — the projection then converges instead of fighting
 *  a mismatched compact Laplacian. */
export function jacobi(g: Grid, p: Float32Array, div: Float32Array): Float32Array {
  const n = g.n, o = new Float32Array(p.length), h2 = 4 * g.cell * g.cell;
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const s = p[at(g, x - 2, y, z)] + p[at(g, x + 2, y, z)] + p[at(g, x, y - 2, z)] + p[at(g, x, y + 2, z)] + p[at(g, x, y, z - 2)] + p[at(g, x, y, z + 2)];
    o[(z * n + y) * n + x] = (s - div[(z * n + y) * n + x] * h2) / 6;
  }
  return o;
}

/** u ← u − ∇p (central differences). */
export function project(g: Grid, u: Float32Array, p: Float32Array): Float32Array {
  const n = g.n, o = u.slice();
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = ((z * n + y) * n + x) * 3, k = 1 / (2 * g.cell);
    o[c] -= (p[at(g, x + 1, y, z)] - p[at(g, x - 1, y, z)]) * k;
    o[c + 1] -= (p[at(g, x, y + 1, z)] - p[at(g, x, y - 1, z)]) * k;
    o[c + 2] -= (p[at(g, x, y, z + 1)] - p[at(g, x, y, z - 1)]) * k;
  }
  return o;
}

/** P2G in fixed point (the GPU's atomics): momentum + count per cell. */
export function p2g(g: Grid, pos: readonly number[][], vel: readonly number[][]): Int32Array {
  const S = FLUID_LAWS.SCALE, V = FLUID_LAWS.VMAX;
  const acc = new Int32Array(g.n * g.n * g.n * 4);
  pos.forEach((p, i) => {
    const c = cellOf(g, p);
    if (c < 0) return;
    for (let k = 0; k < 3; k++) acc[c * 4 + k] += Math.round(Math.max(-V, Math.min(V, vel[i][k])) * S);
    acc[c * 4 + 3] += S;
  });
  return acc;
}
