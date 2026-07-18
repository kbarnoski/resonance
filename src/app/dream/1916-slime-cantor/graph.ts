// graph.ts — the harmony brain (CPU side).
//
// The slime's emergent transport network is turned into music by *spectral
// graph theory*: we build a small weighted graph from the placed food nodes
// (an edge exists when the slime has physically routed a vein between two
// nodes), form its graph Laplacian L = D − W, and take the eigenvalues of L.
// Those eigenvalues are the network's natural modes — the direct analogue of
// the resonant modes of a drum head (where frequency ∝ √λ). We map them to
// oscillator frequencies to get an additive "connectome-harmonics" drone.
//
// Nothing here is pentatonic or quantized: the eigenvalues are continuous
// real numbers and map continuously to pitch. As the slime rewires, the
// spectrum drifts and the chord morphs.
//
// Everything is deterministic. Randomness comes only from mulberry32.

export const MAX_NODES = 8;

/** Deterministic PRNG. Seed once; never Math.random / Date.now anywhere. */
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

export interface FoodNode {
  id: number;
  /** normalized position in [0,1]×[0,1] (top-left origin). */
  x: number;
  y: number;
}

/** An undirected edge between two active node indices, with mean vein density. */
export interface Edge {
  i: number;
  j: number;
  w: number;
}

/**
 * An edge is "real" when the mean trail density sampled along the segment
 * between two nodes exceeds this threshold — i.e. the slime has physically
 * connected them. Tuned heuristically against the sim's deposit/decay balance;
 * see README self-assessment (this constant is the main unverified knob).
 */
export const EDGE_THRESHOLD = 0.22;

/**
 * Build the weighted edge list from a flat MAX_NODES×MAX_NODES matrix of mean
 * segment densities (as read back from the GPU, or computed on the CPU
 * fallback). Only the upper triangle (i<j) of active nodes is consulted.
 */
export function buildEdges(
  samples: Float32Array,
  activeCount: number,
  threshold = EDGE_THRESHOLD,
): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < activeCount; i++) {
    for (let j = i + 1; j < activeCount; j++) {
      const s = samples[i * MAX_NODES + j];
      if (s > threshold) edges.push({ i, j, w: s });
    }
  }
  return edges;
}

/** Stable string key for an edge, for cheap set membership / diffing. */
export function edgeKey(e: Edge): string {
  return `${e.i}-${e.j}`;
}

/** New / broken edges between two edge lists — drives the bell / damp cues. */
export function diffEdges(
  prev: Edge[],
  next: Edge[],
): { added: Edge[]; removed: Edge[] } {
  const prevKeys = new Set(prev.map(edgeKey));
  const nextKeys = new Set(next.map(edgeKey));
  const added = next.filter((e) => !prevKeys.has(edgeKey(e)));
  const removed = prev.filter((e) => !nextKeys.has(edgeKey(e)));
  return { added, removed };
}

/**
 * Graph Laplacian eigenvalues (ascending). Builds the symmetric weighted
 * Laplacian L = D − W over `n` active nodes and diagonalizes it with cyclic
 * Jacobi rotations — exact and stable for the tiny n ≤ 8 matrices here.
 */
export function laplacianEigenvalues(edges: Edge[], n: number): number[] {
  if (n <= 0) return [];
  const L = new Float64Array(n * n);
  for (const e of edges) {
    L[e.i * n + e.j] -= e.w;
    L[e.j * n + e.i] -= e.w;
    L[e.i * n + e.i] += e.w;
    L[e.j * n + e.j] += e.w;
  }
  return jacobiEigenvalues(L, n);
}

/**
 * Cyclic Jacobi eigenvalue iteration for a symmetric n×n matrix (row-major,
 * mutated on a copy). Returns eigenvalues ascending. n ≤ 8 so this converges
 * in a handful of sweeps.
 */
export function jacobiEigenvalues(mat: Float64Array, n: number): number[] {
  const a = mat.slice();
  const maxSweeps = 40;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // Sum of squared off-diagonal terms; stop when negligible.
    let off = 0;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    if (off < 1e-14) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-18) continue;
        const app = a[p * n + p];
        const aqq = a[q * n + q];
        const theta = (aqq - app) / (2 * apq);
        const t =
          Math.sign(theta || 1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        // Rotate rows/cols p and q.
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p];
          const akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k];
          const aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
      }
    }
  }
  const eig: number[] = [];
  for (let i = 0; i < n; i++) eig.push(a[i * n + i]);
  eig.sort((x, y) => x - y);
  return eig;
}

/**
 * Map Laplacian eigenvalues to oscillator frequencies (Hz). Physically the
 * modes of a graph behave like the modes of a drum: frequency ∝ √λ. We
 * normalize by the largest √λ present so the spectrum always spans the
 * available range, then place each mode continuously (NON-pentatonic) between
 * fLow and fHigh on a log scale. The zero (DC) mode lands on the fundamental.
 */
export function eigenToFreqs(
  eigs: number[],
  fLow = 96,
  fHigh = 720,
): number[] {
  if (eigs.length === 0) return [];
  const sq = eigs.map((e) => Math.sqrt(Math.max(0, e)));
  const maxSq = Math.max(sq[sq.length - 1], 1e-6);
  const ratio = Math.log(fHigh / fLow);
  return sq.map((s) => fLow * Math.exp((s / maxSq) * ratio));
}
