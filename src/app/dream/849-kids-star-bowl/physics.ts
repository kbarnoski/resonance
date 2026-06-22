// Tilt-gravity marble physics for the Star Bowl.
//
// The bowl is a circular dish in a unit-ish space: marbles live on the
// xy plane (radius space), and a parabolic well pulls them toward center.
// A tilt gravity vector (gx, gy) — derived from device orientation or a
// pointer drag — pushes them around. The depth/height of each marble in
// the bowl is purely a function of its radius (r) so the visual y-lift
// reads as "climbing the rim."
//
// Output of interest: the cluster's mean radius (0 = center/calm,
// 1 = rim/spiky). That single scalar drives the harmony engine.

export const BOWL_R = 1.0; // logical rim radius

export interface Marble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  seed: number; // stable per-marble randomness (twinkle phase etc.)
}

export interface SimParams {
  gx: number; // tilt gravity, x (-1..1-ish)
  gy: number; // tilt gravity, y
  dt: number; // clamped frame delta (seconds)
}

// Tuning — chosen to feel slow, calm, and toddler-forgiving.
const WELL_PULL = 2.6; // how strongly the parabolic bowl recenters marbles
const TILT_FORCE = 3.1; // how much tilt accelerates marbles
const DAMP = 0.86; // per-step velocity damping (heavy, syrupy roll)
const RIM_BOUNCE = 0.42; // soft restitution at the rim
const MAX_SPEED = 2.4;

export function makeMarbles(count: number): Marble[] {
  const out: Marble[] = [];
  for (let i = 0; i < count; i++) {
    // Start clustered gently near center using a sqrt distribution.
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.35;
    out.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      vx: 0,
      vy: 0,
      seed: Math.random(),
    });
  }
  return out;
}

// Advance the simulation one step. Mutates marbles in place.
export function runStep(marbles: Marble[], p: SimParams): void {
  const dt = Math.min(p.dt, 1 / 30); // clamp to avoid blowups after tab-away
  for (const m of marbles) {
    const r = Math.hypot(m.x, m.y) || 1e-5;
    // Parabolic well: restoring force grows toward center the further out
    // you are, but capped so the rim stays reachable, not a sheer wall.
    const wellAx = -(m.x / r) * WELL_PULL * r;
    const wellAy = -(m.y / r) * WELL_PULL * r;

    // Tilt gravity pushes all marbles the same way.
    const ax = p.gx * TILT_FORCE + wellAx;
    const ay = p.gy * TILT_FORCE + wellAy;

    m.vx = (m.vx + ax * dt) * DAMP;
    m.vy = (m.vy + ay * dt) * DAMP;

    // Clamp speed (calm).
    const sp = Math.hypot(m.vx, m.vy);
    if (sp > MAX_SPEED) {
      m.vx = (m.vx / sp) * MAX_SPEED;
      m.vy = (m.vy / sp) * MAX_SPEED;
    }

    m.x += m.vx * dt;
    m.y += m.vy * dt;

    // Soft rim containment — bounce gently back inside.
    const nr = Math.hypot(m.x, m.y);
    if (nr > BOWL_R) {
      const nx = m.x / nr;
      const ny = m.y / nr;
      m.x = nx * BOWL_R;
      m.y = ny * BOWL_R;
      // reflect velocity component along normal, damped
      const vn = m.vx * nx + m.vy * ny;
      m.vx -= (1 + RIM_BOUNCE) * vn * nx;
      m.vy -= (1 + RIM_BOUNCE) * vn * ny;
    }
  }
}

// Mean radius of the cluster, 0 (pooled at center) .. 1 (climbing rim).
export function clusterRadius(marbles: Marble[]): number {
  if (marbles.length === 0) return 0;
  let s = 0;
  for (const m of marbles) s += Math.hypot(m.x, m.y);
  return Math.min(1, s / marbles.length / BOWL_R);
}

// Height of a marble in the bowl as a function of radius (for the 3D lift).
// Center is the lowest point of the dish; rim is highest.
export function bowlHeight(r: number): number {
  return r * r * 0.55;
}
