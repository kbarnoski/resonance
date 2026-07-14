// sim.ts — the physics of the tidal canon.
//
// TWO coupled systems, ONE gravitational field:
//
//   FOREGROUND (few-body, fully mutual):  3 massive "conductor" bodies orbit a
//   dominant central mass under real Newtonian gravity (velocity-Verlet,
//   softened). They are seeded near a Laplace-style commensurable configuration
//   so that conductor pairs sit close to small-integer PERIOD ratios from the
//   first frame (a 3:2 perfect fifth, a 4:3 fourth, a 2:1 octave). Their mutual
//   perturbations make the ratios breathe in and out of exact resonance — the
//   discrete lock EVENTS the audio welds pitch to.
//
//   BACKGROUND (large-N, one-way):  thousands of massless test particles feel
//   the conductors' field but NEVER act back (one-way coupling → O(n·bodies),
//   cheap and unconditionally stable — it can shear and stream but never blows
//   up the foreground). The conductors tidally stretch, shear and stream this
//   swarm into tails; its aggregate dispersion drives the ambient wash.
//
// Determinism: all randomness is a seeded mulberry32. No Math.random / Date.

// ── seeded PRNG ──────────────────────────────────────────────────────────────
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

const SEED = 0x1622ca; // fixed integer seed — deterministic every run

// ── tunables ─────────────────────────────────────────────────────────────────
export const G = 1;
const MC = 400; // dominant central mass (the system's tonic sky)
const SOFT2 = 0.35 * 0.35; // gravitational softening (squared)
const SWARM_SOFT2 = 0.8 * 0.8; // softer for particles → smooth streaming
const ESCAPE_R = 17; // particles past this are recycled into the disk
export const WORLD = 13; // half-extent of the world box (for camera fit)

// Conductor target periods → exact ratios 3:2 (fifth), 4:3 (fourth), 2:1 (octave)
const TARGET_PERIODS = [2, 3, 4];
const A_SCALE = 2.58; // semi-major = A_SCALE * period^(2/3)

// Just-intonation lock targets: ratio, name for the on-screen label.
export const LOCK_TARGETS: { ratio: number; p: number; q: number; name: string }[] =
  [
    { ratio: 2 / 1, p: 2, q: 1, name: "2:1 · octave" },
    { ratio: 3 / 2, p: 3, q: 2, name: "3:2 · perfect fifth" },
    { ratio: 4 / 3, p: 4, q: 3, name: "4:3 · perfect fourth" },
    { ratio: 5 / 3, p: 5, q: 3, name: "5:3 · major sixth" },
  ];
const LOCK_TOL = 0.045; // fractional tolerance on the period ratio

export interface Conductor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  central: boolean;
  radiusVis: number;
  period: number; // instantaneous Keplerian period about the centre
  freq: number; // audio frequency mapped from 1/period
  hue: number; // 0..1 for the render layer only
}

export interface Well {
  x: number;
  y: number;
  strength: number; // decays to 0
}

export interface Lock {
  key: string;
  i: number;
  j: number;
  p: number;
  q: number;
  name: string;
  rootFreq: number; // the pure dyad root (Hz)
  topFreq: number; // rootFreq * p/q
  strength: number; // 0..1 (how close to exact)
  panRoot: number;
  panTop: number;
}

export interface Sim {
  conductors: Conductor[];
  n: number;
  px: Float32Array;
  py: Float32Array;
  pvx: Float32Array;
  pvy: Float32Array;
  wells: Well[];
  rng: () => number;
  C: number; // pitch constant: freq = C / period
  baseDispersion: number;
  time: number;
}

// ── construction ─────────────────────────────────────────────────────────────
export function createSim(particleCount = 9000): Sim {
  const rng = mulberry32(SEED);
  const conductors: Conductor[] = [];

  // central dominant mass — the "sun" the conductors orbit and the swarm falls to
  conductors.push({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    mass: MC,
    central: true,
    radiusVis: 1.0,
    period: 0,
    freq: 55,
    hue: 0.12,
  });

  // three conductors seeded on near-circular commensurable orbits
  const masses = [7, 6, 5];
  const startAngles = [0.4, 2.5, 4.3];
  for (let k = 0; k < TARGET_PERIODS.length; k++) {
    const a = A_SCALE * Math.pow(TARGET_PERIODS[k], 2 / 3);
    const ang = startAngles[k];
    const x = a * Math.cos(ang);
    const y = a * Math.sin(ang);
    const vc = Math.sqrt((G * MC) / a); // circular speed
    // prograde, perpendicular to radius
    const vx = -vc * Math.sin(ang);
    const vy = vc * Math.cos(ang);
    conductors.push({
      x,
      y,
      vx,
      vy,
      mass: masses[k],
      central: false,
      radiusVis: 0.5 + 0.05 * masses[k],
      period: 0,
      freq: 110,
      hue: 0.62 - k * 0.08,
    });
  }

  // zero the net momentum so the barycentre stays put at the origin
  let px0 = 0,
    py0 = 0,
    mtot = 0;
  for (const c of conductors) {
    px0 += c.mass * c.vx;
    py0 += c.mass * c.vy;
    mtot += c.mass;
  }
  for (const c of conductors) {
    c.vx -= px0 / mtot;
    c.vy -= py0 / mtot;
  }

  // pitch constant from the outer conductor's seeded period → outer ≈ 110 Hz
  const aOuter = A_SCALE * Math.pow(TARGET_PERIODS[2], 2 / 3);
  const tOuter = 2 * Math.PI * Math.sqrt((aOuter * aOuter * aOuter) / (G * MC));
  const C = 110 * tOuter;

  // ── test-particle swarm: a broad rotating disk + halo ──────────────────────
  const n = particleCount;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pvx = new Float32Array(n);
  const pvy = new Float32Array(n);
  for (let i = 0; i < n; i++) seedParticle(i, px, py, pvx, pvy, rng);

  const sim: Sim = {
    conductors,
    n,
    px,
    py,
    pvx,
    pvy,
    wells: [],
    rng,
    C,
    baseDispersion: 1,
    time: 0,
  };
  // measure conductor periods once for initial audio
  measurePeriods(sim);
  sim.baseDispersion = rawDispersion(sim);
  return sim;
}

function seedParticle(
  i: number,
  px: Float32Array,
  py: Float32Array,
  pvx: Float32Array,
  pvy: Float32Array,
  rng: () => number,
) {
  // radius: mostly a disk (2..9), a minority in an extended halo (9..12.5)
  const halo = rng() < 0.18;
  const r = halo ? 9 + rng() * 3.5 : 2 + rng() * 7;
  const ang = rng() * Math.PI * 2;
  px[i] = r * Math.cos(ang);
  py[i] = r * Math.sin(ang);
  // near-circular prograde orbit with a little scatter → a live, shearing disk
  const vc = Math.sqrt((G * MC) / r) * (0.86 + rng() * 0.16);
  const jitter = (rng() - 0.5) * 0.5;
  pvx[i] = -vc * Math.sin(ang) + jitter * Math.cos(ang);
  pvy[i] = vc * Math.cos(ang) + jitter * Math.sin(ang);
}

// ── integration ──────────────────────────────────────────────────────────────

function conductorAccel(
  cs: Conductor[],
  ax: number[],
  ay: number[],
) {
  const m = cs.length;
  for (let i = 0; i < m; i++) {
    ax[i] = 0;
    ay[i] = 0;
  }
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      const dx = cs[j].x - cs[i].x;
      const dy = cs[j].y - cs[i].y;
      const d2 = dx * dx + dy * dy + SOFT2;
      const inv = 1 / Math.sqrt(d2);
      const inv3 = inv / d2;
      const fi = G * cs[j].mass * inv3;
      const fj = G * cs[i].mass * inv3;
      ax[i] += fi * dx;
      ay[i] += fi * dy;
      ax[j] -= fj * dx;
      ay[j] -= fj * dy;
    }
  }
}

/** Advance one visual frame: conductors by velocity-Verlet, swarm one-way. */
export function stepSim(sim: Sim, dtFrame: number) {
  const sub = 3;
  const dt = dtFrame / sub;
  const cs = sim.conductors;
  const m = cs.length;
  const ax: number[] = new Array(m);
  const ay: number[] = new Array(m);
  const ax2: number[] = new Array(m);
  const ay2: number[] = new Array(m);

  for (let s = 0; s < sub; s++) {
    conductorAccel(cs, ax, ay);
    for (let i = 0; i < m; i++) {
      cs[i].x += cs[i].vx * dt + 0.5 * ax[i] * dt * dt;
      cs[i].y += cs[i].vy * dt + 0.5 * ay[i] * dt * dt;
    }
    conductorAccel(cs, ax2, ay2);
    for (let i = 0; i < m; i++) {
      cs[i].vx += 0.5 * (ax[i] + ax2[i]) * dt;
      cs[i].vy += 0.5 * (ay[i] + ay2[i]) * dt;
    }
  }

  // decay transient wells
  for (const w of sim.wells) w.strength *= Math.pow(0.5, dtFrame / 2.2);
  sim.wells = sim.wells.filter((w) => w.strength > 0.02);

  stepSwarm(sim, dtFrame);
  measurePeriods(sim);
  sim.time += dtFrame;
}

function stepSwarm(sim: Sim, dt: number) {
  const { px, py, pvx, pvy, n, conductors, wells, rng } = sim;
  const m = conductors.length;
  // snapshot attractors
  const cx: number[] = [];
  const cy: number[] = [];
  const cm: number[] = [];
  for (const c of conductors) {
    cx.push(c.x);
    cy.push(c.y);
    cm.push(c.mass);
  }
  for (let i = 0; i < n; i++) {
    let axp = 0;
    let ayp = 0;
    const x = px[i];
    const y = py[i];
    for (let k = 0; k < m; k++) {
      const dx = cx[k] - x;
      const dy = cy[k] - y;
      const d2 = dx * dx + dy * dy + SWARM_SOFT2;
      const inv = 1 / Math.sqrt(d2);
      const f = (G * cm[k] * inv) / d2;
      axp += f * dx;
      ayp += f * dy;
    }
    for (let w = 0; w < wells.length; w++) {
      const dx = wells[w].x - x;
      const dy = wells[w].y - y;
      const d2 = dx * dx + dy * dy + SWARM_SOFT2;
      const inv = 1 / Math.sqrt(d2);
      const f = (G * wells[w].strength * inv) / d2;
      axp += f * dx;
      ayp += f * dy;
    }
    // symplectic Euler (one-way → stable)
    const nvx = pvx[i] + axp * dt;
    const nvy = pvy[i] + ayp * dt;
    const nx = x + nvx * dt;
    const ny = y + nvy * dt;
    // recycle escapees back into the disk to keep the cloud alive & streaming
    if (nx * nx + ny * ny > ESCAPE_R * ESCAPE_R) {
      seedParticleInto(i, px, py, pvx, pvy, rng);
      continue;
    }
    pvx[i] = nvx;
    pvy[i] = nvy;
    px[i] = nx;
    py[i] = ny;
  }
}

function seedParticleInto(
  i: number,
  px: Float32Array,
  py: Float32Array,
  pvx: Float32Array,
  pvy: Float32Array,
  rng: () => number,
) {
  const r = 2 + rng() * 7;
  const ang = rng() * Math.PI * 2;
  px[i] = r * Math.cos(ang);
  py[i] = r * Math.sin(ang);
  const vc = Math.sqrt((G * MC) / r) * (0.86 + rng() * 0.16);
  pvx[i] = -vc * Math.sin(ang);
  pvy[i] = vc * Math.cos(ang);
}

// ── measurement: Keplerian periods & pitch ───────────────────────────────────

function measurePeriods(sim: Sim) {
  const cs = sim.conductors;
  const c0 = cs[0];
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i];
    const rx = c.x - c0.x;
    const ry = c.y - c0.y;
    const r = Math.hypot(rx, ry) || 1e-6;
    const dvx = c.vx - c0.vx;
    const dvy = c.vy - c0.vy;
    const v2 = dvx * dvx + dvy * dvy;
    const energy = 0.5 * v2 - (G * MC) / r;
    let a: number;
    if (energy < 0) a = -(G * MC) / (2 * energy);
    else a = r; // unbound (just flung) → fall back to current radius
    const T = 2 * Math.PI * Math.sqrt((a * a * a) / (G * MC));
    c.period = T;
    c.freq = Math.min(660, Math.max(55, sim.C / T));
  }
}

// ── resonance-lock detection (the discrete EVENTS) ───────────────────────────

export function detectLocks(sim: Sim): Lock[] {
  const cs = sim.conductors;
  const locks: Lock[] = [];
  for (let i = 1; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const ti = cs[i].period;
      const tj = cs[j].period;
      if (!(ti > 0) || !(tj > 0)) continue;
      const ratio = ti > tj ? ti / tj : tj / ti;
      const slow = ti > tj ? i : j; // longer period, lower freq → root
      const fast = ti > tj ? j : i;
      for (const t of LOCK_TARGETS) {
        const dev = Math.abs(ratio - t.ratio) / t.ratio;
        if (dev < LOCK_TOL) {
          const strength = 1 - dev / LOCK_TOL; // 0..1
          const rootFreq = cs[slow].freq;
          const topFreq = rootFreq * t.ratio;
          locks.push({
            key: `${i}-${j}`,
            i,
            j,
            p: t.p,
            q: t.q,
            name: t.name,
            rootFreq,
            topFreq,
            strength,
            panRoot: Math.max(-1, Math.min(1, cs[slow].x / WORLD)),
            panTop: Math.max(-1, Math.min(1, cs[fast].x / WORLD)),
          });
          break; // nearest target only
        }
      }
    }
  }
  return locks;
}

// ── swarm dispersion → drives the aggregate wash ─────────────────────────────

function rawDispersion(sim: Sim): number {
  const { pvx, pvy, n } = sim;
  const stride = Math.max(1, (n / 700) | 0);
  let count = 0;
  let sSum = 0;
  let sSq = 0;
  for (let i = 0; i < n; i += stride) {
    const sp = Math.hypot(pvx[i], pvy[i]);
    sSum += sp;
    sSq += sp * sp;
    count++;
  }
  const mean = sSum / count;
  const varr = sSq / count - mean * mean;
  return Math.sqrt(Math.max(0, varr));
}

/** 0 = calm tightly-bound swarm, 1 = violently sheared / streaming. */
export function swarmAgitation(sim: Sim): number {
  const cur = rawDispersion(sim);
  const rel = cur / (sim.baseDispersion || 1) - 1;
  return Math.max(0, Math.min(1, rel * 1.1));
}

// ── interaction ──────────────────────────────────────────────────────────────

/** Fling the conductor nearest (wx,wy): add an impulse → it runs off-lock. */
export function flingConductor(
  sim: Sim,
  wx: number,
  wy: number,
  impX: number,
  impY: number,
): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 1; i < sim.conductors.length; i++) {
    const c = sim.conductors[i];
    const d = (c.x - wx) ** 2 + (c.y - wy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return -1;
  const c = sim.conductors[best];
  const scale = 2.4;
  c.vx += impX * scale;
  c.vy += impY * scale;
  return best;
}

/** Drop a transient gravity well the swarm streams toward. */
export function dropWell(sim: Sim, wx: number, wy: number) {
  sim.wells.push({ x: wx, y: wy, strength: 260 });
  if (sim.wells.length > 5) sim.wells.shift();
}
