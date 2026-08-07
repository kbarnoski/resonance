// 7848-latents — path geometry for the authored phrase.
//
// The markers you drop, in order, define a CLOSED loop. On play the token
// travels the loop at a tempo; each time it crosses a marker vertex the synth
// fires a note. The loop IS the phrase — a repeating structure you authored by
// exploring, not one shown to you.

import type { Point } from "./field";

export interface Loop {
  /** markers followed by a copy of the first, forming a closed polyline. */
  pts: Point[];
  segLen: number[];
  total: number;
  /** phase in [0,1) at which each marker vertex sits along the loop. */
  vertexPhase: number[];
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function buildLoop(markers: Point[]): Loop | null {
  if (markers.length < 2) return null;
  const pts = markers.concat([markers[0]]);
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = dist(pts[i], pts[i + 1]);
    segLen.push(d);
    total += d;
  }
  if (total <= 1e-6) return null;
  const vertexPhase: number[] = [0];
  let acc = 0;
  for (let i = 0; i < segLen.length - 1; i++) {
    acc += segLen[i];
    vertexPhase.push(acc / total);
  }
  return { pts, segLen, total, vertexPhase };
}

/** Position along the loop at phase ∈ [0,1). */
export function pointAtPhase(loop: Loop, phase: number): Point {
  const target = ((phase % 1) + 1) % 1;
  let want = target * loop.total;
  for (let i = 0; i < loop.segLen.length; i++) {
    if (want <= loop.segLen[i] || i === loop.segLen.length - 1) {
      const t = loop.segLen[i] > 1e-9 ? want / loop.segLen[i] : 0;
      const a = loop.pts[i];
      const b = loop.pts[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    want -= loop.segLen[i];
  }
  return loop.pts[0];
}

/**
 * Which marker vertices were crossed advancing from `prev` to `cur` (both in
 * [0,1), monotonically increasing, possibly wrapping past 1). Returns marker
 * indices in crossing order.
 */
export function crossedVertices(
  loop: Loop,
  prev: number,
  cur: number,
): number[] {
  const hits: number[] = [];
  const wrapped = cur < prev;
  for (let i = 0; i < loop.vertexPhase.length; i++) {
    const v = loop.vertexPhase[i];
    const inRange = wrapped
      ? v > prev || v <= cur
      : v > prev && v <= cur;
    if (inRange) hits.push(i);
  }
  return hits;
}
