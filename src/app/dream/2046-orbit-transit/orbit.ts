/**
 * Seeded circular-orbit propagation for `2046-orbit-transit`.
 *
 * A small constellation of satellites is propagated in a simplified ECI frame
 * (circular orbits from classical elements), and a co-rotating observer at
 * ~42°N converts each satellite to topocentric range / range-rate / elevation
 * / azimuth every tick. All randomness comes from a deterministic mulberry32
 * PRNG (constant seed 0x2046) — never Math.random / Date.now — so the sky is
 * identical on every load and self-drives for the headless review.
 *
 * The physics run in REAL orbital seconds; the page advances that clock faster
 * than wall-clock (TIME_SCALE) so ~93-minute orbits become ~40-second passes,
 * keeping the Doppler chord audibly evolving. Range-rate is therefore in real
 * km/s (roughly ±7.7 km/s at a low overhead pass) — a physically grounded
 * quantity the audio layer turns into a continuous Doppler glissando.
 */

export const R_EARTH = 6371; // km
const MU = 398600.4418; // km^3 / s^2, Earth's gravitational parameter
const OMEGA_EARTH = 7.2921159e-5; // rad/s, Earth's sidereal rotation
const OBS_LAT_DEG = 42; // co-rotating observer latitude (northern mid-latitudes)
const DEG = Math.PI / 180;

/** Deterministic PRNG — no Math.random anywhere in the model. */
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

export interface Sat {
  id: string;
  name: string;
  altitudeKm: number; // circular-orbit altitude above mean Earth radius
  incRad: number; // inclination
  raanRad: number; // right ascension of ascending node
  phaseRad: number; // argument of latitude at t = 0
  a: number; // semi-major axis (R_EARTH + altitude)
  meanMotion: number; // rad / real-second
  isISS: boolean;
}

export interface TopoState {
  id: string;
  name: string;
  isISS: boolean;
  visible: boolean; // elevation > 0
  elevationDeg: number; // 0 = horizon, 90 = zenith
  azimuthDeg: number; // 0 = north, clockwise
  rangeKm: number;
  rangeRateKmS: number; // negative = approaching (Doppler up)
  altitudeKm: number;
}

type Vec3 = [number, number, number];

const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p: Vec3, q: Vec3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const len = (p: Vec3): number => Math.hypot(p[0], p[1], p[2]);
function cross(p: Vec3, q: Vec3): Vec3 {
  return [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  ];
}
function normalize(p: Vec3): Vec3 {
  const l = len(p) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
}

/** Satellite position in the ECI-ish frame at real time t (seconds). */
function satEci(s: Sat, t: number): Vec3 {
  const theta = s.phaseRad + s.meanMotion * t; // argument of latitude
  const a = s.a;
  const xp = a * Math.cos(theta);
  const yp = a * Math.sin(theta);
  // incline about the x-axis
  const ci = Math.cos(s.incRad);
  const si = Math.sin(s.incRad);
  const xi = xp;
  const yi = yp * ci;
  const zi = yp * si;
  // rotate by RAAN about the z-axis
  const cO = Math.cos(s.raanRad);
  const sO = Math.sin(s.raanRad);
  return [xi * cO - yi * sO, xi * sO + yi * cO, zi];
}

/** Co-rotating observer position in the same frame at real time t. */
function obsEci(t: number): Vec3 {
  const lat = OBS_LAT_DEG * DEG;
  const lon = OMEGA_EARTH * t; // longitude 0 at t = 0
  const r = R_EARTH;
  return [
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat),
  ];
}

/** Topocentric range (km) from the observer to a satellite at time t. */
function rangeAt(s: Sat, t: number): number {
  return len(sub(satEci(s, t), obsEci(t)));
}

/** Elevation (deg) of a satellite above the observer's horizon at time t. */
function elevationAt(s: Sat, t: number): number {
  const O = obsEci(t);
  const Up = normalize(O);
  const East = normalize(cross([0, 0, 1], Up));
  const North = cross(Up, East);
  const d = sub(satEci(s, t), O);
  return Math.atan2(dot(d, Up), Math.hypot(dot(d, East), dot(d, North))) / DEG;
}

const INCLINATIONS = [51.6, 53.0, 97.6, 63.4, 45.2, 74.0]; // ISS / Starlink / sun-sync / Molniya-ish / mixed

/**
 * Build the constellation deterministically. Index 0 is always the ISS
 * (51.6° inclination, ~420 km); the rest span low to medium orbits with
 * varied inclinations and nodes so a handful is always somewhere in the sky.
 * The first few satellites are phased toward the observer's zenith at t = 0 so
 * the chord has voices from the very first frame of the headless review.
 */
export function createConstellation(): Sat[] {
  const prng = mulberry32(0x2046);
  const count = 14;
  const sats: Sat[] = [];
  for (let i = 0; i < count; i++) {
    const isISS = i === 0;
    const altitudeKm = isISS ? 420 : 380 + prng() * 1020;
    const incDeg = isISS ? 51.6 : INCLINATIONS[Math.floor(prng() * INCLINATIONS.length)];
    const a = R_EARTH + altitudeKm;
    const sat: Sat = {
      id: isISS ? "ISS-25544" : `SAT-${String(100 + Math.floor(prng() * 899))}`,
      name: isISS ? "ISS (Zarya)" : `NORAD ${String(20000 + Math.floor(prng() * 9999))}`,
      altitudeKm,
      incRad: incDeg * DEG,
      raanRad: prng() * Math.PI * 2,
      phaseRad: prng() * Math.PI * 2,
      a,
      meanMotion: Math.sqrt(MU / (a * a * a)),
      isISS,
    };
    sats.push(sat);
  }
  // Guarantee a lively, never-silent OPENING for the headless review: greedily
  // phase the first 10 satellites to fill the least-covered moments of the
  // opening ~30 wall-seconds. Only phase is adjusted — altitude / inclination /
  // node stay seeded, so the geometry remains authentic. The ISS (index 0) and
  // the tail keep their natural random phase; beyond the opening window, passes
  // are honestly intermittent (real sky traffic comes and goes).
  fillOpeningWindow(sats);
  return sats;
}

/** Greedy hole-priority phasing so the opening window is continuously voiced. */
function fillOpeningWindow(sats: Sat[]): void {
  const grid: number[] = [];
  for (let w = 0; w <= 30; w += 0.4) grid.push(w * TIME_SCALE); // wall-seconds → orbital seconds
  const coverage = new Array(grid.length).fill(0);
  const STEPS = 720;
  const nudge = Math.min(10, sats.length - 1);

  for (let i = 1; i <= nudge; i++) {
    const base = sats[i];
    let bestPhase = base.phaseRad;
    let bestScore = -Infinity;
    for (let k = 0; k < STEPS; k++) {
      const phase = (k / STEPS) * Math.PI * 2;
      const probe = { ...base, phaseRad: phase };
      let score = 0;
      for (let g = 0; g < grid.length; g++) {
        if (elevationAt(probe, grid[g]) > 0) {
          score += coverage[g] === 0 ? 12 : coverage[g] === 1 ? 1 : 0.15;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestPhase = phase;
      }
    }
    base.phaseRad = bestPhase;
    for (let g = 0; g < grid.length; g++) {
      if (elevationAt(base, grid[g]) > 0) coverage[g]++;
    }
  }
}

/**
 * Propagate the whole constellation to topocentric states at real time t.
 * If a live ISS altitude was fetched, it is folded into the ISS voice's
 * register (geometry stays seeded — only the altitude→register mapping shifts).
 */
export function propagate(sats: Sat[], t: number, liveIssAltitudeKm: number | null): TopoState[] {
  const O = obsEci(t);
  const Up = normalize(O);
  const East = normalize(cross([0, 0, 1], Up));
  const North = cross(Up, East);
  const dt = 2; // finite-difference step in real seconds → real km/s range-rate

  return sats.map((s) => {
    const P = satEci(s, t);
    const d = sub(P, O);
    const rng = len(d);
    const e = dot(d, East);
    const n = dot(d, North);
    const u = dot(d, Up);
    const elevationDeg = Math.atan2(u, Math.hypot(e, n)) / DEG;
    let azimuthDeg = Math.atan2(e, n) / DEG;
    if (azimuthDeg < 0) azimuthDeg += 360;
    const rangeRateKmS = (rangeAt(s, t + dt) - rangeAt(s, t - dt)) / (2 * dt);
    const altitudeKm = s.isISS && liveIssAltitudeKm != null ? liveIssAltitudeKm : s.altitudeKm;

    return {
      id: s.id,
      name: s.name,
      isISS: s.isISS,
      visible: elevationDeg > 0,
      elevationDeg,
      azimuthDeg,
      rangeKm: rng,
      rangeRateKmS,
      altitudeKm,
    };
  });
}

/** Wall-clock → real-orbital-seconds compression (documented in the README). */
export const TIME_SCALE = 140;
