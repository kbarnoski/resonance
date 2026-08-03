// Small column-major mat4 helpers + the audio-driven metaball field.
// Kept on the CPU so the WebGPU compute pass and the Canvas2D fallback
// read from exactly the same moving iso-surface definition.

import { makeRng, SEED } from "./prng";

export const METABALL_COUNT = 8;

/** Column-major 4x4 identity. */
function ident(): Float32Array {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** Perspective projection (column-major, right-handed, -z forward). */
export function perspective(
  fovy: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

/** Right-handed lookAt view matrix (column-major). */
export function lookAt(
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number],
): Float32Array {
  const zx = eye[0] - center[0];
  const zy = eye[1] - center[1];
  const zz = eye[2] - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  const z0 = zx / zl,
    z1 = zy / zl,
    z2 = zz / zl;
  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  const xl = Math.hypot(x0, x1, x2) || 1;
  x0 /= xl;
  x1 /= xl;
  x2 /= xl;
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;
  const m = ident();
  m[0] = x0;
  m[4] = x1;
  m[8] = x2;
  m[1] = y0;
  m[5] = y1;
  m[9] = y2;
  m[2] = z0;
  m[6] = z1;
  m[10] = z2;
  m[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  m[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  m[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  return m;
}

/** Fixed per-metaball orbit parameters, seeded once. */
export interface Orbit {
  radius: number;
  speed: number;
  phase: number;
  tilt: number;
  bandLo: number; // which band drives its lobe size (0..7)
  base: number; // base weight
}

/** Build the deterministic set of metaball orbits from the fixed seed. */
export function makeOrbits(): Orbit[] {
  const rng = makeRng(SEED);
  const orbits: Orbit[] = [];
  for (let i = 0; i < METABALL_COUNT; i++) {
    orbits.push({
      radius: 0.55 + rng() * 0.9,
      speed: (0.12 + rng() * 0.5) * (rng() < 0.5 ? -1 : 1),
      phase: rng() * Math.PI * 2,
      tilt: rng() * Math.PI,
      bandLo: i, // metaball i listens to band i
      base: 0.7 + rng() * 0.8,
    });
  }
  return orbits;
}

/**
 * Evaluate metaball centers + weights at time `t` for the given 8 band
 * energies. Low bands push the first metaballs into big, slow lobes; high
 * bands make the later ones dart on tight fast orbits so the skin "buds".
 * Writes into `out` as METABALL_COUNT * vec4(cx, cy, cz, weight).
 */
export function updateMetaballs(
  out: Float32Array,
  orbits: Orbit[],
  t: number,
  bands: Float32Array,
): void {
  for (let i = 0; i < METABALL_COUNT; i++) {
    const o = orbits[i];
    const e = bands[o.bandLo] ?? 0;
    // low index = slow big lobe, high index = fast small bud
    const hiBias = i / (METABALL_COUNT - 1);
    const rad = o.radius * (0.7 + e * (1.1 - 0.6 * hiBias));
    const spd = o.speed * (1 + hiBias * 2.2 + e * 1.4);
    const a = o.phase + t * spd;
    const b = o.tilt + t * spd * 0.6;
    const cx = Math.cos(a) * rad;
    const cy = Math.sin(b) * rad * 0.85;
    const cz = Math.sin(a) * Math.cos(b) * rad;
    const w = o.base * (0.55 + e * (1.4 + hiBias * 1.6));
    const j = i * 4;
    out[j] = cx;
    out[j + 1] = cy;
    out[j + 2] = cz;
    out[j + 3] = w;
  }
}

/** Scalar field value at point p from the current metaball buffer. */
export function fieldAt(
  metaballs: Float32Array,
  px: number,
  py: number,
  pz: number,
): number {
  let f = 0;
  for (let i = 0; i < METABALL_COUNT; i++) {
    const j = i * 4;
    const dx = px - metaballs[j];
    const dy = py - metaballs[j + 1];
    const dz = pz - metaballs[j + 2];
    f += metaballs[j + 3] / (dx * dx + dy * dy + dz * dz + 0.08);
  }
  return f;
}
