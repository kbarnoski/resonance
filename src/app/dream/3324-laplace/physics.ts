// physics.ts — a cheap-but-real-feeling Laplace resonance sandbox.
//
// Three worlds orbit a star. Kepler: period T ∝ a^(3/2), mean motion n = 2π/T.
// The Laplace argument is φ_L = θ1 − 3·θ2 + 2·θ3 (mean longitudes). In a true
// 4:2:1 chain the mean motions satisfy n1 − 3·n2 + 2·n3 = 0, so φ_L is stationary
// and, once a restoring three-body torque is present, LIBRATES around 180°.
// Off-resonance φ_L CIRCULATES.
//
// Mechanism: every frame we compute how close the two period ratios are to 2:1
// (`proximity`). A damped-pendulum torque, gated by proximity and by how much
// "gravity" has been released, is distributed onto each world along the (1,−3,2)
// weights — that both drives φ_L toward 180° and captures a near-locked tuning
// into EXACT resonance (why the chain holds). When mistuned and released, that
// torque is ~0; instead a secular divergence pushes the worlds apart, instability
// accumulates, and past a threshold the least-stable world is ejected.
//
// Not scientifically exact — tuned so a lock READS as "holds & grooves" and a
// mistuned release READS as "drifts & falls apart."

export const NWORLDS = 3;
export const RSCALE = 2.5; // period → orbital radius scale (for the render)
export const TWO_PI = Math.PI * 2;

/** Inner→outer target periods: ratio 1 : 2 : 4 (the 4:2:1 mean-motion lock). */
export const TARGET_PERIODS = [0.5, 1.0, 2.0] as const;
/** Laplace-argument coefficients on (θ1, θ2, θ3). */
export const LAPLACE_COEF = [1, -3, 2] as const;
const COEF_NORM2 = 1 + 9 + 4; // 14

/** Radial drag bands per world (keeps inner<mid<outer ordering). */
export const RADIUS_BANDS: readonly [number, number][] = [
  [0.9, 2.25],
  [1.6, 3.6],
  [2.8, 6.2],
];

export function radiusForPeriod(T: number): number {
  return Math.pow(T, 2 / 3) * RSCALE;
}
export function periodForRadius(r: number): number {
  return Math.pow(r / RSCALE, 1.5);
}

export interface World {
  T: number; // orbital period (seconds of sim = seconds of real time)
  n: number; // mean motion 2π/T
  theta: number; // mean longitude (rad)
  prevTheta: number;
  ejected: boolean;
  ejR: number; // display radius while flying out (grows)
  ejV: number; // outward speed while ejected
}

export interface SimState {
  worlds: World[];
  release: number; // 0..1 how much three-body gravity is live
  releaseTarget: number; // toggle target
  instability: number; // accumulates when mistuned & released
  phiL: number; // Laplace argument (rad, wrapped to [0,2π))
  psi: number; // dφ_L/dt (the resonance-argument rate)
  proximity: number; // 0..1 nearness to the 4:2:1 lock
  ejectedIndex: number; // -1 none
}

export interface StepResult {
  strikes: number[]; // world indices that hit perihelion this step
  justEjected: number; // -1 or the index ejected this step
}

const EJECT_THRESHOLD = 1.0;

export function createSim(): SimState {
  const worlds: World[] = TARGET_PERIODS.map((T) => ({
    T,
    n: TWO_PI / T,
    theta: Math.random() * TWO_PI,
    prevTheta: 0,
    ejected: false,
    ejR: 0,
    ejV: 0,
  }));
  worlds.forEach((w) => (w.prevTheta = w.theta));
  return {
    worlds,
    release: 0,
    releaseTarget: 0,
    instability: 0,
    phiL: Math.PI,
    psi: 0,
    proximity: 1,
    ejectedIndex: -1,
  };
}

function wrap2pi(a: number): number {
  a %= TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/** 0..1 nearness to the 4:2:1 lock, from the two period ratios (both target 2). */
export function computeProximity(worlds: World[]): number {
  const r12 = worlds[1].T / worlds[0].T;
  const r23 = worlds[2].T / worlds[1].T;
  const e = (r12 - 2) * (r12 - 2) + (r23 - 2) * (r23 - 2);
  const sigma = 0.15;
  return Math.exp(-e / (2 * sigma * sigma));
}

export function periodRatios(worlds: World[]): [number, number] {
  return [worlds[1].T / worlds[0].T, worlds[2].T / worlds[1].T];
}

/** Retune one world's period from a dragged orbital radius; resets instability. */
export function retuneWorld(s: SimState, index: number, radius: number): void {
  const [lo, hi] = RADIUS_BANDS[index];
  const r = Math.min(hi, Math.max(lo, radius));
  const w = s.worlds[index];
  w.T = periodForRadius(r);
  w.n = TWO_PI / w.T;
  if (w.ejected) {
    w.ejected = false;
    w.ejR = 0;
    w.ejV = 0;
  }
  if (s.ejectedIndex === index) s.ejectedIndex = -1;
  s.instability = 0;
}

/** Snap all three to the exact 4:2:1 chain and reset instability/ejection. */
export function snapToResonance(s: SimState): void {
  s.worlds.forEach((w, i) => {
    w.T = TARGET_PERIODS[i];
    w.n = TWO_PI / w.T;
    w.ejected = false;
    w.ejR = 0;
    w.ejV = 0;
  });
  s.instability = 0;
  s.ejectedIndex = -1;
}

/** Advance the simulation by dt seconds. Returns per-step audio events. */
export function stepSim(s: SimState, dt: number): StepResult {
  const w = s.worlds;
  const strikes: number[] = [];
  let justEjected = -1;

  // ramp the released-gravity coupling toward its toggle target
  const rr = 2.2; // ramp rate (per second)
  if (s.release < s.releaseTarget)
    s.release = Math.min(s.releaseTarget, s.release + rr * dt);
  else if (s.release > s.releaseTarget)
    s.release = Math.max(s.releaseTarget, s.release - rr * dt);

  const p = computeProximity(w);
  s.proximity = p;

  // advance mean longitudes; detect perihelion crossings (θ through 0 mod 2π)
  for (let i = 0; i < NWORLDS; i++) {
    if (w[i].ejected) continue;
    w[i].prevTheta = w[i].theta;
    w[i].theta += w[i].n * dt;
    if (Math.floor(w[i].theta / TWO_PI) > Math.floor(w[i].prevTheta / TWO_PI)) {
      strikes.push(i);
    }
  }

  // Laplace argument and its rate (from the honest mean longitudes)
  s.phiL = wrap2pi(
    LAPLACE_COEF[0] * w[0].theta +
      LAPLACE_COEF[1] * w[1].theta +
      LAPLACE_COEF[2] * w[2].theta,
  );
  s.psi =
    LAPLACE_COEF[0] * w[0].n +
    LAPLACE_COEF[1] * w[1].n +
    LAPLACE_COEF[2] * w[2].n;

  // Restoring three-body torque: a damped pendulum on φ_L toward 180°, gated by
  // proximity. Present faintly even before release (the resonance "well"), and
  // strengthened as gravity is released. Distributed on (1,−3,2) so it acts on
  // the real mean motions — near-locked tunings get captured into exact lock.
  const omega = (0.5 + 3.0 * s.release) * p; // rad/s pendulum frequency
  const dPhi = s.phiL - Math.PI;
  const acc = -omega * omega * Math.sin(dPhi) - 1.4 * omega * s.psi;
  const B = acc / COEF_NORM2;
  for (let i = 0; i < NWORLDS; i++) {
    if (w[i].ejected) continue;
    w[i].n += LAPLACE_COEF[i] * B * dt;
    // keep periods physical & bounded
    w[i].n = Math.max(0.2, w[i].n);
    w[i].T = TWO_PI / w[i].n;
  }

  // Secular divergence when mistuned AND released: push worlds apart, runaway.
  const mis = s.release * (1 - p);
  if (mis > 0.001) {
    const growth = 0.06 * (1 + 2.5 * s.instability);
    const dir = [1, 0.35, -1]; // speed inner up, slow outer → ratios diverge
    for (let i = 0; i < NWORLDS; i++) {
      if (w[i].ejected) continue;
      w[i].n += dir[i] * mis * growth * dt;
      w[i].n = Math.max(0.2, w[i].n);
      w[i].T = TWO_PI / w[i].n;
    }
    s.instability += mis * dt * 0.9;
  } else if (s.instability > 0) {
    // near-locked: instability bleeds away (the chain settles)
    s.instability = Math.max(0, s.instability - dt * 0.6);
  }

  // Ejection: past threshold, fling the least-stable (most-detuned) world.
  if (s.instability > EJECT_THRESHOLD && s.ejectedIndex === -1) {
    let worst = -1;
    let worstDev = -1;
    for (let i = 0; i < NWORLDS; i++) {
      if (w[i].ejected) continue;
      const dev = Math.abs(w[i].T - TARGET_PERIODS[i]) / TARGET_PERIODS[i];
      if (dev > worstDev) {
        worstDev = dev;
        worst = i;
      }
    }
    if (worst >= 0) {
      w[worst].ejected = true;
      w[worst].ejR = radiusForPeriod(w[worst].T);
      w[worst].ejV = 1.4;
      s.ejectedIndex = worst;
      justEjected = worst;
    }
  }

  // advance the ejected world's outward flight
  for (let i = 0; i < NWORLDS; i++) {
    if (!w[i].ejected) continue;
    w[i].ejV += 0.8 * dt;
    w[i].ejR += w[i].ejV * dt;
    w[i].theta += w[i].n * 0.4 * dt; // still swings, but escaping
  }

  return { strikes, justEjected };
}

/** Display radius of a world (its orbital radius, or its escaping radius). */
export function worldRadius(w: World): number {
  return w.ejected ? w.ejR : radiusForPeriod(w.T);
}

/** Continuous undertone pitch from orbital frequency: log(period) → pitch.
 *  Faster (inner) world → higher pitch. NOT quantized — pitch is the physics. */
export function undertoneHz(T: number, base = 130.81): number {
  // reference period 1.0s → base; each period-halving lifts pitch by ~an octave
  return base * Math.pow(1.0 / T, 0.62);
}
