// ghost.ts — the MANDATORY self-demo: a synthetic "wandering presence".
//
// With NO camera and NO depth model, this fills the depth grid with a soft
// volumetric dust field plus a moving Gaussian presence that GLIDES between
// waypoints and HOLDS at each one long enough to trigger a dwell-deposit. It
// drives the exact same pipeline as real depth (grid → features → memory →
// audio + render), so the piece is alive and musical the instant it loads.
//
// The waypoints span horizontal position AND depth, so over one loop the ghost
// authors a spread just-intonation chord through the room — hands-off.

interface Waypoint {
  x: number; // 0..1 horizontal
  d: number; // 0.65..1 depth (1 = nearest)
}

// Six holds across the room; varied depth → varied partials → a real chord.
const WPTS: Waypoint[] = [
  { x: 0.3, d: 0.96 },
  { x: 0.64, d: 0.78 },
  { x: 0.5, d: 1.0 },
  { x: 0.76, d: 0.7 },
  { x: 0.4, d: 0.88 },
  { x: 0.6, d: 0.74 },
];

const HOLD = 2.2; // seconds paused at a waypoint (> dwell threshold)
const GLIDE = 1.35; // seconds gliding to the next
const SEG = HOLD + GLIDE;

function smoothstep(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

interface Presence {
  cx: number;
  cy: number;
  depth: number;
}

function presenceAt(t: number): Presence {
  const n = WPTS.length;
  const i = Math.floor(t / SEG) % n;
  const a = WPTS[i];
  const b = WPTS[(i + 1) % n];
  const tt = t % SEG;
  let e = 0;
  if (tt > HOLD) e = smoothstep((tt - HOLD) / GLIDE);
  const cx = a.x + (b.x - a.x) * e;
  const depth = a.d + (b.d - a.d) * e;
  // gentle vertical drift + breathing so the presence feels alive while held
  const cy = 0.46 + 0.09 * Math.sin(t * 0.31) + 0.03 * Math.sin(t * 0.9);
  return { cx, cy, depth };
}

/** Fill `out` (length gw*gh) with the ghost depth field at time t (seconds). */
export function runGhostField(
  out: Float32Array,
  gw: number,
  gh: number,
  t: number,
): void {
  const p = presenceAt(t);
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.7);
  const radius = 0.17 + 0.05 * breathe;
  const inv2r2 = 1 / (2 * radius * radius);
  for (let gy = 0; gy < gh; gy++) {
    const ny = gy / (gh - 1);
    for (let gx = 0; gx < gw; gx++) {
      const nx = gx / (gw - 1);
      // faint volumetric backdrop dust (far)
      let v =
        0.16 +
        0.05 * Math.sin(nx * 7.0 + t * 0.2) * Math.sin(ny * 5.0 - t * 0.15) +
        0.02 * Math.sin(nx * 19.0 + ny * 13.0);
      // the presence blob (near)
      const dx = nx - p.cx;
      const dy = ny - p.cy;
      const g = Math.exp(-(dx * dx + dy * dy) * inv2r2);
      v += (p.depth - v) * g;
      out[gy * gw + gx] = Math.max(0, Math.min(1, v));
    }
  }
}
