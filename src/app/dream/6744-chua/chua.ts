// ════════════════════════════════════════════════════════════════════════════
// Chua's circuit — dimensionless state equations + shared helpers.
//
// This file holds the SAME model that runs inside the AudioWorklet (see
// worklet.ts), but as plain TypeScript. It is used for two things on the MAIN
// thread: (1) the seeded, silent pre-Start visual so the phase-space animates
// before any audio; (2) the reduced main-thread fallback synth when AudioWorklet
// is unavailable. The worklet keeps its own copy as a string so TS never
// type-checks worklet-global identifiers (sampleRate, registerProcessor, …).
//
// Equations (Chua 1983), with the piecewise-linear Chua-diode f(x):
//   dx/dt = alpha * ( y - x - f(x) )
//   dy/dt = x - y + z
//   dz/dt = -beta * y
//   f(x)  = m1*x + 0.5*(m0 - m1)*( |x + 1| - |x - 1| )
// Classic double-scroll: alpha≈15.6, beta≈28, m0=-1.143, m1=-0.714.
// ════════════════════════════════════════════════════════════════════════════

export type Vec3 = { x: number; y: number; z: number };

export type ChuaParams = {
  alpha: number; // bifurcation knob (route to chaos)
  beta: number;
  m0: number; // inner slope of the Chua diode (nonlinearity breakpoint)
  m1: number; // outer slope
};

export const DEFAULT_PARAMS: ChuaParams = {
  alpha: 15.6,
  beta: 28,
  m0: -1.143,
  m1: -0.714,
};

// The bifurcation knob is a 0..1 UI value; map it into a musically/dynamically
// useful alpha window that walks the period-doubling route to chaos.
export const ALPHA_MIN = 6.8;
export const ALPHA_MAX = 16.2;

export function alphaFromKnob(knob: number): number {
  const k = Math.min(1, Math.max(0, knob));
  return ALPHA_MIN + k * (ALPHA_MAX - ALPHA_MIN);
}

export function knobFromAlpha(alpha: number): number {
  return (alpha - ALPHA_MIN) / (ALPHA_MAX - ALPHA_MIN);
}

// The piecewise-linear Chua diode.
export function chuaDiode(x: number, m0: number, m1: number): number {
  return m1 * x + 0.5 * (m0 - m1) * (Math.abs(x + 1) - Math.abs(x - 1));
}

export function chuaDeriv(s: Vec3, p: ChuaParams): Vec3 {
  const fx = chuaDiode(s.x, p.m0, p.m1);
  return {
    x: p.alpha * (s.y - s.x - fx),
    y: s.x - s.y + s.z,
    z: -p.beta * s.y,
  };
}

// One classical RK4 step of size dt (dimensionless time).
export function stepRK4(s: Vec3, p: ChuaParams, dt: number): Vec3 {
  const k1 = chuaDeriv(s, p);
  const s2: Vec3 = { x: s.x + 0.5 * dt * k1.x, y: s.y + 0.5 * dt * k1.y, z: s.z + 0.5 * dt * k1.z };
  const k2 = chuaDeriv(s2, p);
  const s3: Vec3 = { x: s.x + 0.5 * dt * k2.x, y: s.y + 0.5 * dt * k2.y, z: s.z + 0.5 * dt * k2.z };
  const k3 = chuaDeriv(s3, p);
  const s4: Vec3 = { x: s.x + dt * k3.x, y: s.y + dt * k3.y, z: s.z + dt * k3.z };
  const k4 = chuaDeriv(s4, p);
  return {
    x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    z: s.z + (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
  };
}

// ── Regime labelling ────────────────────────────────────────────────────────
// Coarse label mapped from alpha within [ALPHA_MIN, ALPHA_MAX]. The audible /
// visible progression, holding beta=28: stable spiral → period-1 limit cycle →
// period-2 → period-4 → single-scroll chaos → double-scroll chaos.
export type Regime = "limit cycle" | "period-2" | "period-4" | "chaos" | "double scroll";

export function regimeFromAlpha(alpha: number): Regime {
  if (alpha < 8.3) return "limit cycle";
  if (alpha < 8.75) return "period-2";
  if (alpha < 9.0) return "period-4";
  if (alpha < 13.0) return "chaos";
  return "double scroll";
}

// A 0..1 "chaos meter" from alpha, used before a live Lyapunov estimate exists
// and as a smooth fallback. Roughly tracks the onset of positive Lyapunov.
export function chaosFromAlpha(alpha: number): number {
  const t = (alpha - 8.4) / (ALPHA_MAX - 8.4);
  return Math.min(1, Math.max(0, t));
}

// ── Seeded PRNG (mulberry32) — determinism, no Math.random ──────────────────
export function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
