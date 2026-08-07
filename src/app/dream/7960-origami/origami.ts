// ── 7960 · Origami — crease-pattern data model + fold math + flat-foldability ──
//
// Pure TypeScript. No three.js, no React, no DOM. This module owns:
//   1. The mesh tessellation of a square sheet (a grid whose cells fan out from
//      their centres, giving every interior grid vertex 8 symmetric crease
//      directions at 45° multiples — the natural stage for Kawasaki's theorem).
//   2. The crease pattern the player authors (each authorable edge is MOUNTAIN
//      or VALLEY or absent).
//   3. A DRIVEN fold: given a global fold parameter 0→1, rotate rigid panels
//      about their shared crease lines by mountain/valley signed dihedral angles
//      (a spanning-tree hinge fold — NOT a rigorous rigid-origami solve).
//   4. Per-interior-vertex flat-foldability: Kawasaki's alternating-angle-sum
//      theorem + Maekawa's mountain−valley = ±2 count. This drives consonance.
//
// References: Kawasaki's theorem, Maekawa's theorem, Miura-ori, Robert Lang's
// computational origami, Erik Demaine's folding work. See README.md.

/** MOUNTAIN folds toward the viewer (+1); VALLEY away (−1). */
export type MV = 1 | -1;

/** A crease pattern is just the assignment of MV to authorable edge keys. */
export type CreaseMap = Map<string, MV>;

/** Maximum dihedral a crease reaches at fold param = 1 (radians, ~118°).
 *  Kept below a full 180° flat fold so the folded form stays open + legible. */
export const MAX_FOLD = 2.06;

/** Sheet half-size in the flat plane (normalized units). */
export const SHEET_HALF = 0.5;

// ── edge keys ────────────────────────────────────────────────────────────────

export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

// ── mesh tessellation ─────────────────────────────────────────────────────────

export interface IncidentEdge {
  key: string;
  angle: number; // direction from the vertex to the far endpoint, radians
}

export interface Mesh {
  N: number;
  vCount: number;
  pos: Float32Array; // 2D flat positions, length vCount*2, in [-0.5, 0.5]
  tris: number[][]; // each triangle: [va, vb, vc]
  triEdgeKeys: string[][]; // per-triangle, its 3 edge keys
  edgeTris: Map<string, number[]>; // edge key -> incident triangle ids
  edgeVerts: Map<string, [number, number]>; // edge key -> [vidA, vidB]
  authorable: string[]; // interior edges (exactly 2 triangles) — creasable
  interiorVids: number[]; // interior grid vertices (Kawasaki voices)
  vidIJ: Map<number, [number, number]>; // interior vid -> (i, j)
  incident: Map<number, IncidentEdge[]>; // interior vid -> its incident authorable edges
}

/** Build the fixed tessellation for an N×N-cell sheet. Deterministic in N. */
export function makeMesh(N: number): Mesh {
  const gStride = N + 1;
  const gCount = gStride * gStride;
  const g = (i: number, j: number) => j * gStride + i;
  const c = (i: number, j: number) => gCount + j * N + i; // cell (i,j) centre
  const vCount = gCount + N * N;

  const pos = new Float32Array(vCount * 2);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const v = g(i, j);
      pos[v * 2] = i / N - 0.5;
      pos[v * 2 + 1] = j / N - 0.5;
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v = c(i, j);
      pos[v * 2] = (i + 0.5) / N - 0.5;
      pos[v * 2 + 1] = (j + 0.5) / N - 0.5;
    }
  }

  const tris: number[][] = [];
  const triEdgeKeys: string[][] = [];
  const edgeTris = new Map<string, number[]>();
  const edgeVerts = new Map<string, [number, number]>();

  const addTri = (a: number, b: number, cc: number) => {
    const id = tris.length;
    tris.push([a, b, cc]);
    const keys = [edgeKey(a, b), edgeKey(b, cc), edgeKey(cc, a)];
    triEdgeKeys.push(keys);
    const pairs: [number, number][] = [
      [a, b],
      [b, cc],
      [cc, a],
    ];
    for (let k = 0; k < 3; k++) {
      const key = keys[k];
      const list = edgeTris.get(key);
      if (list) list.push(id);
      else edgeTris.set(key, [id]);
      if (!edgeVerts.has(key)) edgeVerts.set(key, pairs[k] as [number, number]);
    }
  };

  // Each cell fans into 4 triangles from its centre to its 4 corners.
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const ctr = c(i, j);
      const c00 = g(i, j);
      const c10 = g(i + 1, j);
      const c11 = g(i + 1, j + 1);
      const c01 = g(i, j + 1);
      addTri(ctr, c00, c10);
      addTri(ctr, c10, c11);
      addTri(ctr, c11, c01);
      addTri(ctr, c01, c00);
    }
  }

  const authorable: string[] = [];
  for (const [key, list] of edgeTris) {
    if (list.length === 2) authorable.push(key);
  }

  // Interior grid vertices + their incident authorable edges (8 directions).
  const interiorVids: number[] = [];
  const vidIJ = new Map<number, [number, number]>();
  const incident = new Map<number, IncidentEdge[]>();
  const angleOf = (from: number, to: number) => {
    const dx = pos[to * 2] - pos[from * 2];
    const dy = pos[to * 2 + 1] - pos[from * 2 + 1];
    return Math.atan2(dy, dx);
  };
  for (let j = 1; j < N; j++) {
    for (let i = 1; i < N; i++) {
      const v = g(i, j);
      interiorVids.push(v);
      vidIJ.set(v, [i, j]);
      const neighbours = [
        g(i + 1, j),
        g(i - 1, j),
        g(i, j + 1),
        g(i, j - 1),
        c(i, j),
        c(i - 1, j),
        c(i, j - 1),
        c(i - 1, j - 1),
      ];
      const inc: IncidentEdge[] = [];
      for (const nb of neighbours) {
        const key = edgeKey(v, nb);
        if (edgeTris.get(key)?.length === 2) {
          inc.push({ key, angle: angleOf(v, nb) });
        }
      }
      incident.set(v, inc);
    }
  }

  return {
    N,
    vCount,
    pos,
    tris,
    triEdgeKeys,
    edgeTris,
    edgeVerts,
    authorable,
    interiorVids,
    vidIJ,
    incident,
  };
}

// ── flat-foldability (Kawasaki + Maekawa) ─────────────────────────────────────

export interface VertexEval {
  vid: number;
  i: number;
  j: number;
  nx: number; // 0..1 across the sheet (for pan / voice placement)
  ny: number;
  creaseCount: number;
  kawasakiError: number; // 0 = flat-foldable, 1 = worst
  maekawaDiff: number; // |mountains − valleys|
  maekawaOk: boolean; // === 2
  consonance: number; // 1 = pure, 0 = clash
  active: boolean; // ≥ 2 creases → sounds
}

const TAU = Math.PI * 2;

/** Evaluate every interior vertex against Kawasaki's alternating-sum theorem
 *  and Maekawa's mountain−valley count. */
export function evalVertices(mesh: Mesh, creases: CreaseMap): VertexEval[] {
  const out: VertexEval[] = [];
  for (const vid of mesh.interiorVids) {
    const [i, j] = mesh.vidIJ.get(vid)!;
    const inc = mesh.incident.get(vid) ?? [];
    const creased = inc.filter((e) => creases.has(e.key));
    const k = creased.length;

    let mountains = 0;
    let valleys = 0;
    for (const e of creased) {
      if (creases.get(e.key) === 1) mountains++;
      else valleys++;
    }
    const maekawaDiff = Math.abs(mountains - valleys);
    const maekawaOk = maekawaDiff === 2;

    let kawasakiError = 1;
    if (k >= 2 && k % 2 === 0) {
      const angles = creased.map((e) => e.angle).sort((a, b) => a - b);
      let alt = 0;
      for (let s = 0; s < k; s++) {
        let sector = angles[(s + 1) % k] - angles[s];
        if (sector < 0) sector += TAU;
        alt += (s % 2 === 0 ? 1 : -1) * sector;
      }
      // Perfect Kawasaki ⇒ alt = 0. Normalize by π (a half-turn of imbalance).
      kawasakiError = Math.min(1, Math.abs(alt) / Math.PI);
    } else if (k >= 2) {
      // Odd crease count can never flatten (Maekawa needs even count too).
      kawasakiError = 1;
    }

    const active = k >= 2;
    // Consonance is Kawasaki-dominant; Maekawa adds a small purity bonus.
    const consonance = active
      ? Math.max(0, 1 - kawasakiError) * (maekawaOk ? 1 : 0.82)
      : 0;

    out.push({
      vid,
      i,
      j,
      nx: i / mesh.N,
      ny: j / mesh.N,
      creaseCount: k,
      kawasakiError,
      maekawaDiff,
      maekawaOk,
      consonance,
      active,
    });
  }
  return out;
}

// ── driven fold (spanning-tree hinge rotation) ────────────────────────────────
//
// An affine transform is stored as a 3×3 rotation `r` (row-major) plus a
// translation `t`. apply(T, p) = r·p + t.

interface Affine {
  r: [number, number, number, number, number, number, number, number, number];
  t: [number, number, number];
}

const IDENTITY: Affine = {
  r: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  t: [0, 0, 0],
};

function apply(T: Affine, x: number, y: number, z: number): [number, number, number] {
  const { r, t } = T;
  return [
    r[0] * x + r[1] * y + r[2] * z + t[0],
    r[3] * x + r[4] * y + r[5] * z + t[1],
    r[6] * x + r[7] * y + r[8] * z + t[2],
  ];
}

// C = A ∘ B  (apply B first, then A).
function compose(A: Affine, B: Affine): Affine {
  const a = A.r;
  const b = B.r;
  const r: Affine["r"] = [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
  const bt = B.t;
  const t: [number, number, number] = [
    a[0] * bt[0] + a[1] * bt[1] + a[2] * bt[2] + A.t[0],
    a[3] * bt[0] + a[4] * bt[1] + a[5] * bt[2] + A.t[1],
    a[6] * bt[0] + a[7] * bt[1] + a[8] * bt[2] + A.t[2],
  ];
  return { r, t };
}

// Rotation by `angle` about the line through point P with unit direction u
// (Rodrigues), expressed as an affine that fixes P.
function rotationAboutLine(
  P: [number, number, number],
  u: [number, number, number],
  angle: number,
): Affine {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const [ux, uy, uz] = u;
  const r: Affine["r"] = [
    c + ux * ux * t,
    ux * uy * t - uz * s,
    ux * uz * t + uy * s,
    uy * ux * t + uz * s,
    c + uy * uy * t,
    uy * uz * t - ux * s,
    uz * ux * t - uy * s,
    uz * uy * t + ux * s,
    c + uz * uz * t,
  ];
  // t = P − R·P so that P maps to itself.
  const rp: [number, number, number] = [
    r[0] * P[0] + r[1] * P[1] + r[2] * P[2],
    r[3] * P[0] + r[4] * P[1] + r[5] * P[2],
    r[6] * P[0] + r[7] * P[1] + r[8] * P[2],
  ];
  return { r, t: [P[0] - rp[0], P[1] - rp[1], P[2] - rp[2]] };
}

// Union-find for grouping triangles into rigid panels.
function makeDSU(n: number) {
  const parent = new Array(n).fill(0).map((_, k) => k);
  const size = new Array(n).fill(1);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const nx = parent[x];
      parent[x] = root;
      x = nx;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (size[ra] < size[rb]) {
      parent[ra] = rb;
      size[rb] += size[ra];
    } else {
      parent[rb] = ra;
      size[ra] += size[rb];
    }
  };
  return { find, union, size };
}

export interface FoldResult {
  /** Flat triangle-soup positions in 3D, length tris*9 (x,y,z per corner). */
  positions: Float32Array;
  /** Per-triangle flat-Y (for a height ramp), length tris. */
  heights: Float32Array;
  panelCount: number;
}

/**
 * Fold the sheet by rotating rigid panels about their shared crease lines.
 * Panels are the connected components of triangles NOT separated by a crease;
 * a spanning tree of panel adjacencies (crossing creases) fixes each panel's
 * hinge rotation, so the sheet stays connected along the tree and only gaps at
 * non-flat-foldable vertices — an honest, non-rigorous "driven" fold.
 */
export function foldMesh(
  mesh: Mesh,
  creases: CreaseMap,
  param: number,
): FoldResult {
  const nTris = mesh.tris.length;
  const dsu = makeDSU(nTris);

  // Merge triangles sharing a non-crease interior edge.
  for (const key of mesh.authorable) {
    if (creases.has(key)) continue;
    const list = mesh.edgeTris.get(key)!;
    dsu.union(list[0], list[1]);
  }

  // Panel adjacency graph across crease edges.
  interface Adj {
    panel: number;
    key: string;
    mv: MV;
  }
  const panelAdj = new Map<number, Adj[]>();
  const ensure = (p: number) => {
    let a = panelAdj.get(p);
    if (!a) {
      a = [];
      panelAdj.set(p, a);
    }
    return a;
  };
  for (const key of mesh.authorable) {
    const mv = creases.get(key);
    if (mv === undefined) continue;
    const list = mesh.edgeTris.get(key)!;
    const pa = dsu.find(list[0]);
    const pb = dsu.find(list[1]);
    if (pa === pb) continue; // crease inside one panel (loop) — ignore for tree
    ensure(pa).push({ panel: pb, key, mv });
    ensure(pb).push({ panel: pa, key, mv });
  }

  // Root = the largest panel (stays flat, keeps the form centred).
  const roots = new Set<number>();
  for (let t = 0; t < nTris; t++) roots.add(dsu.find(t));
  let root = -1;
  let best = -1;
  for (const rr of roots) {
    if (dsu.size[rr] > best) {
      best = dsu.size[rr];
      root = rr;
    }
  }

  // BFS the whole panel graph (across all root components) assigning transforms.
  const transform = new Map<number, Affine>();
  const angleFold = param * MAX_FOLD;
  const order = [root, ...[...roots].filter((r) => r !== root)];
  for (const start of order) {
    if (transform.has(start)) continue;
    transform.set(start, IDENTITY);
    const queue = [start];
    while (queue.length) {
      const p = queue.shift()!;
      const T = transform.get(p)!;
      for (const adj of panelAdj.get(p) ?? []) {
        if (transform.has(adj.panel)) continue;
        const [va, vb] = mesh.edgeVerts.get(adj.key)!;
        const A = apply(T, mesh.pos[va * 2], mesh.pos[va * 2 + 1], 0);
        const B = apply(T, mesh.pos[vb * 2], mesh.pos[vb * 2 + 1], 0);
        let ux = B[0] - A[0];
        let uy = B[1] - A[1];
        let uz = B[2] - A[2];
        const len = Math.hypot(ux, uy, uz) || 1;
        ux /= len;
        uy /= len;
        uz /= len;
        const R = rotationAboutLine(A, [ux, uy, uz], adj.mv * angleFold);
        transform.set(adj.panel, compose(R, T));
        queue.push(adj.panel);
      }
    }
  }

  const positions = new Float32Array(nTris * 9);
  const heights = new Float32Array(nTris);
  for (let t = 0; t < nTris; t++) {
    const T = transform.get(dsu.find(t)) ?? IDENTITY;
    const [a, b, cc] = mesh.tris[t];
    const verts = [a, b, cc];
    let hy = 0;
    for (let k = 0; k < 3; k++) {
      const v = verts[k];
      const fx = mesh.pos[v * 2];
      const fy = mesh.pos[v * 2 + 1];
      const [x, y, z] = apply(T, fx, fy, 0);
      positions[t * 9 + k * 3] = x;
      positions[t * 9 + k * 3 + 1] = y;
      positions[t * 9 + k * 3 + 2] = z;
      hy += fy;
    }
    heights[t] = hy / 3 + 0.5; // 0..1 across the flat sheet
  }

  return { positions, heights, panelCount: roots.size };
}

// ── starter patterns ──────────────────────────────────────────────────────────

export type StarterId = "miura" | "fan" | "bird" | "clear";

/** Build one of the one-tap starter crease patterns for a given N. */
export function makeStarter(mesh: Mesh, id: StarterId): CreaseMap {
  const N = mesh.N;
  const map: CreaseMap = new Map();
  const g = (i: number, j: number) => j * (N + 1) + i;
  const centre = (i: number, j: number) => (N + 1) * (N + 1) + j * N + i;
  const put = (a: number, b: number, mv: MV) => {
    const key = edgeKey(a, b);
    if (mesh.edgeTris.get(key)?.length === 2) map.set(key, mv);
  };

  if (id === "clear") return map;

  if (id === "miura") {
    // A box-pleat-style tessellation: alternating mountain/valley horizontals
    // meeting vertical creases — every interior 4-valent vertex is Kawasaki-flat.
    for (let j = 1; j < N; j++) {
      const mv: MV = j % 2 === 0 ? 1 : -1;
      for (let i = 0; i < N; i++) put(g(i, j), g(i + 1, j), mv);
    }
    for (let i = 2; i < N - 1; i += 2) {
      for (let j = 0; j < N; j++) {
        const mv: MV = (i + j) % 2 === 0 ? 1 : -1;
        put(g(i, j), g(i, j + 1), mv);
      }
    }
    return map;
  }

  if (id === "fan") {
    // A radial fan about the sheet centre: alternating creases at 45° steps —
    // 8 equal sectors, Kawasaki-perfect. Uses both axis + spoke directions.
    const ci = Math.floor(N / 2);
    const cj = Math.floor(N / 2);
    const spokes: [number, MV][] = [
      [g(ci + 1, cj), 1],
      [centre(ci, cj), -1],
      [g(ci, cj + 1), 1],
      [centre(ci - 1, cj), -1],
      [g(ci - 1, cj), 1],
      [centre(ci - 1, cj - 1), -1],
      [g(ci, cj - 1), 1],
      [centre(ci, cj - 1), -1],
    ];
    for (const [nb, mv] of spokes) put(g(ci, cj), nb, mv);
    return map;
  }

  // "bird" — a bird-base-ish cluster of 4-valent vertices along the centre,
  // each with two axis creases + two spokes tuned to stay near Kawasaki-flat.
  const ci = Math.floor(N / 2);
  const cj = Math.floor(N / 2);
  const verts: [number, number][] = [
    [ci, cj],
    [ci - 1, cj - 1],
    [ci + 1, cj + 1],
  ];
  for (const [i, j] of verts) {
    put(g(i, j), g(i + 1, j), 1);
    put(g(i, j), g(i - 1, j), 1);
    put(g(i, j), centre(i, j), -1);
    put(g(i, j), centre(i - 1, j - 1), -1);
  }
  return map;
}
