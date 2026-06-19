// Verlet mass-spring membrane (soft-body "trampoline") + bouncing balls.
//
// Pure simulation module — NO browser globals touched here.
// References:
//   - Thomas Jakobsen, "Advanced Character Physics" (GDC 2001) — Verlet
//     integration + Jakobsen-style constraint relaxation.
//   - Xavier Provot (1995) — mass-spring cloth (structural + shear springs).
//   - JellyCar Worlds / "Toolkit for Verlet Motion" (2026) — soft-body lineage.

export interface Node {
  x: number;
  y: number;
  px: number; // previous position (Verlet)
  py: number;
  pinned: boolean;
}

export interface Constraint {
  a: number; // node index
  b: number; // node index
  rest: number; // rest length
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  r: number;
  colorIdx: number;
  age: number; // seconds alive
  fading: boolean;
  squash: number; // 0..1 visual squash from last impact
  prevBelow: boolean; // was the ball below the sheet last step (for contact detect)
}

export interface Membrane {
  cols: number;
  rows: number;
  nodes: Node[];
  constraints: Constraint[];
  left: number;
  top: number;
  cellW: number;
  cellH: number;
  // resting Y of each column's lowest interior row, for ripple readout
}

export interface Impact {
  x: number;
  y: number;
  energy: number; // 0..1-ish, drives loudness
  nx: number; // normalized 0..1 horizontal position on sheet (pitch)
  colorIdx: number;
}

export const REST_GRAVITY = 900; // px/s^2 for balls
const SHEET_GRAVITY = 140; // gentle sag on the sheet itself
const STIFFNESS_ITERS = 4; // Jakobsen relaxation passes per frame
const DAMPING = 0.985; // velocity damping for the sheet (Verlet implicit)

export function makeMembrane(
  width: number,
  height: number,
  cols: number,
  rows: number,
): Membrane {
  const marginX = width * 0.06;
  const sheetW = width - marginX * 2;
  const top = height * 0.46;
  const sheetH = height * 0.42;
  const cellW = sheetW / (cols - 1);
  const cellH = sheetH / (rows - 1);
  const left = marginX;

  const nodes: Node[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = left + c * cellW;
      const y = top + r * cellH;
      // Pin the entire outer frame (edge of trampoline).
      const pinned =
        c === 0 || c === cols - 1 || r === 0 || r === rows - 1;
      nodes.push({ x, y, px: x, py: y, pinned });
    }
  }

  const idx = (c: number, r: number) => r * cols + c;
  const constraints: Constraint[] = [];
  const add = (a: number, b: number) => {
    const dx = nodes[a].x - nodes[b].x;
    const dy = nodes[a].y - nodes[b].y;
    constraints.push({ a, b, rest: Math.hypot(dx, dy) });
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // structural (Provot): right + down
      if (c < cols - 1) add(idx(c, r), idx(c + 1, r));
      if (r < rows - 1) add(idx(c, r), idx(c, r + 1));
      // shear: both diagonals
      if (c < cols - 1 && r < rows - 1) {
        add(idx(c, r), idx(c + 1, r + 1));
        add(idx(c + 1, r), idx(c, r + 1));
      }
    }
  }

  return { cols, rows, nodes, constraints, left, top, cellW, cellH };
}

// One Verlet integration step for the sheet.
function integrateSheet(m: Membrane, dt: number): void {
  const g = SHEET_GRAVITY * dt * dt;
  for (const n of m.nodes) {
    if (n.pinned) continue;
    const vx = (n.x - n.px) * DAMPING;
    const vy = (n.y - n.py) * DAMPING;
    n.px = n.x;
    n.py = n.y;
    n.x += vx;
    n.y += vy + g;
  }
}

function relaxConstraints(m: Membrane): void {
  for (let it = 0; it < STIFFNESS_ITERS; it++) {
    for (const con of m.constraints) {
      const na = m.nodes[con.a];
      const nb = m.nodes[con.b];
      let dx = nb.x - na.x;
      let dy = nb.y - na.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const diff = (dist - con.rest) / dist;
      // normalize correction
      dx *= 0.5 * diff;
      dy *= 0.5 * diff;
      if (!na.pinned) {
        na.x += dx;
        na.y += dy;
      }
      if (!nb.pinned) {
        nb.x -= dx;
        nb.y -= dy;
      }
    }
  }
}

// Find the nearest interior node to a point.
function nearestNode(m: Membrane, x: number, y: number): number {
  const c = Math.round((x - m.left) / m.cellW);
  const r = Math.round((y - m.top) / m.cellH);
  const cc = Math.max(1, Math.min(m.cols - 2, c));
  const rr = Math.max(1, Math.min(m.rows - 2, r));
  return rr * m.cols + cc;
}

// Pull a small region of the sheet toward (x,y) — used for finger drag.
export function pokeMembrane(
  m: Membrane,
  x: number,
  y: number,
  strength: number,
): void {
  const ci = Math.round((x - m.left) / m.cellW);
  const ri = Math.round((y - m.top) / m.cellH);
  const radius = 2;
  for (let r = ri - radius; r <= ri + radius; r++) {
    for (let c = ci - radius; c <= ci + radius; c++) {
      if (c <= 0 || c >= m.cols - 1 || r <= 0 || r >= m.rows - 1) continue;
      const n = m.nodes[r * m.cols + c];
      const d = Math.hypot(c - ci, r - ri);
      const w = Math.max(0, 1 - d / (radius + 1));
      n.x += (x - n.x) * w * 0.5 * strength;
      n.y += (y - n.y) * w * 0.5 * strength;
    }
  }
}

// Sample sheet height (y) at a horizontal x by interpolating the lowest
// sagging interior row — used to drive the always-on pad from the ripple.
export function sheetActivity(m: Membrane): number {
  // average vertical displacement of interior nodes from their rest grid.
  let sum = 0;
  let count = 0;
  for (let r = 1; r < m.rows - 1; r++) {
    for (let c = 1; c < m.cols - 1; c++) {
      const n = m.nodes[r * m.cols + c];
      const restY = m.top + r * m.cellH;
      sum += Math.abs(n.y - restY);
      count++;
    }
  }
  return count ? sum / count : 0;
}

// Step the full world: integrate sheet, handle balls + collisions, relax.
// Returns impacts that occurred this frame (for sonification).
export function stepWorld(
  m: Membrane,
  balls: Ball[],
  dt: number,
  width: number,
  height: number,
  maxBalls: number,
): Impact[] {
  const impacts: Impact[] = [];

  integrateSheet(m, dt);

  // Integrate balls (Verlet) with gravity + walls.
  for (const b of balls) {
    b.age += dt;
    b.squash *= 0.86;
    const vx = (b.x - b.px) * 0.995;
    const vy = (b.y - b.py) * 0.995;
    b.px = b.x;
    b.py = b.y;
    b.x += vx;
    b.y += vy + REST_GRAVITY * dt * dt;

    // side walls (soft)
    if (b.x < b.r) {
      b.x = b.r;
      b.px = b.x + vx * 0.6;
    } else if (b.x > width - b.r) {
      b.x = width - b.r;
      b.px = b.x + vx * 0.6;
    }
  }

  // Ball <-> sheet collision: push nearest nodes down, spring back.
  for (const b of balls) {
    const ni = nearestNode(m, b.x, b.y);
    const node = m.nodes[ni];
    const dy = b.y + b.r - node.y;
    const overlapping = dy > 0 && b.x > m.left && b.x < m.left + (m.cols - 1) * m.cellW;
    if (overlapping) {
      const vy = b.y - b.py;
      // push the contact node cluster down following the ball
      const ci = ni % m.cols;
      const ri = Math.floor(ni / m.cols);
      const rad = 1;
      for (let rr = ri - rad; rr <= ri + rad; rr++) {
        for (let cc = ci - rad; cc <= ci + rad; cc++) {
          if (cc <= 0 || cc >= m.cols - 1 || rr <= 0 || rr >= m.rows - 1)
            continue;
          const nn = m.nodes[rr * m.cols + cc];
          const target = b.y + b.r;
          if (nn.y < target) nn.y += (target - nn.y) * 0.5;
        }
      }
      // bounce the ball off the sheet only when moving downward into it
      if (vy > 0 && !b.prevBelow) {
        const restitution = 0.78;
        b.py = b.y + vy * restitution; // reverse + lose energy (Verlet)
        b.y = node.y - b.r;
        const energy = Math.min(1, vy / 16);
        if (energy > 0.06) {
          const nx = (b.x - m.left) / ((m.cols - 1) * m.cellW);
          impacts.push({
            x: b.x,
            y: node.y,
            energy,
            nx: Math.max(0, Math.min(1, nx)),
            colorIdx: b.colorIdx,
          });
          b.squash = Math.min(1, energy * 1.4);
        }
      }
      b.prevBelow = true;
    } else {
      b.prevBelow = false;
    }
  }

  relaxConstraints(m);

  // Cull balls that fall off / fully faded; fade oldest if over cap.
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (b.fading) {
      b.r *= 0.94;
      b.y += 4;
      if (b.r < 4) balls.splice(i, 1);
    }
    if (b.y > height + 80) balls.splice(i, 1);
  }
  if (balls.length > maxBalls) {
    // mark the oldest non-fading ball to fade away
    let oldest: Ball | null = null;
    for (const b of balls) {
      if (!b.fading && (!oldest || b.age > oldest.age)) oldest = b;
    }
    if (oldest) oldest.fading = true;
  }

  return impacts;
}
