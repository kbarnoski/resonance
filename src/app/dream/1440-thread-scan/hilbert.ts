// ─────────────────────────────────────────────────────────────────────────────
// hilbert.ts — the one unbroken thread.
//
//   A Hilbert space-filling curve (Hilbert 1891, after Peano 1890) is a single
//   continuous line that visits every cell of a 2^order × 2^order grid exactly
//   once while preserving LOCALITY: cells that are neighbours in the 2-D plane
//   land close together along the 1-D curve. That is the whole point of this
//   instrument — it weaves a flat field into one thread, so a shape you paint
//   becomes a coherent gesture in time and the whole field is audibly ONE line.
//
//   buildHilbert(order) returns the ordered list of grid cells the thread
//   visits. `d2xy` is the standard bit-twiddling distance→coordinate map.
// ─────────────────────────────────────────────────────────────────────────────

export interface HilbertCurve {
  order: number;
  /** side length in cells = 2^order */
  side: number;
  /** number of cells = 4^order */
  count: number;
  /** flat [x0,y0, x1,y1, …] grid coords, in visiting order */
  xy: Int16Array;
}

/** Convert a 1-D distance d along the order-`side` Hilbert curve to (x,y). */
function d2xy(side: number, d: number): [number, number] {
  let rx: number;
  let ry: number;
  let t = d;
  let x = 0;
  let y = 0;
  for (let s = 1; s < side; s *= 2) {
    rx = 1 & Math.floor(t / 2);
    ry = 1 & (t ^ rx);
    // rotate the quadrant into canonical orientation
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

const CACHE = new Map<number, HilbertCurve>();

export function buildHilbert(order: number): HilbertCurve {
  const o = Math.max(2, Math.min(6, Math.round(order)));
  const cached = CACHE.get(o);
  if (cached) return cached;

  const side = 1 << o; // 2^order
  const count = side * side;
  const xy = new Int16Array(count * 2);
  for (let d = 0; d < count; d++) {
    const [x, y] = d2xy(side, d);
    xy[d * 2] = x;
    xy[d * 2 + 1] = y;
  }
  const curve: HilbertCurve = { order: o, side, count, xy };
  CACHE.set(o, curve);
  return curve;
}

/**
 * Sample the continuous position of a reading-head at fractional index `p`
 * (0 … count-1) along the curve, returning a NORMALISED field coordinate in
 * [0,1]. Linear interpolation between the two nearest cell centres keeps the
 * head gliding smoothly, so pitch (mapped from position) is a true glissando.
 */
export function headAt(curve: HilbertCurve, p: number): { fx: number; fy: number } {
  const { xy, side, count } = curve;
  const clamped = ((p % count) + count) % count; // wrap — the thread is a loop of travel
  const i0 = Math.floor(clamped);
  const i1 = (i0 + 1) % count;
  const frac = clamped - i0;
  const ax = xy[i0 * 2];
  const ay = xy[i0 * 2 + 1];
  const bx = xy[i1 * 2];
  const by = xy[i1 * 2 + 1];
  // cell centre → normalised
  const gx = (ax + (bx - ax) * frac + 0.5) / side;
  const gy = (ay + (by - ay) * frac + 0.5) / side;
  return { fx: gx, fy: gy };
}
