// CPU Verlet mass-spring cloth (Provot-style) with PBD constraint relaxation.
// Four corners pinned. Structural + shear + bend springs. Sphere collision.
// The cloth lies roughly in the X-Z plane; Y is the springy "down/up" axis
// (the sheet sags away from the camera when the moon-ball presses it).

export const N = 24; // grid is N x N points (tuned for 60fps on a mid phone)
const SIZE = 4.0; // world-space extent of the cloth
const STEP = SIZE / (N - 1);
export const REST_Y = 0; // resting plane

const STIFF = 0.9; // PBD stiffness 0..1
const RELAX_PASSES = 3; // constraint-relaxation passes per frame
const MAX_STRETCH = 1.12; // Provot over-elongation cap (fraction of rest length)
const DAMP = 0.985; // velocity damping (Verlet implicit)
const GRAVITY_Y = -2.4; // gentle settling toward rest plane

export interface Cloth {
  // Position arrays (current + previous, for Verlet).
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  oz: Float32Array;
  pinned: Uint8Array;
  // Springs encoded as [i, j, restLen] triples.
  springs: number[];
  // Diagnostics fed to audio.
  maxDent: number; // deepest downward displacement (>=0)
  rippleEnergy: number; // sum of squared vertical velocities (motion)
}

function idx(i: number, j: number): number {
  return j * N + i;
}

export function makeCloth(): Cloth {
  const count = N * N;
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  const pinned = new Uint8Array(count);

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = idx(i, j);
      px[k] = -SIZE / 2 + i * STEP;
      py[k] = REST_Y;
      pz[k] = -SIZE / 2 + j * STEP;
    }
  }

  // Pin the four corners.
  pinned[idx(0, 0)] = 1;
  pinned[idx(N - 1, 0)] = 1;
  pinned[idx(0, N - 1)] = 1;
  pinned[idx(N - 1, N - 1)] = 1;

  const ox = px.slice();
  const oy = py.slice();
  const oz = pz.slice();

  const springs: number[] = [];
  const addSpring = (a: number, b: number) => {
    const dx = px[a] - px[b];
    const dy = py[a] - py[b];
    const dz = pz[a] - pz[b];
    springs.push(a, b, Math.hypot(dx, dy, dz));
  };

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = idx(i, j);
      // Structural (right / down)
      if (i + 1 < N) addSpring(k, idx(i + 1, j));
      if (j + 1 < N) addSpring(k, idx(i, j + 1));
      // Shear (diagonals)
      if (i + 1 < N && j + 1 < N) addSpring(k, idx(i + 1, j + 1));
      if (i + 1 < N && j - 1 >= 0) addSpring(k, idx(i + 1, j - 1));
      // Bend (skip one)
      if (i + 2 < N) addSpring(k, idx(i + 2, j));
      if (j + 2 < N) addSpring(k, idx(i, j + 2));
    }
  }

  return {
    px,
    py,
    pz,
    ox,
    oy,
    oz,
    pinned,
    springs,
    maxDent: 0,
    rippleEnergy: 0,
  };
}

export interface BallState {
  x: number;
  z: number;
  y: number;
  radius: number;
  vx: number;
  vz: number;
}

// One physics step. dt in seconds (clamped by caller). gx/gz = tilt gravity.
export function stepCloth(
  c: Cloth,
  ball: BallState,
  dt: number,
  gx: number,
  gz: number,
): void {
  const { px, py, pz, ox, oy, oz, pinned, springs } = c;
  const count = N * N;
  const dt2 = dt * dt;

  // --- Verlet integrate (vertical only; sheet stays planar in X/Z) ---
  for (let k = 0; k < count; k++) {
    if (pinned[k]) continue;
    const vx = (px[k] - ox[k]) * DAMP;
    const vy = (py[k] - oy[k]) * DAMP;
    const vz = (pz[k] - oz[k]) * DAMP;
    ox[k] = px[k];
    oy[k] = py[k];
    oz[k] = pz[k];
    px[k] += vx;
    py[k] += vy + GRAVITY_Y * dt2;
    pz[k] += vz;
    // soft pull back to the rest plane (the cloth's own tension / "trampoline")
    py[k] += (REST_Y - py[k]) * 0.04;
  }

  // --- Constraint relaxation (PBD spring + Provot cap) ---
  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    for (let s = 0; s < springs.length; s += 3) {
      const a = springs[s];
      const b = springs[s + 1];
      const rest = springs[s + 2];
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      const dz = pz[b] - pz[a];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      let diff = (d - rest) / d;
      // Provot: cap over-elongation so the cloth can't blow up.
      const maxLen = rest * MAX_STRETCH;
      if (d > maxLen) diff = (d - maxLen) / d + (maxLen - rest) / d;
      const f = 0.5 * STIFF * diff;
      const cx = dx * f;
      const cy = dy * f;
      const cz = dz * f;
      const pa = pinned[a] ? 0 : 1;
      const pb = pinned[b] ? 0 : 1;
      // distribute correction by who's free
      if (pa && pb) {
        px[a] += cx;
        py[a] += cy;
        pz[a] += cz;
        px[b] -= cx;
        py[b] -= cy;
        pz[b] -= cz;
      } else if (pa) {
        px[a] += cx * 2;
        py[a] += cy * 2;
        pz[a] += cz * 2;
      } else if (pb) {
        px[b] -= cx * 2;
        py[b] -= cy * 2;
        pz[b] -= cz * 2;
      }
    }
  }

  // --- Ball: tilt-driven motion in X/Z plane, kept on the sheet ---
  ball.vx += gx * dt;
  ball.vz += gz * dt;
  ball.vx *= 0.992;
  ball.vz *= 0.992;
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  const lim = SIZE / 2 - ball.radius * 0.4;
  if (ball.x < -lim) {
    ball.x = -lim;
    ball.vx *= -0.55;
  }
  if (ball.x > lim) {
    ball.x = lim;
    ball.vx *= -0.55;
  }
  if (ball.z < -lim) {
    ball.z = -lim;
    ball.vz *= -0.55;
  }
  if (ball.z > lim) {
    ball.z = lim;
    ball.vz *= -0.55;
  }

  // --- Sphere-vs-cloth push-out collision (dent the sheet downward) ---
  let maxDent = 0;
  let ripple = 0;
  const r = ball.radius;
  const r2 = r * r;
  // The ball sits slightly above; it presses down where it overlaps.
  const ballY = REST_Y; // ball center rides at the rest plane
  for (let k = 0; k < count; k++) {
    if (pinned[k]) continue;
    const dx = px[k] - ball.x;
    const dz = pz[k] - ball.z;
    const planar2 = dx * dx + dz * dz;
    if (planar2 < r2) {
      // how far "into" the ball footprint -> how deep the dent
      const depth = Math.sqrt(r2 - planar2); // sphere cross-section
      const target = ballY - depth; // push node below
      if (py[k] > target) {
        py[k] = target;
      }
    }
    const dent = REST_Y - py[k];
    if (dent > maxDent) maxDent = dent;
    const vy = py[k] - oy[k];
    ripple += vy * vy;
  }

  c.maxDent = maxDent;
  c.rippleEnergy = ripple;
}
