// physics.ts — RK4 double-pendulum integrator used as a note sequencer.
//
// A double pendulum is a canonical chaotic system: two coupled rigid rods
// under gravity whose equations of motion are deterministic yet exhibit
// sensitive dependence on initial conditions (Poincaré; Lorenz's "butterfly
// effect"). We integrate the exact equations with classic 4th-order
// Runge–Kutta and read note events off the tip's motion.

/** Small seeded PRNG (mulberry32). Deterministic — never Math.random. */
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

// Fixed physical constants. Equal-ish masses, equal lengths keep the motion
// energetic and long-lived (little numerical damping with RK4).
export const G = 9.81;
export const M1 = 1.0;
export const M2 = 1.0;
export const L1 = 0.26;
export const L2 = 0.26;

// Plot geometry (world coordinates, y up). The pivot sits high so the tip
// sweeps the middle of the frame.
export const PIVOT_X = 0.0;
export const PIVOT_Y = 0.36;

/** State vector: [theta1, omega1, theta2, omega2]. */
export type State = [number, number, number, number];

export interface Pendulum {
  s: State;
}

/** Derivative of the state — the double-pendulum equations of motion. */
function deriv(s: State): State {
  const [a1, w1, a2, w2] = s;
  const d = a1 - a2;
  const cd = Math.cos(d);
  const sd = Math.sin(d);
  const denom = 2 * M1 + M2 - M2 * Math.cos(2 * a1 - 2 * a2);

  const num1 =
    -G * (2 * M1 + M2) * Math.sin(a1) -
    M2 * G * Math.sin(a1 - 2 * a2) -
    2 * sd * M2 * (w2 * w2 * L2 + w1 * w1 * L1 * cd);
  const a1a = num1 / (L1 * denom);

  const num2 =
    2 *
    sd *
    (w1 * w1 * L1 * (M1 + M2) +
      G * (M1 + M2) * Math.cos(a1) +
      w2 * w2 * L2 * M2 * cd);
  const a2a = num2 / (L2 * denom);

  return [w1, a1a, w2, a2a];
}

/** One classic RK4 step of size dt. */
export function step(s: State, dt: number): State {
  const k1 = deriv(s);
  const s2: State = [
    s[0] + (k1[0] * dt) / 2,
    s[1] + (k1[1] * dt) / 2,
    s[2] + (k1[2] * dt) / 2,
    s[3] + (k1[3] * dt) / 2,
  ];
  const k2 = deriv(s2);
  const s3: State = [
    s[0] + (k2[0] * dt) / 2,
    s[1] + (k2[1] * dt) / 2,
    s[2] + (k2[2] * dt) / 2,
    s[3] + (k2[3] * dt) / 2,
  ];
  const k3 = deriv(s3);
  const s4: State = [
    s[0] + k3[0] * dt,
    s[1] + k3[1] * dt,
    s[2] + k3[2] * dt,
    s[3] + k3[3] * dt,
  ];
  const k4 = deriv(s4);
  return [
    s[0] + ((k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) * dt) / 6,
    s[1] + ((k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) * dt) / 6,
    s[2] + ((k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) * dt) / 6,
    s[3] + ((k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]) * dt) / 6,
  ];
}

export interface Joints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Cartesian joint positions from the current angles. */
export function joints(s: State): Joints {
  const x1 = PIVOT_X + L1 * Math.sin(s[0]);
  const y1 = PIVOT_Y - L1 * Math.cos(s[0]);
  const x2 = x1 + L2 * Math.sin(s[2]);
  const y2 = y1 - L2 * Math.cos(s[2]);
  return { x1, y1, x2, y2 };
}

/**
 * Seed a deterministic, energetic initial condition. Both rods start raised
 * near horizontal so the motion is immediately chaotic (never settles).
 */
export function seededStart(seed: number): State {
  const r = mulberry32(seed);
  const a1 = 1.9 + r() * 0.9; // ~109°..160° from rest
  const a2 = 1.9 + r() * 0.9;
  return [a1, 0, a2, 0];
}
