// graph.ts — the sonified GRAPH extraction. This is the cycle-3 deepening of
// 1089: on top of the living Physarum field we pull a real node-edge graph and
// three statistics from the cosmic-web literature (Codis/Pogosyan/Pichon 2018;
// Euclid Q1 2026):
//
//   1. DEGREE   — how many distinct filaments radiate from a node (radial
//                 ray-count, contiguous hit-runs). Euclid's "connectivity kappa".
//                 -> a just-intonation chord (kept from 1089).
//   2. EDGES    — for every node pair in range, sample the trail along the
//                 segment; a sustained above-threshold filament bridging them is
//                 an EDGE. -> an interval dyad + a "connection formed" chime.
//   3. CLUSTERING — per node, the fraction of its graph-neighbours that are
//                 themselves connected (local triangle density). -> chord
//                 density/brightness: a woven neighbourhood is full, a lonely
//                 bridge node thin.
//
// Everything reads a NORMALISED field (0..1) so the exact same code runs on the
// WebGL2 readback and on the CPU-fallback field. The caller (page.tsx) applies
// on/off hysteresis to the raw edge coverages so filament flicker does not spam
// the "new edge" chime.

import type { Node } from "./physarum";

export interface EdgeCandidate {
  a: number; // node id (a < b by array order)
  b: number;
  ax: number; // normalised endpoint coords (for drawing + panning)
  ay: number;
  bx: number;
  by: number;
  coverage: number; // 0..1 fraction of the segment carrying a filament
}

// Bilinear sample of the normalised field with clamped edges.
function sampleField(f: Float32Array, w: number, h: number, px: number, py: number): number {
  const x = Math.max(0, Math.min(w - 1.001, px));
  const y = Math.max(0, Math.min(h - 1.001, py));
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i00 = y0 * w + x0;
  const v00 = f[i00];
  const v10 = f[i00 + 1];
  const v01 = f[i00 + w];
  const v11 = f[i00 + w + 1];
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fy;
}

const RAYS = 30; // radial samples around a node
const RAY_STEPS = 10; // samples per ray inner->outer
const HIT_ARC = 6; // of RAY_STEPS above threshold for a "sustained" filament

// DEGREE (Euclid connectivity): count distinct filament ridges radiating from a
// node by casting rays and collapsing contiguous hit-rays into one filament.
export function measureDegree(
  f: Float32Array,
  w: number,
  h: number,
  nx: number,
  ny: number,
  threshold: number,
): number {
  const cx = nx * w;
  const cy = ny * h;
  const inner = w * 0.014;
  const outer = w * 0.1;
  const hits: boolean[] = new Array(RAYS);
  for (let r = 0; r < RAYS; r++) {
    const ang = (r / RAYS) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let above = 0;
    for (let s = 0; s < RAY_STEPS; s++) {
      const t = inner + (outer - inner) * (s / (RAY_STEPS - 1));
      if (sampleField(f, w, h, cx + dx * t, cy + dy * t) > threshold) above++;
    }
    hits[r] = above >= HIT_ARC;
  }
  let firstFalse = -1;
  for (let r = 0; r < RAYS; r++) {
    if (!hits[r]) {
      firstFalse = r;
      break;
    }
  }
  if (firstFalse === -1) return hits[0] ? 1 : 0; // full ring -> one blob
  let degree = 0;
  let prev = false;
  for (let k = 0; k < RAYS; k++) {
    const r = (firstFalse + k) % RAYS;
    const cur = hits[r];
    if (cur && !prev) degree++;
    prev = cur;
  }
  return degree;
}

export function computeDegrees(
  f: Float32Array,
  w: number,
  h: number,
  nodes: Node[],
  threshold: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const n of nodes) {
    if (!n.alive) continue;
    out.set(n.id, measureDegree(f, w, h, n.x, n.y, threshold));
  }
  return out;
}

const EDGE_SAMPLES = 24;
const EDGE_SKIP = 4; // skip the first/last few samples (the two node cores)

// Coverage of the filament bridging two nodes: fraction of the mid-segment above
// threshold. A real edge needs a SUSTAINED bridge, not just bright endpoints.
export function edgeCoverage(
  f: Float32Array,
  w: number,
  h: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  threshold: number,
): number {
  let hit = 0;
  let cnt = 0;
  for (let i = EDGE_SKIP; i < EDGE_SAMPLES - EDGE_SKIP; i++) {
    const t = i / (EDGE_SAMPLES - 1);
    const x = (ax + (bx - ax) * t) * w;
    const y = (ay + (by - ay) * t) * h;
    if (sampleField(f, w, h, x, y) > threshold) hit++;
    cnt++;
  }
  return cnt > 0 ? hit / cnt : 0;
}

export interface EdgeOpts {
  threshold: number; // field brightness a bridge must exceed
  maxRange: number; // max normalised node separation to consider an edge
  minRange: number; // ignore near-coincident nodes (same cluster)
}

// All in-range node pairs with their raw bridge coverage. The caller decides
// which are "on" via hysteresis.
export function candidateEdges(
  f: Float32Array,
  w: number,
  h: number,
  nodes: Node[],
  opts: EdgeOpts,
): EdgeCandidate[] {
  const alive = nodes.filter((n) => n.alive);
  const out: EdgeCandidate[] = [];
  for (let i = 0; i < alive.length; i++) {
    const a = alive[i];
    for (let j = i + 1; j < alive.length; j++) {
      const b = alive[j];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < opts.minRange || dist > opts.maxRange) continue;
      const cov = edgeCoverage(f, w, h, a.x, a.y, b.x, b.y, opts.threshold);
      out.push({ a: a.id, b: b.id, ax: a.x, ay: a.y, bx: b.x, by: b.y, coverage: cov });
    }
  }
  return out;
}

// Local clustering coefficient per node from a stable adjacency map: the
// fraction of a node's neighbour-pairs that are themselves connected.
export function clusteringFromAdjacency(
  ids: number[],
  adjacency: Map<number, Set<number>>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of ids) {
    const nb = adjacency.get(id);
    if (!nb || nb.size < 2) {
      out.set(id, 0);
      continue;
    }
    const neighbours = [...nb];
    let links = 0;
    for (let i = 0; i < neighbours.length; i++) {
      const si = adjacency.get(neighbours[i]);
      if (!si) continue;
      for (let j = i + 1; j < neighbours.length; j++) {
        if (si.has(neighbours[j])) links++;
      }
    }
    const possible = (neighbours.length * (neighbours.length - 1)) / 2;
    out.set(id, possible > 0 ? links / possible : 0);
  }
  return out;
}
