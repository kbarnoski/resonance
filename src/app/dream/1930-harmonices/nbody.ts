// nbody.ts — the physics half of 1930-harmonices (cycle 2 of 1930-harmonices).
//
// A central star (fixed at the origin) and five planets orbiting under real
// softened Newtonian gravity in a 2D plane, advanced by a SYMPLECTIC
// velocity-Verlet (leapfrog) integrator. Verlet conserves the shadow energy of
// the system, so the orrery runs indefinitely without the slow spiral-in that
// naive Euler produces.
//
// TILT is a uniform directional acceleration added to the gravity field (a
// "bias") — the player pumps and steers orbital energy with it. To keep the
// orrery bounded and on-canvas we (a) hard-cap each osculating semi-major axis
// into [AMIN, AMAX] by rescaling speed to the vis-viva value, (b) clamp
// eccentricity so nothing swings off the plate, and (c) apply a very weak
// "home ring" restoring so an overdriven system slowly re-differentiates.
//
// RESONANCE: we read each planet's instantaneous osculating Keplerian period
// from the vis-viva energy every frame. When two periods approach a small-
// integer ratio (2:1, 3:2, 4:3, 5:3, 5:4, 3:1, 5:2) within tolerance, the pair
// CAPTURES — a real mean-motion resonance librates and traps, so we apply a
// gentle restoring that snaps the ratio to the exact integer fraction and holds
// it. That exact ratio is what the audio voices as a just-intonation dyad.
//
// When the device is still, `calm` rises and a circularizing term drains the
// orbital eccentricity that resonance libration needs — the piece dies toward a
// lone drone. It is dead without a human actively tilting.
//
// CYCLE-2 additions (see page.tsx / audio.ts): a Laplace-chain seed preset
// (`seedLaplaceChain`) and heliocentric-angle read-out (`angleOf`) for the
// conjunction-bell detector. The core engine below is UNCHANGED from 1930.

export const MU = 1; // gravitational parameter of the star (G·M)
export const SOFT = 0.05; // gravitational softening length (never blows up)
export const AMIN = 0.55; // inner cage: smallest allowed semi-major axis
export const AMAX = 2.2; // outer cage: largest allowed semi-major axis
export const EMAX = 0.5; // eccentricity clamp (keeps apoapsis on the plate)
export const R_MAX = 3.4; // worst-case radius — render scale fits this
export const TILT_ACCEL = 0.07; // uniform bias per unit tilt
const KHOME = 0.06; // weak restoring toward each planet's home ring
const TWO_PI = Math.PI * 2;
const PLANET_MASS = 0.0016; // planets pull on each other, faintly

/** Small-integer period ratios that count as resonances (p:q, p > q). */
export const TARGETS: ReadonlyArray<readonly [number, number]> = [
  [2, 1],
  [3, 2],
  [4, 3],
  [5, 3],
  [5, 4],
  [3, 1],
  [5, 2],
];

const ENTER_TOL = 0.018; // relative period-ratio error to capture
const EXIT_TOL = 0.05; // hysteresis: must drift past this to release

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeA: number; // rest-ring semi-major axis
  hue: string; // brass/bronze shade for the art
  trail: number[]; // flattened [x, y, x, y, …] recent positions (sim units)
}

export interface Lock {
  i: number; // lower voice (larger period, slower, deeper)
  j: number; // upper voice
  p: number; // ratio numerator (period)
  q: number; // ratio denominator
  strength: number; // 0..1 — how deep inside tolerance
  age: number; // seconds this pair has stayed captured
}

/** Initial semi-major axes, placed just OUTSIDE small-integer resonances so a
 *  little tilt walks neighbouring pairs into a lock. */
const HOME_A = [0.7, 0.98, 1.28, 1.62, 2.05];

const SHADES = ["#c79a4e", "#b98a3c", "#a9702f", "#8f5a2a", "#7c4a24"];

export function createSystem(): Body[] {
  return HOME_A.map((a, i) => {
    const v = Math.sqrt(MU / a);
    const ph = i * 1.3 + 0.2;
    return {
      x: a * Math.cos(ph),
      y: a * Math.sin(ph),
      vx: -v * Math.sin(ph),
      vy: v * Math.cos(ph),
      homeA: a,
      hue: SHADES[i % SHADES.length],
      trail: [],
    };
  });
}

/** CYCLE-2 preset: snap the five planets into a pre-locked TRAPPIST-1-style
 *  Laplace resonance chain — successive small-integer neighbour ratios — so a
 *  first-time visitor hears a rich consonant just-intonation chord within a
 *  couple of seconds. It is seeded on circular orbits at the EXACT ratios, so
 *  detectLocks() traps them immediately; but it still decays like everything
 *  else once nobody tilts (the calm term circularizes the chain apart). */
const CHAIN_RATIOS: ReadonlyArray<readonly [number, number]> = [
  [3, 2],
  [4, 3],
  [3, 2],
  [5, 4],
];

export function seedLaplaceChain(bodies: Body[]): void {
  // innermost semi-major axis, then multiply by ρ^(2/3) for each neighbour
  // period ratio ρ (Kepler's third law: a ∝ T^(2/3)).
  const aList: number[] = [0.6];
  for (const [p, q] of CHAIN_RATIOS) {
    const rho = p / q;
    aList.push(aList[aList.length - 1] * Math.pow(rho, 2 / 3));
  }
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const a = Math.min(AMAX, Math.max(AMIN, aList[i] ?? aList[aList.length - 1]));
    const v = Math.sqrt(MU / a); // circular (e = 0)
    const ph = i * 1.7 + 0.35; // spread phases so conjunctions sweep past
    b.x = a * Math.cos(ph);
    b.y = a * Math.sin(ph);
    b.vx = -v * Math.sin(ph);
    b.vy = v * Math.cos(ph);
    b.homeA = a;
    b.trail = [];
  }
}

/** Heliocentric sight-line angle from the star, for conjunction detection. */
export function angleOf(b: Body): number {
  return Math.atan2(b.y, b.x);
}

function computeAccel(
  bodies: Body[],
  tiltX: number,
  tiltY: number,
): number[][] {
  return bodies.map((b) => {
    // star at origin
    const dx = -b.x;
    const dy = -b.y;
    const r2 = dx * dx + dy * dy + SOFT * SOFT;
    const inv = MU / (r2 * Math.sqrt(r2));
    let ax = dx * inv;
    let ay = dy * inv;
    // faint mutual gravity — the real driver of resonance in nature
    for (const o of bodies) {
      if (o === b) continue;
      const ex = o.x - b.x;
      const ey = o.y - b.y;
      const e2 = ex * ex + ey * ey + 0.02;
      const ei = PLANET_MASS / (e2 * Math.sqrt(e2));
      ax += ex * ei;
      ay += ey * ei;
    }
    // tilt: uniform acceleration biasing the whole field
    ax += tiltX;
    ay += tiltY;
    return [ax, ay];
  });
}

/** One symplectic velocity-Verlet step. */
export function stepSystem(
  bodies: Body[],
  dt: number,
  tiltX: number,
  tiltY: number,
): void {
  const a0 = computeAccel(bodies, tiltX, tiltY);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.x += b.vx * dt + 0.5 * a0[i][0] * dt * dt;
    b.y += b.vy * dt + 0.5 * a0[i][1] * dt * dt;
  }
  const a1 = computeAccel(bodies, tiltX, tiltY);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.vx += 0.5 * (a0[i][0] + a1[i][0]) * dt;
    b.vy += 0.5 * (a0[i][1] + a1[i][1]) * dt;
  }
}

/** Osculating Keplerian semi-major axis from vis-viva (star term only). */
export function smaOf(b: Body): number {
  const r = Math.hypot(b.x, b.y);
  const v2 = b.vx * b.vx + b.vy * b.vy;
  const e = v2 / 2 - MU / r;
  return e >= 0 ? Infinity : -MU / (2 * e);
}

export function eccOf(b: Body, a: number): number {
  const h = b.x * b.vy - b.y * b.vx; // specific angular momentum
  return Math.sqrt(Math.max(0, 1 - (h * h) / (MU * a)));
}

/** Instantaneous osculating period (seconds), clamped to the cage. */
export function periodOf(b: Body): number {
  let a = smaOf(b);
  if (!isFinite(a)) a = AMAX;
  a = Math.min(AMAX, Math.max(AMIN, a));
  return TWO_PI * Math.sqrt((a * a * a) / MU);
}

/** Normalised distance 0(periapsis)..1(apoapsis) for brightness/gain. */
export function phaseOf(b: Body): number {
  const a = Math.min(AMAX, Math.max(AMIN, isFinite(smaOf(b)) ? smaOf(b) : AMAX));
  const e = Math.min(EMAX, eccOf(b, a));
  const rp = a * (1 - e);
  const ra = a * (1 + e);
  const r = Math.hypot(b.x, b.y);
  if (ra - rp < 1e-4) return 0.5;
  return Math.max(0, Math.min(1, (r - rp) / (ra - rp)));
}

/** After integration: cage the semi-major axis and eccentricity, restore
 *  gently toward the home ring, and — when calm — circularize toward death. */
export function postStep(bodies: Body[], dt: number, calm: number): void {
  for (const b of bodies) {
    const r = Math.hypot(b.x, b.y);
    let a = smaOf(b);

    // 1. hard cage on semi-major axis (rescale speed to vis-viva at this r)
    if (!isFinite(a) || a > AMAX || a < AMIN) {
      const at = Math.min(AMAX, Math.max(AMIN, isFinite(a) ? a : AMAX));
      const tE = -MU / (2 * at);
      const dV = Math.sqrt(Math.max(1e-4, 2 * (tE + MU / r)));
      const cv = Math.hypot(b.vx, b.vy);
      const s = dV / cv;
      b.vx *= s;
      b.vy *= s;
      a = at;
    }

    // 2. eccentricity clamp — nudge toward the local circular velocity
    const e = eccOf(b, a);
    if (e > EMAX) {
      circularize(b, r, 3.0 * dt);
    }

    // 3. weak "home ring" memory (tangential thrust changing a)
    {
      const cv = Math.hypot(b.vx, b.vy);
      const ds = -KHOME * (a - b.homeA) * dt;
      const s = (cv + ds) / cv;
      if (s > 0) {
        b.vx *= s;
        b.vy *= s;
      }
    }

    // 4. calm death: drain eccentricity so resonance libration fades
    if (calm > 0) {
      circularize(b, r, 1.2 * calm * dt);
    }
  }
}

/** Blend velocity toward the prograde circular velocity at radius r. */
function circularize(b: Body, r: number, rate: number): void {
  const vc = Math.sqrt(MU / r);
  const tx = -b.y / r;
  const ty = b.x / r;
  const sign = b.vx * tx + b.vy * ty >= 0 ? 1 : -1;
  const dvx = sign * tx * vc;
  const dvy = sign * ty * vc;
  const k = 1 - Math.exp(-rate);
  b.vx += (dvx - b.vx) * k;
  b.vy += (dvy - b.vy) * k;
}

/** Detect resonant pairs from instantaneous period ratios, with hysteresis. */
export function detectLocks(bodies: Body[], prev: Lock[], dt: number): Lock[] {
  const periods = bodies.map(periodOf);
  const out: Lock[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const Ti = periods[i];
      const Tj = periods[j];
      if (!isFinite(Ti) || !isFinite(Tj)) continue;
      // lower voice = larger period (slower, deeper)
      const lowIdx = Ti >= Tj ? i : j;
      const hiIdx = Ti >= Tj ? j : i;
      const ratio = periods[lowIdx] / periods[hiIdx]; // >= 1

      let best: readonly [number, number] | null = null;
      let bestErr = Infinity;
      for (const [p, q] of TARGETS) {
        const err = Math.abs(ratio - p / q) / (p / q);
        if (err < bestErr) {
          bestErr = err;
          best = [p, q];
        }
      }
      if (!best) continue;

      const was = prev.find(
        (l) =>
          (l.i === lowIdx && l.j === hiIdx) || (l.i === hiIdx && l.j === lowIdx),
      );
      const tol = was ? EXIT_TOL : ENTER_TOL;
      if (bestErr < tol) {
        const strength = Math.max(0, Math.min(1, 1 - bestErr / EXIT_TOL));
        out.push({
          i: lowIdx,
          j: hiIdx,
          p: best[0],
          q: best[1],
          strength,
          age: was ? was.age + dt : 0,
        });
      }
    }
  }
  return out;
}

/** The resonance-trap: hold each captured pair at its EXACT integer ratio by
 *  nudging both periods toward target values whose ratio is p:q, preserving
 *  their geometric-mean period so overall energy is roughly conserved. */
export function applyCaptureAssist(
  bodies: Body[],
  locks: Lock[],
  dt: number,
): void {
  for (const l of locks) {
    const bi = bodies[l.i];
    const bj = bodies[l.j];
    const Ti = periodOf(bi);
    const Tj = periodOf(bj);
    const Tg = Math.sqrt(Ti * Tj);
    const ratio = l.p / l.q; // > 1
    const TlowTarget = Tg * Math.sqrt(ratio); // slower body (index i)
    const ThiTarget = Tg / Math.sqrt(ratio); // faster body (index j)
    const rate = 2.6 * l.strength * dt;
    nudgePeriod(bi, TlowTarget, rate);
    nudgePeriod(bj, ThiTarget, rate);
  }
}

/** Blend a body's speed toward the value giving the target period at this r. */
function nudgePeriod(b: Body, targetT: number, rate: number): void {
  const r = Math.hypot(b.x, b.y);
  const aT = Math.cbrt(MU * (targetT / TWO_PI) * (targetT / TWO_PI));
  const tE = -MU / (2 * aT);
  const desiredV = Math.sqrt(Math.max(1e-4, 2 * (tE + MU / r)));
  const cv = Math.hypot(b.vx, b.vy);
  const k = 1 - Math.exp(-rate);
  const s = (cv + (desiredV - cv) * k) / cv;
  if (s > 0) {
    b.vx *= s;
    b.vy *= s;
  }
}
