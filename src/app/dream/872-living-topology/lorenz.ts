/*
 * 872 · LIVING TOPOLOGY — Lorenz attractor steering core
 *
 * The classic Lorenz system (Edward Lorenz, "Deterministic Nonperiodic Flow",
 * J. Atmos. Sci. 1963):
 *
 *   dx = σ(y − x) dt
 *   dy = (x(ρ − z) − y) dt
 *   dz = (xy − βz) dt
 *
 * Integrated with a small fixed dt and several steps per animation frame, this
 * never repeats. We expose its evolving (x, y, z) state — normalized to [0,1] —
 * as the continuous driver that rewires the coupling topology of a feedback
 * resonator network. The chaotic drift means minute 5 differs from minute 1.
 */

export interface LorenzState {
  x: number;
  y: number;
  z: number;
}

// Classic chaotic parameters.
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;

// Approximate bounds of the canonical Lorenz attractor, used to normalize
// each component into [0,1] for mapping onto coupling weights.
const X_RANGE: [number, number] = [-20, 20];
const Y_RANGE: [number, number] = [-27, 27];
const Z_RANGE: [number, number] = [0, 50];

export function createLorenz(seed: Partial<LorenzState> = {}): LorenzState {
  return {
    x: seed.x ?? 0.1,
    y: seed.y ?? 0.0,
    z: seed.z ?? 0.0,
  };
}

// Advance the Lorenz system by `steps` increments of `dt` (Euler integration).
// dt small (~0.005) keeps it stable; several steps/frame controls drift speed.
export function stepLorenz(s: LorenzState, dt: number, steps: number): void {
  for (let i = 0; i < steps; i++) {
    const dx = SIGMA * (s.y - s.x);
    const dy = s.x * (RHO - s.z) - s.y;
    const dz = s.x * s.y - BETA * s.z;
    s.x += dx * dt;
    s.y += dy * dt;
    s.z += dz * dt;
  }
}

function norm(v: number, range: [number, number]): number {
  const t = (v - range[0]) / (range[1] - range[0]);
  return Math.min(1, Math.max(0, t));
}

// Normalized components in [0,1] for mapping onto the topology.
export function normalizeLorenz(s: LorenzState): LorenzState {
  return {
    x: norm(s.x, X_RANGE),
    y: norm(s.y, Y_RANGE),
    z: norm(s.z, Z_RANGE),
  };
}

// Produce a ghost-trail of recent attractor points (in raw coordinates) so the
// driver curve can be drawn drifting through the scene center.
export function sampleTrail(
  s: LorenzState,
  dt: number,
  count: number
): Array<[number, number, number]> {
  const trail: Array<[number, number, number]> = [];
  // Integrate forward on a *copy* so we don't disturb the live state.
  const tmp: LorenzState = { x: s.x, y: s.y, z: s.z };
  for (let i = 0; i < count; i++) {
    trail.push([tmp.x, tmp.y, tmp.z]);
    stepLorenz(tmp, dt, 2);
  }
  return trail;
}
