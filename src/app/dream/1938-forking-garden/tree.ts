// Forking Garden — the version-tree data model + pure helpers.
//
// A composition is a TREE of nodes. Each node carries one short musical
// PHRASE (3–6 notes as scale-degree indices in a mode). A cursor points at the
// "current" node. Committing a phrase always creates a CHILD of the cursor and
// moves the cursor onto it; if the cursor already had children the new child is
// a FORK — a divergent branch. Nothing is ever deleted (Borges: every outcome
// coexists). Deterministic only: seeded RNG + performance.now(), never
// Math.random / Date.

/** Deterministic mulberry32 PRNG — the ONLY source of randomness here. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** D Dorian (NON-pentatonic, hard rule): D E F G A B C — 7 modal degrees.
 *  Semitone offsets from the tonic D. */
export const DORIAN_SEMITONES = [0, 2, 3, 5, 7, 9, 10] as const;

/** One note in a phrase: a scale-degree index (0..6) + octave offset. */
export interface PhraseNote {
  deg: number;
  oct: number;
}

export interface TreeNode {
  id: number;
  parent: number | null;
  children: number[];
  phrase: PhraseNote[];
  depth: number;
}

export interface Tree {
  nodes: Map<number, TreeNode>;
  root: number;
  nextId: number;
  /** Bumped on every structural edit so consumers can cheaply detect change. */
  version: number;
}

export function createTree(): Tree {
  const root: TreeNode = {
    id: 0,
    parent: null,
    children: [],
    // A quiet root gesture: tonic → third → fifth (all consonant).
    phrase: [
      { deg: 0, oct: 0 },
      { deg: 2, oct: 0 },
      { deg: 4, oct: 0 },
    ],
    depth: 0,
  };
  const nodes = new Map<number, TreeNode>();
  nodes.set(0, root);
  return { nodes, root: 0, nextId: 1, version: 1 };
}

/** Commit a phrase as a new child of `parentId`; returns the new node id. */
export function addChild(
  tree: Tree,
  parentId: number,
  phrase: PhraseNote[],
): number {
  const parent = tree.nodes.get(parentId);
  if (!parent) return parentId;
  const id = tree.nextId++;
  const node: TreeNode = {
    id,
    parent: parentId,
    children: [],
    phrase: phrase.length ? phrase : [{ deg: 0, oct: 0 }],
    depth: parent.depth + 1,
  };
  tree.nodes.set(id, node);
  parent.children.push(id);
  tree.version++;
  return id;
}

/** Node ids from root down to `id`, inclusive. */
export function pathToRoot(tree: Tree, id: number): number[] {
  const out: number[] = [];
  let cur: number | null = id;
  while (cur !== null) {
    out.push(cur);
    const n: TreeNode | undefined = tree.nodes.get(cur);
    cur = n ? n.parent : null;
  }
  return out.reverse();
}

/** The full root→`id` phrase, flattened — this is what one voice plays. */
export function pathNotes(tree: Tree, id: number): PhraseNote[] {
  const ids = pathToRoot(tree, id);
  const out: PhraseNote[] = [];
  for (const nid of ids) {
    const n = tree.nodes.get(nid);
    if (n) out.push(...n.phrase);
  }
  return out;
}

export function isLeaf(tree: Tree, id: number): boolean {
  const n = tree.nodes.get(id);
  return !!n && n.children.length === 0;
}

export function leaves(tree: Tree): number[] {
  const out: number[] = [];
  for (const n of tree.nodes.values()) if (n.children.length === 0) out.push(n.id);
  return out;
}

/** Undirected BFS distances (in edges) from `from` to every node. */
export function distancesFrom(tree: Tree, from: number): Map<number, number> {
  const dist = new Map<number, number>();
  const queue: number[] = [from];
  dist.set(from, 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const d = dist.get(id)!;
    const n = tree.nodes.get(id);
    if (!n) continue;
    const neighbours: number[] = [...n.children];
    if (n.parent !== null) neighbours.push(n.parent);
    for (const nb of neighbours) {
      if (!dist.has(nb)) {
        dist.set(nb, d + 1);
        queue.push(nb);
      }
    }
  }
  return dist;
}

/** The `k` leaves nearest the cursor (tree distance), nearest first. Bounds
 *  how many alternate futures sound at once so the garden never turns to mud. */
export function nearestLeaves(tree: Tree, from: number, k: number): number[] {
  const dist = distancesFrom(tree, from);
  const ls = leaves(tree)
    .map((id) => ({ id, d: dist.get(id) ?? Infinity }))
    .sort((a, b) => a.d - b.d || a.id - b.id);
  return ls.slice(0, k).map((x) => x.id);
}

// ---- Cursor navigation -----------------------------------------------------

export function navParent(tree: Tree, id: number): number {
  const n = tree.nodes.get(id);
  return n && n.parent !== null ? n.parent : id;
}

export function navChild(tree: Tree, id: number): number {
  const n = tree.nodes.get(id);
  if (!n || n.children.length === 0) return id;
  // Steer toward the middle child (visually "straight ahead").
  return n.children[(n.children.length - 1) >> 1];
}

export function navSibling(tree: Tree, id: number, dir: 1 | -1): number {
  const n = tree.nodes.get(id);
  if (!n || n.parent === null) return id;
  const p = tree.nodes.get(n.parent);
  if (!p) return id;
  const sibs = p.children;
  const i = sibs.indexOf(id);
  if (i === -1 || sibs.length < 2) return id;
  const j = (i + dir + sibs.length) % sibs.length;
  return sibs[j];
}

// ---- Layout (river-delta, left→right) --------------------------------------

export interface Pt {
  x: number;
  y: number;
}

/** River-delta layout: depth → x, leaf spread → y (internal nodes centre on
 *  their descendant leaves). Fills the given box with `pad` margin. */
export function layoutTree(
  tree: Tree,
  w: number,
  h: number,
  pad: number,
): Map<number, Pt> {
  // In-order leaf sequence gives the vertical ordering.
  const order: number[] = [];
  let maxDepth = 0;
  const walk = (id: number) => {
    const n = tree.nodes.get(id);
    if (!n) return;
    if (n.depth > maxDepth) maxDepth = n.depth;
    if (n.children.length === 0) {
      order.push(id);
      return;
    }
    for (const c of n.children) walk(c);
  };
  walk(tree.root);

  const yFor = new Map<number, number>();
  const n = order.length;
  const top = pad;
  const span = Math.max(1, h - 2 * pad);
  order.forEach((id, i) => {
    yFor.set(id, n <= 1 ? h / 2 : top + span * (i / (n - 1)));
  });

  const levelW = (w - 2 * pad) / Math.max(1, maxDepth);
  const pos = new Map<number, Pt>();
  const place = (id: number): number => {
    const node = tree.nodes.get(id);
    if (!node) return h / 2;
    let y: number;
    if (node.children.length === 0) {
      y = yFor.get(id) ?? h / 2;
    } else {
      let sum = 0;
      for (const c of node.children) sum += place(c);
      y = sum / node.children.length;
    }
    pos.set(id, { x: pad + node.depth * levelW, y });
    return y;
  };
  place(tree.root);
  return pos;
}
