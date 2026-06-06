/**
 * wfc.ts — Wave Function Collapse solver for musical grid composition
 *
 * Tile = scale degree in D-Dorian.
 * Adjacency constraints enforce harmonic voice-leading:
 *   horizontal (time) neighbours must share ≥1 tone class or move by step.
 *   vertical (pitch-row) neighbours must stay within a diatonic interval.
 *
 * References:
 *   Maxim Gumin, "Wave Function Collapse" (2016) — https://github.com/mxgmn/WaveFunctionCollapse
 *   Paul Merrell, "Model Synthesis" (2007) — the constraint-propagation precursor
 */

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Musical palette — D-Dorian ────────────────────────────────────────────────
// D E F G A B C  (scale degrees 0-6, MIDI relative to D2 = 38)
// We use two octaves for vertical spread: rows map to register.

export interface Tile {
  id: number;
  /** Scale degree 0-6 (D E F G A B C) */
  degree: number;
  /** Octave offset: 0 = lower, 1 = upper */
  octave: number;
  /** MIDI note number */
  midi: number;
  /** Display label */
  label: string;
  /** Hue (HSL) for colour-coding */
  hue: number;
}

// D2=38, E2=40, F2=41, G2=43, A2=45, B2=47, C3=48
const BASE_MIDI = 38;
const DORIAN_STEPS = [0, 2, 3, 5, 7, 9, 10]; // semitone offsets from D
const DEGREE_LABELS = ["D", "E", "F", "G", "A", "B", "C"];
// Hues chosen for visual legibility on dark bg
const DEGREE_HUES = [270, 210, 160, 80, 40, 320, 0]; // violet,blue,green,lime,amber,pink,red

export const TILES: Tile[] = [];
for (let oct = 0; oct < 2; oct++) {
  for (let deg = 0; deg < 7; deg++) {
    const id = oct * 7 + deg;
    TILES.push({
      id,
      degree: deg,
      octave: oct,
      midi: BASE_MIDI + oct * 12 + DORIAN_STEPS[deg],
      label: DEGREE_LABELS[deg] + (oct + 2).toString(),
      hue: DEGREE_HUES[deg],
    });
  }
}

export const NUM_TILES = TILES.length; // 14

// Grid dimensions exported for consumers
export const ROWS = 8;
export const COLS = 16;

// ── Tile weights (frequency of appearance) ───────────────────────────────────
// Root, fourth, fifth are more common; leading tones less so.
export const TILE_WEIGHTS: number[] = TILES.map((t) => {
  const base = [4, 2, 2, 3, 3, 2, 1][t.degree];
  // lower octave slightly preferred for gravity
  return base * (t.octave === 0 ? 1.3 : 1.0);
});

// ── Adjacency constraint builder ─────────────────────────────────────────────
/**
 * Returns a Set<number> of tile IDs allowed next to `tileId` in direction `dir`.
 * dir: "right" (time forward), "left" (time back), "up" (higher row), "down" (lower row)
 *
 * Rules:
 *   Horizontal: destination degree must be within ±2 diatonic steps, OR unison.
 *   Vertical (rows): same degree (different octave) OR root-fifth / third relationships.
 */
function buildAdjacency(): Map<number, Record<"right" | "left" | "up" | "down", Set<number>>> {
  const adj = new Map<number, Record<"right" | "left" | "up" | "down", Set<number>>>();

  for (const from of TILES) {
    const dirs: Record<"right" | "left" | "up" | "down", Set<number>> = {
      right: new Set(),
      left: new Set(),
      up: new Set(),
      down: new Set(),
    };

    for (const to of TILES) {
      const degDiff = Math.abs(to.degree - from.degree);
      // Circular wrap in scale (e.g. C→D is 1 step)
      const degStep = Math.min(degDiff, 7 - degDiff);

      // Horizontal: stepwise motion (±2 diatonic steps) or same degree in diff octave
      const horizontalOk =
        degStep <= 2 ||
        (from.degree === to.degree) ||
        // Allow leap to perfect 5th (deg 4) or 4th (deg 3) from root
        (from.degree === 0 && (to.degree === 4 || to.degree === 3)) ||
        (to.degree === 0 && (from.degree === 4 || from.degree === 3));

      if (horizontalOk) {
        dirs.right.add(to.id);
        dirs.left.add(to.id);
      }

      // Vertical: same degree across octaves always allowed;
      // also diatonic intervals of unison / 3rd / 4th / 5th
      const verticalOk =
        from.degree === to.degree ||
        degStep === 0 ||
        degStep === 2 || // third
        degStep === 3 || // fourth
        degStep === 4;   // fifth

      if (verticalOk) {
        dirs.up.add(to.id);
        dirs.down.add(to.id);
      }
    }

    adj.set(from.id, dirs);
  }
  return adj;
}

export const ADJACENCY = buildAdjacency();

// ── WFC Grid state ────────────────────────────────────────────────────────────

export type CellState =
  | { kind: "superposition"; candidates: Set<number> }
  | { kind: "collapsed"; tileId: number };

export interface WFCGrid {
  rows: number;
  cols: number;
  cells: CellState[][];
}

export function createGrid(rows: number, cols: number): WFCGrid {
  const cells: CellState[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      kind: "superposition" as const,
      candidates: new Set(TILES.map((t) => t.id)),
    }))
  );
  return { rows, cols, cells };
}

function entropy(candidates: Set<number>): number {
  // Shannon entropy with tile weights
  let total = 0;
  let sum = 0;
  for (const id of candidates) {
    total += TILE_WEIGHTS[id];
  }
  for (const id of candidates) {
    const p = TILE_WEIGHTS[id] / total;
    if (p > 0) sum -= p * Math.log2(p);
  }
  return sum;
}

/** Returns [row, col] of the cell with lowest entropy that isn't collapsed. */
function lowestEntropyCell(
  grid: WFCGrid,
  rng: () => number
): [number, number] | null {
  let minH = Infinity;
  let best: [number, number] | null = null;

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r][c];
      if (cell.kind === "collapsed") continue;
      const h = entropy(cell.candidates) + rng() * 0.001; // tie-break noise
      if (h < minH) {
        minH = h;
        best = [r, c];
      }
    }
  }
  return best;
}

/** Collapse a cell to a weighted-random tile from its candidate set. */
function collapseCell(
  grid: WFCGrid,
  r: number,
  c: number,
  rng: () => number
): number {
  const cell = grid.cells[r][c];
  if (cell.kind === "collapsed") return cell.tileId;

  const ids = [...cell.candidates];
  let total = 0;
  for (const id of ids) total += TILE_WEIGHTS[id];
  let roll = rng() * total;
  let chosen = ids[0];
  for (const id of ids) {
    roll -= TILE_WEIGHTS[id];
    if (roll <= 0) { chosen = id; break; }
  }

  grid.cells[r][c] = { kind: "collapsed", tileId: chosen };
  return chosen;
}

const DIRS: Array<{
  dr: number;
  dc: number;
  dir: "right" | "left" | "up" | "down";
  opp: "right" | "left" | "up" | "down";
}> = [
  { dr: 0, dc: 1, dir: "right", opp: "left" },
  { dr: 0, dc: -1, dir: "left", opp: "right" },
  { dr: -1, dc: 0, dir: "up", opp: "down" },
  { dr: 1, dc: 0, dir: "down", opp: "up" },
];

/**
 * Propagate arc-consistency from cell (r,c) via BFS.
 * Returns list of cells that were constrained: [[r,c], ...]
 */
export function propagate(
  grid: WFCGrid,
  startR: number,
  startC: number
): Array<[number, number]> {
  const changed: Array<[number, number]> = [];
  const queue: Array<[number, number]> = [[startR, startC]];
  const inQueue = new Set<number>();
  inQueue.add(startR * grid.cols + startC);

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    inQueue.delete(r * grid.cols + c);

    const srcCell = grid.cells[r][c];
    // Collect the allowed tiles from this cell's perspective
    const srcAllowed =
      srcCell.kind === "collapsed"
        ? new Set([srcCell.tileId])
        : srcCell.candidates;

    for (const { dr, dc, dir, opp } of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= grid.rows || nc < 0 || nc >= grid.cols) continue;

      const nbCell = grid.cells[nr][nc];
      if (nbCell.kind === "collapsed") continue;

      // Build the set of tiles the neighbor is allowed to be,
      // given what the source can be in direction `dir`
      const allowed = new Set<number>();
      for (const srcId of srcAllowed) {
        const adjSet = ADJACENCY.get(srcId)![dir];
        for (const tid of adjSet) allowed.add(tid);
      }

      // Also check from the neighbor's side back to source
      const newCandidates = new Set<number>();
      for (const nbId of nbCell.candidates) {
        if (!allowed.has(nbId)) continue;
        // Check that this nbId is compatible with at least one src tile
        const backAdj = ADJACENCY.get(nbId)![opp];
        let ok = false;
        for (const srcId of srcAllowed) {
          if (backAdj.has(srcId)) { ok = true; break; }
        }
        if (ok) newCandidates.add(nbId);
      }

      if (newCandidates.size < nbCell.candidates.size) {
        if (newCandidates.size === 0) {
          // Contradiction — restore with full set to avoid deadlock
          for (const id of TILES) nbCell.candidates.add(id.id);
        } else {
          nbCell.candidates = newCandidates;
        }
        changed.push([nr, nc]);
        const key = nr * grid.cols + nc;
        if (!inQueue.has(key)) {
          inQueue.add(key);
          queue.push([nr, nc]);
        }
      }
    }
  }
  return changed;
}

// ── Step-by-step solver (yields one collapse + propagation per call) ──────────

export interface CollapseEvent {
  /** The cell that was collapsed */
  collapsed: [number, number];
  tileId: number;
  /** Cells whose candidate sets changed due to propagation */
  constrained: Array<[number, number]>;
  /** true when grid is fully solved */
  done: boolean;
}

export function createSolver(
  grid: WFCGrid,
  rng: () => number
): () => CollapseEvent | null {
  return function stepSolver(): CollapseEvent | null {
    const target = lowestEntropyCell(grid, rng);
    if (!target) return null; // fully collapsed

    const [r, c] = target;
    const tileId = collapseCell(grid, r, c, rng);
    const constrained = propagate(grid, r, c);

    // Check if done
    let done = true;
    outer: for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (grid.cells[row][col].kind !== "collapsed") { done = false; break outer; }
      }
    }

    return { collapsed: [r, c], tileId, constrained, done };
  };
}
