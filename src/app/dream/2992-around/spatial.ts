/**
 * spatial.ts — deterministic geometry + pitch mapping for the choir room.
 *
 * The listener sits at the origin. Each voice-orb lives at a spherical
 * position (azimuth around the head, elevation above/below the ears,
 * distance out from the centre) and slowly orbits on its own seeded arc.
 *
 * Web Audio uses a right-handed frame: +X right, +Y up, -Z straight ahead.
 * We convert (azimuth, elevation, distance) → that cartesian frame here.
 */

/** Seeded PRNG — the whole room is reproducible from a single integer. */
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

export const D_MIN = 1.3; // nearest an orb may sit (metres-ish)
export const D_MAX = 7.0; // farthest an orb may sit
export const ELEV_MAX = Math.PI / 3; // ±60° of elevation travel

/** One sustained voice placed in the space around the head. */
export type Orb = {
  id: number;
  az0: number; // azimuth at t=0 (world frame), radians. 0 = front, +right
  omega: number; // orbital angular velocity, rad/s (signed)
  elev0: number; // centre elevation, radians
  elevAmp: number; // elevation bob amplitude, radians
  elevRate: number; // elevation bob rate, rad/s
  elevPhase: number; // elevation bob phase offset
  distance: number; // radial distance from listener
  freq: number; // continuous fundamental, Hz (never quantised)
  hue: number; // 0..1 colour + pitch parameter
};

/** Live pose of an orb at time t — what the renderer + panner consume. */
export type Pose = {
  id: number;
  az: number;
  elev: number;
  distance: number;
  freq: number;
  hue: number;
  x: number; // cartesian, Web Audio frame
  y: number;
  z: number;
};

/** Continuous pitch from spatial position — higher + nearer sings higher. */
export function freqFromPosition(distance: number, elev: number): number {
  const elevNorm = clamp01((elev + ELEV_MAX) / (2 * ELEV_MAX));
  const distNorm = clamp01((distance - D_MIN) / (D_MAX - D_MIN));
  const t = 0.62 * elevNorm + 0.38 * (1 - distNorm);
  return 90 * Math.pow(6.1, t); // ~90 Hz .. ~549 Hz, fully continuous
}

/** The 0..1 timbre/colour parameter matching a pitch. */
export function tFromPosition(distance: number, elev: number): number {
  const elevNorm = clamp01((elev + ELEV_MAX) / (2 * ELEV_MAX));
  const distNorm = clamp01((distance - D_MIN) / (D_MAX - D_MIN));
  return 0.62 * elevNorm + 0.38 * (1 - distNorm);
}

/**
 * Build a voice-orb from a placement (azimuth, distance, elevation) plus a
 * seeded PRNG that fixes its private orbit. `motionScale` throttles orbit +
 * bob speed for prefers-reduced-motion.
 */
export function makeOrb(
  id: number,
  azimuth: number,
  distance: number,
  elevation: number,
  rand: () => number,
  motionScale: number,
): Orb {
  const dist = clamp(distance, D_MIN, D_MAX);
  const elev = clamp(elevation, -ELEV_MAX, ELEV_MAX);
  const dir = rand() < 0.5 ? -1 : 1;
  const omega = dir * (0.05 + rand() * 0.17) * motionScale;
  return {
    id,
    az0: azimuth,
    omega,
    elev0: elev,
    elevAmp: (0.06 + rand() * 0.28) * (0.4 + 0.6 * motionScale),
    elevRate: (0.08 + rand() * 0.22) * motionScale,
    elevPhase: rand() * Math.PI * 2,
    distance: dist,
    freq: freqFromPosition(dist, elev),
    hue: tFromPosition(dist, elev),
  };
}

/** A deterministic starter choir that plays with zero interaction. */
export function makeDemoOrbs(
  rand: () => number,
  n: number,
  motionScale: number,
): Orb[] {
  const orbs: Orb[] = [];
  for (let i = 0; i < n; i++) {
    const azimuth = rand() * Math.PI * 2;
    const distance = D_MIN + rand() * (D_MAX - D_MIN) * 0.85;
    const elevation = (rand() * 2 - 1) * ELEV_MAX * 0.8;
    orbs.push(makeOrb(i, azimuth, distance, elevation, rand, motionScale));
  }
  return orbs;
}

/** Evaluate an orb's live pose at time `t` seconds. */
export function poseAt(orb: Orb, t: number): Pose {
  const az = orb.az0 + orb.omega * t;
  const elev =
    orb.elev0 + orb.elevAmp * Math.sin(orb.elevPhase + orb.elevRate * t);
  const r = orb.distance;
  const ce = Math.cos(elev);
  // Web Audio frame: front is -Z, right is +X, up is +Y.
  const x = r * ce * Math.sin(az);
  const y = r * Math.sin(elev);
  const z = -r * ce * Math.cos(az);
  return { id: orb.id, az, elev, distance: r, freq: orb.freq, hue: orb.hue, x, y, z };
}

/**
 * Listener orientation vectors from yaw (turn) + pitch (nod).
 * Returns an orthonormal { forward, up } for AudioListener.
 */
export function listenerVectors(
  yaw: number,
  pitch: number,
): { fwd: [number, number, number]; up: [number, number, number] } {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const fwd: [number, number, number] = [-cp * sy, sp, -cp * cy];
  const up: [number, number, number] = [sp * sy, cp, sp * cy];
  return { fwd, up };
}

/** Perceived prominence of a pose: near + in front of the listener wins. */
export function prominence(p: Pose, yaw: number): number {
  // Facing direction (yaw only) in the top-down plane.
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const len = Math.hypot(p.x, p.z) || 1;
  const front = (p.x * fx + p.z * fz) / len; // -1..1
  const near = 1 / (1 + p.distance);
  return near * (0.6 + 0.4 * front);
}

/** Radar + horizon layout derived from the current canvas size. */
export type Geom = {
  cx: number;
  cy: number;
  R: number;
  hx0: number;
  hx1: number;
  hy0: number;
  hy1: number;
};

export function radarGeom(w: number, h: number): Geom {
  const R = Math.min(w * 0.42, h * 0.33);
  return {
    cx: w * 0.5,
    cy: h * 0.38,
    R,
    hx0: w * 0.08,
    hx1: w * 0.92,
    hy0: h * 0.79,
    hy1: h * 0.95,
  };
}

/** Screen point on the radar → placement (azimuth, distance). */
export function radarToPlacement(
  px: number,
  py: number,
  g: Geom,
): { azimuth: number; distance: number } {
  const dx = px - g.cx;
  const dy = py - g.cy;
  const rPx = Math.hypot(dx, dy);
  const azimuth = Math.atan2(dx, -dy); // up = front = 0, right = +
  const distance = clamp((rPx / g.R) * D_MAX, D_MIN, D_MAX);
  return { azimuth, distance };
}

/** Live azimuth/distance → screen point on the radar (world frame). */
export function placementToRadar(
  az: number,
  distance: number,
  g: Geom,
): { x: number; y: number } {
  const rPx = (distance / D_MAX) * g.R;
  return { x: g.cx + Math.sin(az) * rPx, y: g.cy - Math.cos(az) * rPx };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
