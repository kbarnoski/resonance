/**
 * membrane.ts — a 2-D elastic sheet of point masses solved with Verlet
 * integration + position-based distance constraints (Jakobsen, Advanced
 * Character Physics, 2001).
 *
 * Velocity is implied by (x - prevX); each frame we relax structural and
 * shear constraints a few times so the cloth holds its shape, then pin the
 * top edge so the silk hangs and billows. The CPU path here is also the
 * reference the WebGPU compute path mirrors, and the source the audio engine
 * reads tension from. No browser APIs touched — pure math, safe to import
 * anywhere.
 */

export type Membrane = {
  cols: number;
  rows: number;
  /** Current positions, interleaved x,y. Length = cols*rows*2. */
  pos: Float32Array;
  /** Previous positions (for verlet velocity). */
  prev: Float32Array;
  /** 1 = free, 0 = pinned. Length = cols*rows. */
  free: Float32Array;
  /** Rest length between horizontally/vertically adjacent nodes. */
  restX: number;
  restY: number;
  /** Logical world size the grid spans (rest layout), in px-ish units. */
  width: number;
  height: number;
  /** Grab handles, keyed by pointer id. */
  grabs: Map<number, { node: number; x: number; y: number }>;
};

export type MembraneConfig = {
  cols: number;
  rows: number;
  width: number;
  height: number;
};

export function makeMembrane(cfg: MembraneConfig): Membrane {
  const { cols, rows, width, height } = cfg;
  const restX = width / (cols - 1);
  const restY = height / (rows - 1);
  const n = cols * rows;
  const pos = new Float32Array(n * 2);
  const prev = new Float32Array(n * 2);
  const free = new Float32Array(n);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * restX;
      const y = r * restY;
      pos[i * 2] = x;
      pos[i * 2 + 1] = y;
      prev[i * 2] = x;
      prev[i * 2 + 1] = y;
      // Pin the top edge so the rest of the sheet hangs like silk on a rail.
      free[i] = r === 0 ? 0 : 1;
    }
  }

  return {
    cols,
    rows,
    pos,
    prev,
    free,
    restX,
    restY,
    width,
    height,
    grabs: new Map(),
  };
}

/** Nearest node index to a world-space point. */
export function nearestNode(m: Membrane, x: number, y: number): number {
  const c = Math.max(0, Math.min(m.cols - 1, Math.round(x / m.restX)));
  const r = Math.max(0, Math.min(m.rows - 1, Math.round(y / m.restY)));
  return r * m.cols + c;
}

/**
 * One full simulation step: verlet integration + several relaxation passes.
 * `gravity` gently pulls the silk down so it billows; `damp` keeps it calm.
 */
export function stepMembrane(
  m: Membrane,
  dt: number,
  gravity: number,
  damp: number,
  iterations: number,
): void {
  const { pos, prev, free, cols, rows } = m;
  const n = cols * rows;
  const dt2 = dt * dt;

  // Verlet integration.
  for (let i = 0; i < n; i++) {
    if (free[i] === 0) continue;
    const ix = i * 2;
    const iy = ix + 1;
    const x = pos[ix];
    const y = pos[iy];
    const vx = (x - prev[ix]) * damp;
    const vy = (y - prev[iy]) * damp;
    prev[ix] = x;
    prev[iy] = y;
    pos[ix] = x + vx;
    pos[iy] = y + vy + gravity * dt2;
  }

  // Held nodes snap to the pointer position (soft, over iterations below).
  for (const g of m.grabs.values()) {
    const ix = g.node * 2;
    pos[ix] = g.x;
    pos[ix + 1] = g.y;
  }

  // Relaxation: satisfy distance constraints repeatedly.
  for (let k = 0; k < iterations; k++) {
    // Structural springs (horizontal + vertical neighbours).
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * cols + c;
        if (c + 1 < cols) solveLink(m, a, a + 1, m.restX);
        if (r + 1 < rows) solveLink(m, a, a + cols, m.restY);
      }
    }
    // Shear springs (diagonals) — give the silk body so it doesn't fold flat.
    const restDiag = Math.hypot(m.restX, m.restY);
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c + 1 < cols; c++) {
        const a = r * cols + c;
        solveLink(m, a, a + cols + 1, restDiag);
        solveLink(m, a + 1, a + cols, restDiag);
      }
    }
    // Re-pin held nodes each pass so the grab wins.
    for (const g of m.grabs.values()) {
      const ix = g.node * 2;
      pos[ix] = g.x;
      pos[ix + 1] = g.y;
    }
  }
}

function solveLink(m: Membrane, a: number, b: number, rest: number): void {
  const { pos, free } = m;
  const ax = a * 2;
  const bx = b * 2;
  let dx = pos[bx] - pos[ax];
  let dy = pos[bx + 1] - pos[ax + 1];
  const d = Math.hypot(dx, dy) || 1e-6;
  const diff = (d - rest) / d;
  // Slightly soft so the sheet feels like silk, not a steel net.
  const k = 0.5;
  const fa = free[a];
  const fb = free[b];
  const wsum = fa + fb;
  if (wsum === 0) return;
  dx *= diff * k;
  dy *= diff * k;
  const sa = fa / wsum;
  const sb = fb / wsum;
  pos[ax] += dx * sa * 2;
  pos[ax + 1] += dy * sa * 2;
  pos[bx] -= dx * sb * 2;
  pos[bx + 1] -= dy * sb * 2;
}

/**
 * Average stretch (fractional extension past rest length) over a column band,
 * clamped to [0,1]-ish. This is the control signal a voice listens to: 0 = the
 * silk hangs slack, higher = the child has pulled that region taut.
 */
export function regionTension(
  m: Membrane,
  colStart: number,
  colEnd: number,
): number {
  const { pos, cols, rows, restX } = m;
  let sum = 0;
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = colStart; c < colEnd - 1 && c + 1 < cols; c++) {
      const a = (r * cols + c) * 2;
      const b = (r * cols + c + 1) * 2;
      const d = Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1]);
      const stretch = (d - restX) / restX;
      sum += Math.max(0, stretch);
      count++;
    }
  }
  if (count === 0) return 0;
  // Map raw stretch onto a musically useful range.
  return Math.min(1, (sum / count) * 2.2);
}
