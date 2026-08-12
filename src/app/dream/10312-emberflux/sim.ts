// ─────────────────────────────────────────────────────────────────────────────
// Shared types + constants for the emberflux convection lane.
//
// Both the WebGPU compute backend and the WebGL2 fragment-shader ping-pong
// backend implement the same `Backend` contract and run the same Boussinesq
// Rayleigh–Bénard math (vorticity–streamfunction form):
//
//   ∂T/∂t + u·∇T = κ∇²T                (hot bottom row, cold top row)
//   ∂ω/∂t + u·∇ω = ν∇²ω + buoyancy      buoyancy = β (g × ∇T)_z
//   ∇²ψ = −ω                            (Jacobi Poisson solve)
//   u =  ∂ψ/∂y ,  v = −∂ψ/∂x           (divergence-free by construction)
//
// Gravity is the conductor: tilting the phone rotates (gx, gy) so the plumes
// lean and the boiling drifts toward the low side.
// ─────────────────────────────────────────────────────────────────────────────

export const SIM_W = 256;
export const SIM_H = 160;
export const POISSON_ITERS = 24;

// Coarse probe grid read back to the CPU to drive audio (kinetic energy for the
// drone, per-cell vertical-velocity threshold for overturn chimes).
export const PROBE_COLS = 24;
export const PROBE_ROWS = 15;

export interface SimStep {
  /** Gravity direction (unit-ish). Default down = (0, -1); tilt rotates it. */
  gx: number;
  gy: number;
  /** Buoyancy strength β — how hard temperature contrast drives vorticity. */
  buoy: number;
  /** Advection timestep (semi-Lagrangian, so stable at dt≈1). */
  dt: number;
}

/** Coarse readback: cols×rows cells, each = { t, v, speed }. */
export interface ProbeGrid {
  cols: number;
  rows: number;
  /** length = cols*rows*3, laid out row-major as [t, v, speed, …]. */
  data: Float32Array;
}

export interface Backend {
  kind: "webgpu" | "webgl";
  step(s: SimStep): void;
  /** Latest coarse probe, or null if not ready this frame. */
  probe(): ProbeGrid | null;
  destroy(): void;
}
