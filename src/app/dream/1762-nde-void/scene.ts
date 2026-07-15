// ─────────────────────────────────────────────────────────────────────────────
// 1762-nde-void · scene.ts — THE SHARED GEOMETRY TABLE
//
//   This is the single source of truth for where the void's luminous structures
//   are, and it is consumed by BOTH the raymarched shader (as uniforms) and the
//   HRTF spatial-audio panners. Because sight and sound read the exact same
//   `relPositions(...)` output every frame, drifting past a structure genuinely
//   relocates its glow AND its sound to the same place in space — they can never
//   drift apart.
//
//   Coordinate frame (right-handed, matches three.js AND Web Audio):
//     +x right · +y up · +z toward the viewer · forward = -z.
//   The listener/camera drifts forward along world -z on rails; the GAZE
//   (yaw/pitch) rotates independently — that split is the dissociative feel:
//   the body falls forward while attention roams. Structures are placed once in
//   a long corridor and recycled by wrapping their along-corridor coordinate, so
//   the drift is endless and fully deterministic (no wall-clock, no RNG here).
// ─────────────────────────────────────────────────────────────────────────────

export type StructKind =
  | 0 // portal torus (the NDE "ring")
  | 1 // box-frame mullion (cold architecture)
  | 2 // saddle / hyperbolic-paraboloid sheet
  | 3; // arch (half-ring)

export interface Structure {
  /** Fixed lateral/vertical offset in the corridor (world x, y). */
  x: number;
  y: number;
  /** Base along-corridor coordinate (world z, before drift + wrap). */
  z0: number;
  kind: StructKind;
  /** Overall scale of the SDF form. */
  size: number;
  /** Cold tone fundamental (Hz) sung from this structure's position. */
  freq: number;
  /** 0..1 palette position (cold violet-neutral) + glow weight. */
  hue: number;
}

/** How far the camera travels before a structure recycles to the front. */
export const LOOP = 130;
/** Forward drift speed, world units / second (slow, weightless fall). */
export const DRIFT_SPEED = 3.4;
/** Camera-space window a structure lives in: far-ahead (-z) → just-behind (+z). */
const WIN_LO = -LOOP * 0.8; // far ahead of you
const WIN_HI = LOOP * 0.2; //  just behind you

// A seeded mulberry32 places the lateral scatter deterministically — the void
// looks scattered but is byte-identical every run (headless-verifiable).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seven sparse structures of the void — a cold, architectural in-between. */
export const STRUCTURES: Structure[] = (() => {
  const rnd = mulberry32(0x1762_c0d3);
  const kinds: StructKind[] = [0, 1, 2, 3, 0, 2, 1];
  const freqs = [55.0, 73.42, 98.0, 130.81, 164.81, 196.0, 246.94]; // cold, wide-spaced
  const out: Structure[] = [];
  for (let i = 0; i < 7; i++) {
    // Even along-corridor spacing with a little deterministic jitter so the
    // structures don't arrive on a metronome.
    const z0 = -(i * (LOOP / 7)) - (rnd() - 0.5) * 6.0;
    const ang = rnd() * Math.PI * 2;
    const rad = 5.0 + rnd() * 7.0; // off-axis so you pass beside, not through
    out.push({
      x: Math.cos(ang) * rad,
      y: (rnd() - 0.5) * 8.0,
      z0,
      kind: kinds[i],
      size: 2.4 + rnd() * 2.6,
      freq: freqs[i],
      hue: 0.12 + rnd() * 0.5, // stays in the cold violet-neutral band
    });
  }
  return out;
})();

export interface RelStruct {
  /** Camera-relative position in WORLD axes (structure − camera), un-rotated. */
  rx: number;
  ry: number;
  rz: number;
  /** Straight-line distance to the camera. */
  dist: number;
}

const wrap = (v: number, lo: number, hi: number): number => {
  const span = hi - lo;
  return ((((v - lo) % span) + span) % span) + lo;
};

/**
 * Given the total forward drift distance (world units the camera has fallen),
 * return each structure's camera-relative position. Pure + deterministic:
 * feeds the shader uniforms AND the audio panners from ONE computation, so the
 * scene the eye marches and the scene the ear localises are literally identical.
 *
 * Reuses a caller-provided array to avoid per-frame allocation in the RAF loop.
 */
export function relPositions(drift: number, out: RelStruct[]): RelStruct[] {
  for (let i = 0; i < STRUCTURES.length; i++) {
    const s = STRUCTURES[i];
    // Camera has moved to z = -drift (forward = -z). rel.z = worldZ - camZ.
    // Wrapping worldZ keeps the structure cycling through the corridor window.
    const rz = wrap(s.z0 + drift, WIN_LO, WIN_HI);
    const rx = s.x;
    const ry = s.y;
    const r = out[i] ?? (out[i] = { rx: 0, ry: 0, rz: 0, dist: 0 });
    r.rx = rx;
    r.ry = ry;
    r.rz = rz;
    r.dist = Math.sqrt(rx * rx + ry * ry + rz * rz);
  }
  return out;
}

/** Convenience allocator for the shared rel-position buffer. */
export function makeRelBuffer(): RelStruct[] {
  return STRUCTURES.map(() => ({ rx: 0, ry: 0, rz: 0, dist: 0 }));
}
