// field.ts — the 3-D geometry of the room and the 3-D→2-D projection.
//
// You stand at the origin (the fixed AudioListener / the head marker). Six
// just-intonation voices float on a sphere around your head. Each voice has a
// resting HOME position; grabbing it PULLS it in close (so it swells) and lets
// your hand place it anywhere in azimuth + height. Height maps to timbre in
// audio.ts — lifting a voice makes it bloom.
//
// The projection is a slowly-orbiting perspective view: nearer sources project
// larger and brighter. The orbit keeps the field visibly alive even on a muted
// phone with zero input.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const N_SOURCES = 6;
// A low fundamental (~130 Hz, C3) with the classic just / harmonic-series chord.
export const FUNDAMENTAL = 130.81;
export const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 15 / 8];
export const RATIO_LABELS = ["1/1", "9/8", "5/4", "3/2", "5/3", "15/8"];

export const HOME_RADIUS = 2.4; // resting horizontal radius from the head
export const HELD_RADIUS = 1.5; // grabbed voices are pulled in close (louder)

/** Even resting azimuth around the head for source i. */
export function baseAzimuth(i: number): number {
  return -Math.PI + ((i + 0.5) / N_SOURCES) * Math.PI * 2;
}

/** A gentle resting-height stagger so the chord doesn't sit in one flat ring. */
export function homeElevation(i: number): number {
  return ((i % 3) - 1) * 0.55;
}

/** Spherical-ish placement: az sweeps around the head, height is the y axis,
 *  r is the horizontal radius. */
export function sph(az: number, height: number, r: number): Vec3 {
  return { x: r * Math.sin(az), y: height, z: r * Math.cos(az) };
}

export function homePosition(i: number): Vec3 {
  return sph(baseAzimuth(i), homeElevation(i), HOME_RADIUS);
}

/** Map a hand's normalized screen position (0..1) to a 3-D target:
 *  X sweeps azimuth around the head, Y sets height (→ brightness), and holding
 *  it pulls the voice in to HELD_RADIUS so it swells toward you. */
export function handToTarget(hx: number, hy: number): Vec3 {
  const az = (hx - 0.5) * Math.PI * 1.7;
  const height = (0.5 - hy) * 3.0;
  return sph(az, height, HELD_RADIUS);
}

export function dist3(p: Vec3): number {
  return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
}

/** height (y) → 0..1 brightness control shared by audio + visuals. */
export function heightNorm(y: number): number {
  return Math.max(0, Math.min(1, (y + 1.6) / 3.2));
}

// ── Projection ───────────────────────────────────────────────────────────────
const TILT = -0.4; // look slightly down onto the field
const CAM_D = 6.6; // camera distance along +Z

export interface Projected {
  sx: number;
  sy: number;
  scale: number; // >1 nearer camera, <1 farther — drives glyph size + brightness
  z: number; // rotated depth, for painter's-algorithm sorting
}

export function project(p: Vec3, orbit: number, w: number, h: number): Projected {
  // orbit around the vertical (Y) axis
  const cyo = Math.cos(orbit);
  const syo = Math.sin(orbit);
  const x = p.x * cyo - p.z * syo;
  let z = p.x * syo + p.z * cyo;
  const y0 = p.y;
  // fixed downward tilt around X
  const cxt = Math.cos(TILT);
  const sxt = Math.sin(TILT);
  const y = y0 * cxt - z * sxt;
  z = y0 * sxt + z * cxt;

  const denom = Math.max(0.6, CAM_D - z);
  const base = Math.min(w, h);
  const persp = base * 0.15 * (CAM_D / denom);
  return {
    sx: w / 2 + x * persp,
    sy: h / 2 - y * persp,
    scale: CAM_D / denom,
    z,
  };
}
