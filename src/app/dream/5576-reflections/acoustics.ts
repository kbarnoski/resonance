// ════════════════════════════════════════════════════════════════════════════
// Reflections (5576) — GEOMETRIC ACOUSTICS via the IMAGE-SOURCE METHOD
//
// Reference: Allen & Berkley, "Image method for efficiently simulating
// small-room acoustics," J. Acoust. Soc. Am. 65(4), 1979.
//
// For a rectangular ("shoebox") room, every specular reflection off a wall is
// equivalent to a straight, unobstructed path from a MIRRORED copy of the
// source — a "virtual image source" reflected across that wall. Reflecting the
// images again across walls yields higher-order reflections. Because the room
// is convex and axis-aligned, every image source corresponds to a physically
// valid path, so no explicit visibility test is needed. This module builds the
// image lattice (static per source) and, for a given listener position,
// computes each reflection's path length, delay, gain, air-absorption cutoff,
// world direction, and the folded bounce path (for drawing).
// ════════════════════════════════════════════════════════════════════════════

export const SPEED_OF_SOUND = 343; // m/s

export interface Vec2 {
  x: number;
  y: number;
}

/** An axis-aligned wall: a line where `axis` coordinate equals `pos`. */
export interface Wall {
  axis: "x" | "y";
  pos: number;
  id: string;
}

/** Static description of one image source (independent of listener). */
export interface ImageStruct {
  pos: Vec2; // mirrored source position (may lie outside the room)
  order: number; // number of wall bounces (0 = the real, direct source)
  walls: Wall[]; // construction order c1..ck (ck applied last)
}

/** A live reflection tap, recomputed as the listener moves. */
export interface Tap {
  order: number;
  imagePos: Vec2; // image-source position in world/plan coords
  pathLength: number; // metres
  delay: number; // seconds  = pathLength / c
  gain: number; // linear    = coeff^order / max(1, pathLength)
  cutoff: number; // Hz        air-absorption low-pass cutoff
  worldDir: Vec2; // unit vector from listener toward the image source
  path: Vec2[]; // folded path: [source, bounce1..k, listener]
}

/** Walls of a shoebox room with corner at origin, size Lx x Ly. */
export function buildWalls(lx: number, ly: number): Wall[] {
  return [
    { axis: "x", pos: 0, id: "W" }, // west  (x = 0)
    { axis: "x", pos: lx, id: "E" }, // east  (x = Lx)
    { axis: "y", pos: 0, id: "N" }, // north (y = 0)
    { axis: "y", pos: ly, id: "S" }, // south (y = Ly)
  ];
}

function mirror(p: Vec2, w: Wall): Vec2 {
  return w.axis === "x"
    ? { x: 2 * w.pos - p.x, y: p.y }
    : { x: p.x, y: 2 * w.pos - p.y };
}

// ────────────────────────────────────────────────────────────────────────────
// Build the image lattice for one source up to `maxOrder`.
// Rule: never reflect across the wall just used (that is the identity for that
// mirror and would return a lower-order image). This yields a bounded set:
//   order 0: 1     order 1: 4     order 2: 12     → 17 images at maxOrder = 2.
// ────────────────────────────────────────────────────────────────────────────
export function buildImageSources(
  source: Vec2,
  walls: Wall[],
  maxOrder: number,
): ImageStruct[] {
  const out: ImageStruct[] = [];
  const recurse = (
    pos: Vec2,
    order: number,
    used: Wall[],
    last: Wall | null,
  ) => {
    out.push({ pos, order, walls: used });
    if (order >= maxOrder) return;
    for (const w of walls) {
      if (last && w.id === last.id) continue; // skip immediate re-reflection
      recurse(mirror(pos, w), order + 1, [...used, w], w);
    }
  };
  recurse(source, 0, [], null);
  return out;
}

function intersect(a: Vec2, b: Vec2, w: Wall): Vec2 {
  if (w.axis === "x") {
    const dx = b.x - a.x;
    const t = Math.abs(dx) < 1e-9 ? 0 : (w.pos - a.x) / dx;
    return { x: w.pos, y: a.y + t * (b.y - a.y) };
  }
  const dy = b.y - a.y;
  const t = Math.abs(dy) < 1e-9 ? 0 : (w.pos - a.y) / dy;
  return { x: a.x + t * (b.x - a.x), y: w.pos };
}

// Reconstruct the folded reflection path by back-tracing from the listener.
// Given construction walls c1..ck and the intermediate images J0=source..Jk,
// the outermost wall ck is crossed first from the listener toward Jk.
function reconstructPath(
  listener: Vec2,
  source: Vec2,
  img: ImageStruct,
): Vec2[] {
  const k = img.walls.length;
  if (k === 0) return [source, listener];
  const J: Vec2[] = [source];
  for (const w of img.walls) J.push(mirror(J[J.length - 1], w));
  const bounces: Vec2[] = [];
  let point = listener;
  for (let i = k; i >= 1; i--) {
    const w = img.walls[i - 1];
    const ref = J[i];
    const hit = intersect(point, ref, w);
    bounces.push(hit);
    point = hit;
  }
  bounces.reverse(); // from source side to listener side
  return [source, ...bounces, listener];
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Compute the live tap for one image source given the listener position. */
export function computeTap(
  listener: Vec2,
  source: Vec2,
  img: ImageStruct,
  reflectCoeff: number,
): Tap {
  const d = Math.max(dist(listener, img.pos), 0.001);
  const dx = img.pos.x - listener.x;
  const dy = img.pos.y - listener.y;
  const inv = 1 / d;
  const gain = Math.pow(reflectCoeff, img.order) / Math.max(1, d);
  // Air absorption: longer paths lose highs. Smooth exponential rolloff.
  const cutoff = Math.min(18000, Math.max(700, 1200 + 16000 * Math.exp(-d / 8)));
  return {
    order: img.order,
    imagePos: img.pos,
    pathLength: d,
    delay: d / SPEED_OF_SOUND,
    gain,
    cutoff,
    worldDir: { x: dx * inv, y: dy * inv },
    path: reconstructPath(listener, source, img),
  };
}
