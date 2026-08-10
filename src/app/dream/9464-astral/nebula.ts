// nebula.ts — shared vocabulary for the particle nebula.
//
// Both substrates (WebGPU compute in gpu.ts, and the Canvas2D fallback in
// fallback.ts) implement the same NebulaEngine contract and are driven by the
// same StepArgs each frame, so page.tsx can hold either behind one reference.
//
// Everything deterministic in this piece flows from mulberry32(SEED) — no
// Math.random / Date.now anywhere — so a given performance always paints the
// same star-field.

/** Deterministic PRNG. Seed once, reuse — never Math.random(). */
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

/** The seed used everywhere in this prototype. */
export const SEED = 0x9464;

/** Particle budget for the WebGPU substrate (storage buffer). */
export const GPU_PARTICLES = 90000;

/** Far smaller budget for the CPU/Canvas2D fallback so it stays smooth. */
export const CPU_PARTICLES = 3600;

/** How long a star-agent lives, in seconds, before it is recycled. */
export const PARTICLE_LIFE = 9.0;

/** Seconds for the auto-ramp of convergence from diffuse cloud to tunnel. */
export const CONVERGENCE_SECONDS = 210;

/** One frame of drive from page.tsx into whichever substrate is live. */
export interface StepArgs {
  /** Delta time, seconds (clamped upstream). */
  dt: number;
  /** Elapsed time since Begin, seconds. */
  time: number;
  /** 0 = diffuse scattered cloud … 1 = fully converged tunnel-to-light. */
  convergence: number;
  /** Overall exposure, driven by loudness (RMS). ~0.5 … ~2. */
  brightness: number;
  /** Number of fresh star-agents to emit this frame (from onsets). */
  spawn: number;
  /** Honor prefers-reduced-motion: slow the drift, tame the swings. */
  reduced: boolean;
}

/** The common contract page.tsx drives, regardless of substrate. */
export interface NebulaEngine {
  readonly backend: "GPU" | "Canvas2D";
  step(args: StepArgs): void;
  resize(w: number, h: number, dpr: number): void;
  destroy(): void;
}

export interface Phase {
  name: string;
  /** convergence value at/after which this phase begins */
  at: number;
}

/** The long-form arc, made legible on screen so the evolution reads. */
export const PHASES: Phase[] = [
  { name: "Drift", at: 0 },
  { name: "Gathering", at: 0.28 },
  { name: "Convergence", at: 0.58 },
  { name: "Tunnel of light", at: 0.86 },
];

export function phaseFor(convergence: number): Phase {
  let p = PHASES[0];
  for (const cand of PHASES) {
    if (convergence >= cand.at) p = cand;
  }
  return p;
}

// ── Curl-noise flow field (CPU mirror of the WGSL version) ──────────────────
// Value noise + analytic-ish curl by finite differences of a scalar potential.
// The GPU shader reimplements the identical maths in WGSL; keeping a JS copy
// lets the Canvas2D fallback advect through the same field shape.

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Curl of the noise potential at (x,y): a divergence-free swirl field. */
export function curl(x: number, y: number): [number, number] {
  const e = 0.08;
  const n1 = valueNoise(x, y + e);
  const n2 = valueNoise(x, y - e);
  const n3 = valueNoise(x + e, y);
  const n4 = valueNoise(x - e, y);
  const dydx = (n1 - n2) / (2 * e);
  const dxdy = (n3 - n4) / (2 * e);
  return [dydx, -dxdy];
}
