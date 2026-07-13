// orbits.ts — a small few-body gravitational sim whose ONLY job is to make
// orbital resonance audible.
//
// A dominant central star (anchored at the origin) holds a handful of lighter
// companions in orbit under softened Newtonian gravity. The companions also
// feel each other's (much weaker) pull, so orbits precess and drift slowly —
// resonant configurations genuinely form, hold, and dissolve over minutes.
//
// The headline quantity is each body's ORBITAL PERIOD, estimated every frame
// from its specific orbital energy (vis-viva → semi-major axis → Kepler's third
// law, T = 2π·√(a³/μ)). For every PAIR we form the period ratio and test it
// against a table of small-integer targets (2:1, 3:2, 4:3, 5:3, 5:4, 6:5). When
// a ratio sits inside tolerance the pair is "locked", and that lock is what the
// audio engine rings out as a just-intonation consonance.
//
// Determinism: no nondeterministic sources anywhere. A single seeded mulberry32
// PRNG (hardcoded seed) supplies every stochastic value; time comes from the rAF
// clock passed in as dt.

// ── seeded PRNG ─────────────────────────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  vr: number; // visual radius
  hue: number; // 0..1 within a warm gold→amber band
  held: boolean; // being dragged by the pointer
  period: number; // seconds, estimated each frame (Infinity if unbound)
}

export interface Sim {
  bodies: Body[];
  mu: number; // G · M_central (central star anchored at origin)
  gMutual: number; // G for the light companion↔companion forces
  soft2: number; // gravitational softening ε²
  rMax: number; // soft outer bound of the play area
  vMax: number; // hard velocity clamp (anti-slingshot)
  nextId: number;
  rand: () => number;
}

// small-integer period-ratio targets → just-intonation interval names.
export interface RatioTarget {
  p: number;
  q: number;
  name: string;
}
export const TARGETS: RatioTarget[] = [
  { p: 2, q: 1, name: "octave" },
  { p: 3, q: 2, name: "perfect fifth" },
  { p: 4, q: 3, name: "perfect fourth" },
  { p: 5, q: 3, name: "major sixth" },
  { p: 5, q: 4, name: "major third" },
  { p: 6, q: 5, name: "minor third" },
];

// how close (relative) a period ratio must sit to a target to count as locked.
export const LOCK_TOL = 0.024;

export interface Lock {
  key: string; // stable id: "outerId-innerId-p:q"
  outerId: number; // longer period → the root of the interval
  innerId: number; // shorter period → the interval tone above
  p: number;
  q: number;
  name: string;
  ratio: number; // measured longerT / shorterT
  strength: number; // 0..1, 1 = dead-on the target
  rootFreq: number; // audio Hz for the outer body
}

// ── pitch mapping: orbital frequency → audio pitch (the "music of the spheres")
// A faster orbit sings higher. Because pitch ∝ 1/period, a 3:2 period ratio maps
// to an exact 3:2 frequency ratio — a perfect fifth — with no extra machinery.
export const REF_T = 8.5; // reference period (s)
export const REF_HZ = 208; // ≈ G#3, the pitch a REF_T orbit sings
export function audioFreq(period: number): number {
  if (!isFinite(period) || period <= 0) return REF_HZ * 0.5;
  const f = REF_HZ * (REF_T / period);
  return Math.max(90, Math.min(920, f));
}

// circular-orbit speed at radius r around the central mass.
export function circularSpeed(sim: Sim, r: number): number {
  return Math.sqrt(sim.mu / Math.max(r, 0.6));
}

// estimate a body's Keplerian period from its current state (vis-viva).
// While a body is held we assume a circular orbit at its radius so the readout
// stays sane during a drag.
export function periodOf(sim: Sim, b: Body): number {
  const r = Math.hypot(b.x, b.y);
  let v2: number;
  if (b.held) {
    const vc = circularSpeed(sim, r);
    v2 = vc * vc;
  } else {
    v2 = b.vx * b.vx + b.vy * b.vy;
  }
  const energy = 0.5 * v2 - sim.mu / Math.max(r, 0.6);
  if (energy >= -1e-4) return Infinity; // unbound / escaping → cannot lock
  const a = -sim.mu / (2 * energy);
  if (a <= 0) return Infinity;
  return 2 * Math.PI * Math.sqrt((a * a * a) / sim.mu);
}

// ── forces ──────────────────────────────────────────────────────────────────
function accel(sim: Sim, ax: Float64Array, ay: Float64Array): void {
  const bs = sim.bodies;
  const n = bs.length;
  for (let i = 0; i < n; i++) {
    const bi = bs[i];
    // central star (dominant term)
    const r2 = bi.x * bi.x + bi.y * bi.y + sim.soft2;
    let inv = 1 / (r2 * Math.sqrt(r2));
    let axi = -sim.mu * bi.x * inv;
    let ayi = -sim.mu * bi.y * inv;
    // gentle companion↔companion perturbations (the source of precession/drift)
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const bj = bs[j];
      const dx = bj.x - bi.x;
      const dy = bj.y - bi.y;
      const d2 = dx * dx + dy * dy + sim.soft2;
      inv = 1 / (d2 * Math.sqrt(d2));
      axi += sim.gMutual * bj.mass * dx * inv;
      ayi += sim.gMutual * bj.mass * dy * inv;
    }
    ax[i] = axi;
    ay[i] = ayi;
  }
}

// ── integrator: velocity-Verlet, fixed substeps for stability ───────────────
export function stepSim(sim: Sim, dt: number): void {
  let remaining = Math.min(dt, 0.05);
  const H = 1 / 120;
  const n = sim.bodies.length;
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const ax2 = new Float64Array(n);
  const ay2 = new Float64Array(n);
  while (remaining > 1e-6) {
    const h = Math.min(H, remaining);
    remaining -= h;
    accel(sim, ax, ay);
    for (let i = 0; i < n; i++) {
      const b = sim.bodies[i];
      if (b.held) continue;
      b.vx += 0.5 * ax[i] * h;
      b.vy += 0.5 * ay[i] * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
    accel(sim, ax2, ay2);
    for (let i = 0; i < n; i++) {
      const b = sim.bodies[i];
      if (b.held) continue;
      b.vx += 0.5 * ax2[i] * h;
      b.vy += 0.5 * ay2[i] * h;
      // soft outer bound: beyond rMax a gentle inward spring + drag reins the
      // body back in so a slingshot can't fling it offscreen forever.
      const r = Math.hypot(b.x, b.y);
      if (r > sim.rMax) {
        const pull = (r - sim.rMax) * 0.9;
        b.vx -= (b.x / r) * pull * h;
        b.vy -= (b.y / r) * pull * h;
        b.vx *= 1 - 0.4 * h;
        b.vy *= 1 - 0.4 * h;
      }
      // hard velocity clamp (anti-slingshot blowup)
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > sim.vMax) {
        const s = sim.vMax / sp;
        b.vx *= s;
        b.vy *= s;
      }
    }
  }
  // refresh period estimates
  for (const b of sim.bodies) b.period = periodOf(sim, b);
}

// ── construction ────────────────────────────────────────────────────────────
const WARM_HUES = [0.09, 0.11, 0.06, 0.13, 0.08, 0.12]; // gold ↔ amber band

export function createSim(): Sim {
  const sim: Sim = {
    bodies: [],
    mu: 600,
    gMutual: 1,
    soft2: 0.9,
    rMax: 26,
    vMax: 46,
    nextId: 1,
    rand: mulberry32(0x0c1a608), // hardcoded seed → fully deterministic
  };
  return sim;
}

export function addBody(
  sim: Sim,
  x: number,
  y: number,
  vx: number,
  vy: number,
  mass: number,
): Body {
  const hue = WARM_HUES[(sim.nextId - 1) % WARM_HUES.length];
  const b: Body = {
    id: sim.nextId++,
    x,
    y,
    vx,
    vy,
    mass,
    vr: 0.45 + Math.cbrt(mass) * 0.42,
    hue,
    held: false,
    period: Infinity,
  };
  b.period = periodOf(sim, b);
  sim.bodies.push(b);
  return b;
}

// drop a fresh body at a point with the near-circular velocity for its radius,
// so it immediately settles into an orbit instead of plunging.
export function dropBody(sim: Sim, x: number, y: number): Body {
  const r = Math.max(Math.hypot(x, y), 3);
  const nx = (x / Math.hypot(x, y)) * r;
  const ny = (y / Math.hypot(x, y)) * r;
  const vc = circularSpeed(sim, r) * (0.94 + sim.rand() * 0.08);
  // counter-clockwise tangent
  const vx = (-ny / r) * vc;
  const vy = (nx / r) * vc;
  const mass = 1.4 + sim.rand() * 1.6;
  return addBody(sim, nx, ny, vx, vy, mass);
}

export function removeBody(sim: Sim, id: number): void {
  const i = sim.bodies.findIndex((b) => b.id === id);
  if (i >= 0) sim.bodies.splice(i, 1);
}

// merge body `fromId` into `intoId`: conserve momentum + mass, then remove the
// smaller. Returns the surviving id (or -1).
export function mergeBodies(sim: Sim, intoId: number, fromId: number): number {
  const into = sim.bodies.find((b) => b.id === intoId);
  const from = sim.bodies.find((b) => b.id === fromId);
  if (!into || !from || into === from) return -1;
  const m = into.mass + from.mass;
  into.x = (into.x * into.mass + from.x * from.mass) / m;
  into.y = (into.y * into.mass + from.y * from.mass) / m;
  into.vx = (into.vx * into.mass + from.vx * from.mass) / m;
  into.vy = (into.vy * into.mass + from.vy * from.mass) / m;
  into.mass = m;
  into.vr = 0.45 + Math.cbrt(m) * 0.42;
  removeBody(sim, fromId);
  into.period = periodOf(sim, into);
  return intoId;
}

// ── the seeded opening configuration ────────────────────────────────────────
// A Laplace-style chain: three companions with period ratios ≈ 2 : 3 : 4, so
// pairs sit on 3:2, 4:3 and 2:1 from the very first frame — "Start" rings out a
// perfect fifth (and more) within seconds, unattended. A fourth body orbits
// just off resonance to add drifting tension.
export function seedConfig(sim: Sim): void {
  sim.bodies.length = 0;
  sim.nextId = 1;
  // base radius; ratios chosen via r ∝ T^{2/3}
  const r1 = 8.0;
  const r2 = r1 * Math.pow(1.5, 2 / 3); // 3:2 vs r1  → ≈10.48
  const r3 = r1 * Math.pow(2.0, 2 / 3); // 2:1 vs r1  → ≈12.70 (and 4:3 vs r2)
  const r4 = 6.4; // just outside 4:3 vs r1 → drifting tension
  // A SHARED speed factor is important: scaling every companion's velocity by
  // the same amount scales every period by the same amount, so the 2:3:4 chain
  // ratios (and thus the opening 3:2 / 4:3 / 2:1 locks) are preserved exactly.
  const ECC = 0.985; // a gentle shared ellipticity for visual life
  const specs: Array<[number, number, number, number]> = [
    // radius, angleDeg, eccentricity factor, mass
    [r1, 24, ECC, 2.6],
    [r2, 148, ECC, 2.1],
    [r3, 262, ECC, 1.7],
    [r4, 331, ECC, 1.3],
  ];
  for (const [r, deg, ecc, mass] of specs) {
    const a = (deg * Math.PI) / 180;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const vc = circularSpeed(sim, r) * ecc;
    const vx = -Math.sin(a) * vc;
    const vy = Math.cos(a) * vc;
    addBody(sim, x, y, vx, vy, mass);
  }
}

// ── resonance detection ─────────────────────────────────────────────────────
// For every pair, form longerT/shorterT and keep the closest small-integer
// target within tolerance. The outer (longer-period) body roots the interval.
export function detectLocks(sim: Sim): Lock[] {
  const locks: Lock[] = [];
  const bs = sim.bodies;
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const bi = bs[i];
      const bj = bs[j];
      if (!isFinite(bi.period) || !isFinite(bj.period)) continue;
      const outer = bi.period >= bj.period ? bi : bj;
      const inner = bi.period >= bj.period ? bj : bi;
      const ratio = outer.period / inner.period; // ≥ 1
      let best: RatioTarget | null = null;
      let bestStrength = 0;
      for (const t of TARGETS) {
        const tv = t.p / t.q;
        const rel = Math.abs(ratio - tv) / tv;
        if (rel < LOCK_TOL) {
          const strength = 1 - rel / LOCK_TOL;
          if (strength > bestStrength) {
            bestStrength = strength;
            best = t;
          }
        }
      }
      if (best) {
        locks.push({
          key: `${outer.id}-${inner.id}-${best.p}:${best.q}`,
          outerId: outer.id,
          innerId: inner.id,
          p: best.p,
          q: best.q,
          name: best.name,
          ratio,
          strength: bestStrength,
          rootFreq: audioFreq(outer.period),
        });
      }
    }
  }
  return locks;
}
