// propagator.ts — the deterministic Keplerian-ish ISS ground-track propagator.
//
// This is the MANDATORY fallback that makes the piece work with zero network,
// on CORS failure, or headless: a closed-form sub-satellite-point model for a
// circular orbit, advanced purely by performance.now(). It also becomes the
// smoothing "flywheel" when a LIVE feed is present — live samples re-anchor its
// node longitude, and it interpolates continuously between the 4 s polls.
//
// Model (circular orbit, spherical rotating Earth):
//   u   = argument of latitude (angle along the orbit from the ascending node)
//   lat = asin( sin(i) · sin(u) )
//   Δλ  = atan2( cos(i) · sin(u), cos(u) )        (along-track longitude)
//   lon = nodeLon + Δλ − ωEarth · t               (Earth rotates east under it)
// with i = 51.6° (ISS inclination) and period T = 92.9 min. Nodal precession is
// folded into ωEarth so successive passes shift ~23° west, as the real ISS does.
//
// Determinism: NO wall-clock, NO nondeterministic entropy. Seed → mulberry32 for the epoch
// phase; performance.now() for the clock. See README.

/** Seeded PRNG. Deterministic; the lab forbids nondeterministic entropy. */
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

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export const INCLINATION_DEG = 51.6;
export const PERIOD_MIN = 92.9;
export const PERIOD_SEC = PERIOD_MIN * 60; // ≈ 5574 s
export const ALTITUDE_KM = 420; // nominal, for the readout when SIMULATED
export const VELOCITY_KMH = 27600; // nominal orbital speed

const OMEGA_ORBIT = (2 * Math.PI) / PERIOD_SEC; // rad/s along the orbit
// Earth's rotation + nodal regression combined, tuned so ground tracks step
// ~23° west per orbit (matches the real ISS trace).
const OMEGA_EARTH_DEG = 360 / 86164 + 23.3 / PERIOD_SEC; // deg/s

export interface SubPoint {
  lat: number; // degrees, −90..90
  lon: number; // degrees, wrapped to −180..180
  u: number; // argument of latitude, radians
  ascending: boolean; // moving north?
}

/** Wrap any longitude into −180..180. */
export function wrapLon(lon: number): number {
  const x = ((lon + 180) % 360 + 360) % 360;
  return x - 180;
}

export class Propagator {
  private i = INCLINATION_DEG * RAD;
  private u0: number; // phase at t=0 (seconds)
  private nodeLon: number; // ascending-node longitude, degrees
  private live = false;
  private lastLiveLat: number | null = null;

  constructor(seed: number) {
    const rng = mulberry32(seed);
    this.u0 = rng() * Math.PI * 2;
    this.nodeLon = rng() * 360 - 180;
  }

  /** True once a live feed has re-anchored the model. */
  get isLive(): boolean {
    return this.live;
  }

  /** Sub-satellite point at elapsed time t (seconds, from performance.now). */
  at(t: number): SubPoint {
    const u = this.u0 + OMEGA_ORBIT * t;
    const lat = Math.asin(Math.sin(this.i) * Math.sin(u)) * DEG;
    const dLon = Math.atan2(Math.cos(this.i) * Math.sin(u), Math.cos(u)) * DEG;
    const lon = wrapLon(this.nodeLon + dLon - OMEGA_EARTH_DEG * t);
    const ascending = Math.cos(u) > 0; // northbound half of the orbit
    return { lat, lon, u, ascending };
  }

  /**
   * Re-anchor the model to a measured live sub-point at time t. Solves the
   * argument of latitude from the measured latitude (disambiguated by whether
   * the point is climbing or descending), then sets the node longitude so the
   * model passes through the measured point. Keeps motion continuous between
   * polls instead of teleporting.
   */
  anchorLive(lat: number, lon: number, t: number): void {
    this.live = true;
    const clamped = Math.max(-INCLINATION_DEG + 0.01, Math.min(INCLINATION_DEG - 0.01, lat));
    const base = Math.asin(Math.sin(clamped * RAD) / Math.sin(this.i)); // −90..90
    const ascending =
      this.lastLiveLat === null ? true : lat >= this.lastLiveLat;
    // Ascending half: u in (−90,90). Descending half: u = 180 − base.
    const u = ascending ? base : Math.PI - base;
    // Choose u0 so model phase matches now, then set node from measured lon.
    this.u0 = u - OMEGA_ORBIT * t;
    const dLon = Math.atan2(Math.cos(this.i) * Math.sin(u), Math.cos(u)) * DEG;
    this.nodeLon = wrapLon(lon - dLon + OMEGA_EARTH_DEG * t);
    this.lastLiveLat = lat;
  }

  /**
   * Sample the ground track from (t − backSec) to (t + fwdSec) as projected
   * SVG polyline segments, split at every antimeridian crossing so lines never
   * streak across the whole map. Returns [{points, ageStart, ageEnd}] where age
   * 0 = now, negative = past tail, positive = future.
   */
  trackSegments(
    t: number,
    backSec: number,
    fwdSec: number,
    stepSec: number,
    project: (lon: number, lat: number) => [number, number],
  ): Array<{ d: string; future: boolean }> {
    const segs: Array<{ d: string; future: boolean }> = [];
    let cur: string[] = [];
    let curFuture = false;
    let prevX: number | null = null;
    let prevLon = 0;

    const flush = () => {
      if (cur.length > 1) segs.push({ d: cur.join(" "), future: curFuture });
      cur = [];
    };

    for (let ts = -backSec; ts <= fwdSec + 1e-6; ts += stepSec) {
      const p = this.at(t + ts);
      const [x, y] = project(p.lon, p.lat);
      const wrapJump = prevX !== null && Math.abs(p.lon - prevLon) > 180;
      const future = ts >= 0;
      if (wrapJump || future !== curFuture) {
        flush();
        curFuture = future;
      }
      cur.push(`${cur.length === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
      prevX = x;
      prevLon = p.lon;
    }
    flush();
    return segs;
  }
}

/** Great-circle angular distance (degrees) between two lon/lat points. */
export function angularDistanceDeg(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const φ1 = lat1 * RAD;
  const φ2 = lat2 * RAD;
  const dφ = (lat2 - lat1) * RAD;
  const dλ = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * DEG;
}
