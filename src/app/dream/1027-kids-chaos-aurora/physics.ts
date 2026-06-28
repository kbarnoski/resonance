// ════════════════════════════════════════════════════════════════════════════
// physics.ts — Real double-pendulum dynamics (1027 Kids Chaos Aurora)
//
// A genuine double pendulum integrated from the Lagrangian equations of motion
// with a fixed-step RK4 integrator and light damping. This is deterministic
// chaos: the trajectory of the lower bob is fully determined by its state, yet
// (sensitive dependence on initial conditions) it never exactly repeats. That
// chaotic-but-bounded path is the generative engine for both aurora and song.
//
// All functions here are PURE (no DOM, no globals) so chaos.test.ts can import
// and run them headlessly.
// ════════════════════════════════════════════════════════════════════════════

export interface PendulumState {
  // Angles measured from the downward vertical (radians).
  t1: number; // theta1 — upper arm
  t2: number; // theta2 — lower arm
  w1: number; // omega1 — upper angular velocity
  w2: number; // omega2 — lower angular velocity
}

export interface PendulumParams {
  m1: number; // upper bob mass
  m2: number; // lower bob mass
  l1: number; // upper rod length
  l2: number; // lower rod length
  g: number; // gravity magnitude
  damping: number; // velocity damping coefficient (per second), small & positive
}

export const DEFAULT_PARAMS: PendulumParams = {
  m1: 1,
  m2: 1,
  l1: 1,
  l2: 1,
  g: 9.81,
  damping: 0.18,
};

// Angular accelerations from the standard double-pendulum equations of motion.
// gx allows a tilted gravity direction (device tilt) without changing the math:
// we treat (g) as the magnitude and pass an angle offset via gAngle.
export function computeAccel(
  s: PendulumState,
  p: PendulumParams,
  gAngle = 0,
): { a1: number; a2: number } {
  const { m1, m2, l1, l2, g } = p;
  const { t1, t2, w1, w2 } = s;

  // Tilting gravity = rotating the whole frame by gAngle. We fold that into the
  // angle the bobs make with the (effective) gravity vector.
  const p1 = t1 - gAngle;
  const p2 = t2 - gAngle;
  const d = p1 - p2;
  const sinD = Math.sin(d);
  const cosD = Math.cos(d);

  const denom = 2 * m1 + m2 - m2 * Math.cos(2 * d);

  const a1 =
    (-g * (2 * m1 + m2) * Math.sin(p1) -
      m2 * g * Math.sin(p1 - 2 * p2) -
      2 * sinD * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * cosD)) /
    (l1 * denom);

  const a2 =
    (2 *
      sinD *
      (w1 * w1 * l1 * (m1 + m2) +
        g * (m1 + m2) * Math.cos(p1) +
        w2 * w2 * l2 * m2 * cosD)) /
    (l2 * denom);

  return { a1, a2 };
}

// One RK4 step of dt seconds. Returns a NEW state (pure). Damping is applied as
// a gentle exponential decay on the angular velocities after the integration so
// the system always eventually settles (then the auto-demo re-flicks it).
export function stepRK4(
  s: PendulumState,
  p: PendulumParams,
  dt: number,
  gAngle = 0,
): PendulumState {
  const deriv = (st: PendulumState) => {
    const { a1, a2 } = computeAccel(st, p, gAngle);
    return { t1: st.w1, t2: st.w2, w1: a1, w2: a2 };
  };

  const add = (a: PendulumState, b: PendulumState, h: number): PendulumState => ({
    t1: a.t1 + b.t1 * h,
    t2: a.t2 + b.t2 * h,
    w1: a.w1 + b.w1 * h,
    w2: a.w2 + b.w2 * h,
  });

  const k1 = deriv(s);
  const k2 = deriv(add(s, k1, dt / 2));
  const k3 = deriv(add(s, k2, dt / 2));
  const k4 = deriv(add(s, k3, dt));

  let next: PendulumState = {
    t1: s.t1 + (dt / 6) * (k1.t1 + 2 * k2.t1 + 2 * k3.t1 + k4.t1),
    t2: s.t2 + (dt / 6) * (k1.t2 + 2 * k2.t2 + 2 * k3.t2 + k4.t2),
    w1: s.w1 + (dt / 6) * (k1.w1 + 2 * k2.w1 + 2 * k3.w1 + k4.w1),
    w2: s.w2 + (dt / 6) * (k1.w2 + 2 * k2.w2 + 2 * k3.w2 + k4.w2),
  };

  // Light damping (frame-rate independent).
  const decay = Math.exp(-p.damping * dt);
  next = { ...next, w1: next.w1 * decay, w2: next.w2 * decay };

  return next;
}

// Total mechanical energy (kinetic + potential), used by the test to verify the
// undamped integrator conserves energy. Potential reference: pivot at origin.
export function totalEnergy(s: PendulumState, p: PendulumParams): number {
  const { m1, m2, l1, l2, g } = p;
  const { t1, t2, w1, w2 } = s;

  // Kinetic energy of the two bobs.
  const ke =
    0.5 * m1 * l1 * l1 * w1 * w1 +
    0.5 *
      m2 *
      (l1 * l1 * w1 * w1 +
        l2 * l2 * w2 * w2 +
        2 * l1 * l2 * w1 * w2 * Math.cos(t1 - t2));

  // Potential energy (heights measured downward from pivot, so -cos).
  const y1 = -l1 * Math.cos(t1);
  const y2 = y1 - l2 * Math.cos(t2);
  const pe = m1 * g * y1 + m2 * g * y2;

  return ke + pe;
}

// Cartesian position of the lower bob (pivot at origin, +y is down in math).
export function lowerBobPos(
  s: PendulumState,
  p: PendulumParams,
): { x: number; y: number } {
  const x = p.l1 * Math.sin(s.t1) + p.l2 * Math.sin(s.t2);
  const y = p.l1 * Math.cos(s.t1) + p.l2 * Math.cos(s.t2);
  return { x, y };
}

// Speed of the lower bob (magnitude of its velocity), used to drive brightness.
export function lowerBobSpeed(s: PendulumState, p: PendulumParams): number {
  const vx = p.l1 * s.w1 * Math.cos(s.t1) + p.l2 * s.w2 * Math.cos(s.t2);
  const vy = -p.l1 * s.w1 * Math.sin(s.t1) - p.l2 * s.w2 * Math.sin(s.t2);
  return Math.hypot(vx, vy);
}

// Apply an impulse (a "flick") to the lower bob's angular velocity. Bounded so a
// 4-year-old mashing the screen can never blow the system up.
export function applyFlick(s: PendulumState, strength: number): PendulumState {
  const kick = Math.max(-6, Math.min(6, strength));
  return {
    ...s,
    w1: s.w1 + kick * 0.4,
    w2: s.w2 + kick * 1.0,
  };
}

// A measure of how "settled" the system is (near-zero kinetic energy).
export function isSettled(s: PendulumState): boolean {
  return Math.abs(s.w1) < 0.12 && Math.abs(s.w2) < 0.12;
}
