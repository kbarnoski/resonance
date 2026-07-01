// ─────────────────────────────────────────────────────────────────────────────
// lenia.ts — the Lenia continuous cellular automaton model.
//
//   Lenia (Bert Wang-Chak Chan, 2019) generalizes Conway's Game of Life to
//   continuous state, space and time. A cell holds a real value A ∈ [0,1]. Each
//   step:
//     1. convolve the field with a smooth ring-shaped kernel K   →  U = K ∗ A
//     2. apply a smooth Gaussian growth mapping                  →  G(U)
//     3. integrate:  A ← clamp(A + dt·G(U), 0, 1)
//   with G(u) = 2·exp(-((u-μ)²)/(2σ²)) - 1.
//
//   Tuned near the classic "Orbium" regime (R≈13, μ≈0.15, σ≈0.017, dt≈0.1) this
//   spontaneously grows smooth, gliding life-forms out of a seeded blob rather
//   than dying to 0 or saturating to 1.
//
//   This module holds: the parameter presets, the precomputed ring kernel, and a
//   plain-JS reference implementation of the update — which the CPU fallback runs
//   directly and which the WGSL compute shader mirrors exactly.
// ─────────────────────────────────────────────────────────────────────────────

/** A named growth regime — one "species" of Lenia creature. */
export interface Regime {
  key: string;
  /** short label for the UI button */
  label: string;
  /** kernel radius in cells */
  R: number;
  /** growth centre */
  mu: number;
  /** growth width */
  sigma: number;
  /** time step */
  dt: number;
  /** relative radii of the kernel's concentric shells (peaks), 0..1 */
  shells: number[];
  /** relative heights of those shells */
  shellPeaks: number[];
}

// A small stable of regimes. Each is chosen to stay "alive": a seeded gaussian
// blob reliably grows into living, organizing structure without dying to 0 or
// saturating to all-1. Verified by Node simulation across seed sizes (see
// README "Verification"). They sit near — but not on — the classic Orbium point
// (R≈13, μ≈0.15). A slightly wider σ makes them robust to the symmetric taps
// this instrument uses, at the cost of the razor-edge orbium's clean gliding.
//
// `shells` are relative radii of the kernel's concentric bell peaks (0..1) and
// `shellPeaks` their heights. Each shell is a canonical Lenia exponential bell.
export const REGIMES: Regime[] = [
  {
    key: "orbium",
    label: "Orbium",
    R: 13,
    mu: 0.15,
    sigma: 0.03,
    dt: 0.1,
    shells: [0.5],
    shellPeaks: [1],
  },
  {
    key: "rotor",
    label: "Rotor",
    R: 16,
    mu: 0.2,
    sigma: 0.038,
    dt: 0.1,
    shells: [0.5, 1.0],
    shellPeaks: [1, 0.45],
  },
  {
    key: "colony",
    label: "Colony",
    R: 18,
    mu: 0.22,
    sigma: 0.045,
    dt: 0.1,
    shells: [0.35, 0.7, 1.0],
    shellPeaks: [0.6, 1, 0.4],
  },
];

export function regimeByKey(key: string): Regime {
  return REGIMES.find((r) => r.key === key) ?? REGIMES[0];
}

// ── Kernel ──────────────────────────────────────────────────────────────────
// A ring kernel is a sum of gaussian "shells" evaluated over normalized radius
// r/R ∈ [0,1]. The core is excluded (r=0 contributes ~0) so it is annular. The
// kernel is L1-normalized so that U = K∗A stays in a comparable range to A.

/** A flattened square kernel of side (2R+1), plus its side length. */
export interface Kernel {
  side: number;
  R: number;
  data: Float32Array;
}

/**
 * The canonical Lenia kernel "core" bell: K(x) = exp(4 - 4/(4x(1-x))) for
 * x ∈ (0,1), peaking at 1.0 at x=0.5, smoothly → 0 at the ends. The ring kernel
 * is a sum of these bells, one per shell, each stretched so its peak sits at the
 * shell's relative radius.
 */
function kernelShell(rNorm: number, peaks: number[], heights: number[]): number {
  let v = 0;
  for (let i = 0; i < peaks.length; i++) {
    const x = rNorm / peaks[i]; // rescale so this shell's peak lands at r = peak
    if (x > 0 && x < 1) {
      v += heights[i] * Math.exp(4 - 4 / (4 * x * (1 - x)));
    }
  }
  return v;
}

export function buildKernel(reg: Regime): Kernel {
  const R = reg.R;
  const side = 2 * R + 1;
  const data = new Float32Array(side * side);
  let sum = 0;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const dx = x - R;
      const dy = y - R;
      const r = Math.sqrt(dx * dx + dy * dy) / R; // normalized radius
      let w = 0;
      if (r > 0 && r <= 1) {
        w = kernelShell(r, reg.shells, reg.shellPeaks);
      }
      data[y * side + x] = w;
      sum += w;
    }
  }
  // L1-normalize
  if (sum > 0) {
    for (let i = 0; i < data.length; i++) data[i] /= sum;
  }
  return { side, R, data };
}

/** Smooth Gaussian growth mapping G(u) ∈ [-1, 1]. */
export function growth(u: number, mu: number, sigma: number): number {
  const d = (u - mu) / sigma;
  return 2 * Math.exp(-0.5 * d * d) - 1;
}

// ── CPU field ────────────────────────────────────────────────────────────────

export interface CpuLenia {
  size: number;
  A: Float32Array;
  next: Float32Array;
  reg: Regime;
  kernel: Kernel;
}

export function makeCpuLenia(size: number, reg: Regime): CpuLenia {
  return {
    size,
    A: new Float32Array(size * size),
    next: new Float32Array(size * size),
    reg,
    kernel: buildKernel(reg),
  };
}

export function setCpuRegime(sim: CpuLenia, reg: Regime): void {
  sim.reg = reg;
  sim.kernel = buildKernel(reg);
}

/**
 * Seed a soft gaussian blob of living matter at normalized (nx, ny). This is the
 * "tap to spawn a creature" primitive — the Lenia dynamics then grow it.
 */
export function seedCpu(sim: CpuLenia, nx: number, ny: number, radius: number, amp: number): void {
  const { size, A } = sim;
  const cx = nx * size;
  const cy = ny * size;
  const rad = radius * size;
  const r0 = Math.max(1, Math.floor(rad * 2.2));
  const ix = Math.round(cx);
  const iy = Math.round(cy);
  for (let dy = -r0; dy <= r0; dy++) {
    for (let dx = -r0; dx <= r0; dx++) {
      const x = ((ix + dx) % size + size) % size;
      const y = ((iy + dy) % size + size) % size;
      const d2 = (dx * dx + dy * dy) / (rad * rad);
      const v = amp * Math.exp(-0.5 * d2);
      const idx = y * size + x;
      A[idx] = Math.min(1, A[idx] + v);
    }
  }
}

/** One Lenia update on the CPU (toroidal wrap). Mirrors the WGSL exactly. */
export function stepCpu(sim: CpuLenia): void {
  const { size, A, next, kernel, reg } = sim;
  const { data, R, side } = kernel;
  const { mu, sigma, dt } = reg;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let u = 0;
      // direct convolution over the (2R+1)² kernel
      for (let ky = 0; ky < side; ky++) {
        const sy = ((y + ky - R) % size + size) % size;
        const rowA = sy * size;
        const rowK = ky * side;
        for (let kx = 0; kx < side; kx++) {
          const sx = ((x + kx - R) % size + size) % size;
          u += A[rowA + sx] * data[rowK + kx];
        }
      }
      const g = growth(u, mu, sigma);
      let a = A[y * size + x] + dt * g;
      if (a < 0) a = 0;
      else if (a > 1) a = 1;
      next[y * size + x] = a;
    }
  }
  sim.A.set(next);
}

/** Cheap global summaries the audio engine reads each frame. */
export interface FieldStats {
  /** mean of A over the field, 0..1 — "how much life" */
  mass: number;
  /** normalized vertical centroid of mass, 0 (top) .. 1 (bottom) */
  centroidY: number;
  /** normalized horizontal centroid */
  centroidX: number;
  /** mean |ΔA| this step — "turbulence / motion" */
  motion: number;
  /** count of locally-bright active regions (coarse) */
  activity: number;
}

export function statsCpu(sim: CpuLenia, prev: Float32Array | null): FieldStats {
  const { size, A } = sim;
  let mass = 0;
  let mx = 0;
  let my = 0;
  let motion = 0;
  let activity = 0;
  const n = size * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const a = A[i];
      mass += a;
      mx += a * x;
      my += a * y;
      if (prev) motion += Math.abs(a - prev[i]);
      if (a > 0.35) activity += 1;
    }
  }
  const total = mass > 1e-6 ? mass : 1e-6;
  return {
    mass: mass / n,
    centroidX: mx / total / size,
    centroidY: my / total / size,
    motion: prev ? motion / n : 0,
    activity: activity / n,
  };
}
