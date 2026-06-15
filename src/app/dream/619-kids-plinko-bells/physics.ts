// Galton board / quincunx physics for 619-kids-plinko-bells.
// A triangular peg lattice; marbles fall under gravity and bounce left/right at
// each row. Slight bias toward center + real collision jitter so the binomial
// bell curve emerges while no two runs look identical.
//
// Reference: Sir Francis Galton's quincunx / "bean machine" (1894),
// demonstrating the central limit theorem (binomial -> normal).
//
// Coordinates are NORMALIZED [0..1] in both axes. The renderer scales to pixels.
// x: 0 = left, 1 = right. y: 0 = top (drop), 1 = bottom (bins).

export const ROWS = 12; // peg lattice rows
export const BINS = 9; // tuned bins along the bottom

export interface Marble {
  id: number;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  vx: number;
  vy: number;
  hue: number; // assigned color
  landed: boolean;
  binIndex: number; // -1 while in flight
}

export interface Peg {
  x: number;
  y: number;
  row: number;
  glow: number; // 0..1 decaying highlight when recently hit
}

// Vertical band the pegs occupy (leaving room for drop zone + bins).
const PEG_TOP = 0.16;
const PEG_BOTTOM = 0.74;
const BIN_TOP = 0.78;

const GRAVITY = 0.55; // normalized units / s^2
const PEG_ROW_DY = (PEG_BOTTOM - PEG_TOP) / (ROWS - 1);

export function buildPegs(): Peg[] {
  const pegs: Peg[] = [];
  for (let r = 0; r < ROWS; r++) {
    const count = r + 1;
    const y = PEG_TOP + r * PEG_ROW_DY;
    // span widens with depth but stays inside [0.12, 0.88]
    const span = 0.12 + (0.64 * r) / (ROWS - 1);
    const left = 0.5 - span / 2;
    const step = count > 1 ? span / (count - 1) : 0;
    for (let c = 0; c < count; c++) {
      const x = count === 1 ? 0.5 : left + c * step;
      pegs.push({ x, y, row: r, glow: 0 });
    }
  }
  return pegs;
}

let _id = 1;

export function spawnMarble(hue: number): Marble {
  // Drop near top center with a small random offset.
  return {
    id: _id++,
    x: 0.5 + (Math.random() - 0.5) * 0.04,
    y: 0.05,
    vx: (Math.random() - 0.5) * 0.02,
    vy: 0,
    hue,
    landed: false,
    binIndex: -1,
  };
}

// Find the bin index for a normalized x.
export function binForX(x: number): number {
  const i = Math.floor(x * BINS);
  return Math.max(0, Math.min(BINS - 1, i));
}

// marbles that landed THIS step, with their bin + impact velocity
export type Landing = { marble: Marble; bin: number; velocity: number };

// Advance physics by dt seconds. Mutates marbles + pegs in place.
export function stepPhysics(
  marbles: Marble[],
  pegs: Peg[],
  dt: number,
): Landing[] {
  const landings: Landing[] = [];
  // clamp dt for stability on slow frames
  const h = Math.min(dt, 1 / 30);

  // decay peg glow
  for (const p of pegs) {
    if (p.glow > 0) p.glow = Math.max(0, p.glow - h * 2.4);
  }

  const hitRadius = 0.028; // normalized collision radius peg<->marble

  for (const m of marbles) {
    if (m.landed) continue;

    m.vy += GRAVITY * h;
    // mild air drag on horizontal so it settles
    m.vx *= 0.992;
    m.x += m.vx * h;
    m.y += m.vy * h;

    // keep inside walls
    if (m.x < 0.06) {
      m.x = 0.06;
      m.vx = Math.abs(m.vx) * 0.4;
    } else if (m.x > 0.94) {
      m.x = 0.94;
      m.vx = -Math.abs(m.vx) * 0.4;
    }

    // peg collisions: check only pegs in nearby rows for speed
    if (m.y >= PEG_TOP - 0.04 && m.y <= PEG_BOTTOM + 0.04) {
      for (const p of pegs) {
        if (Math.abs(p.y - m.y) > 0.05) continue;
        const dx = m.x - p.x;
        const dy = m.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < hitRadius * hitRadius) {
          // BOUNCE: deflect left or right.
          // Bias toward center keeps the peak rooted; jitter keeps it organic.
          const centerPull = (0.5 - p.x) * 0.18; // toward center
          const baseDir = dx >= 0 ? 1 : -1;
          // probability nudged so deeper/edge pegs still mostly 50/50
          const goRight =
            Math.random() < 0.5 + centerPull * (baseDir === 1 ? 1 : -1)
              ? 1
              : -1;
          const kick = 0.12 + Math.random() * 0.06;
          m.vx = goRight * kick + (Math.random() - 0.5) * 0.05;
          m.vy = Math.max(m.vy * 0.45, 0.06); // bleed vertical, keep falling
          // push marble out of the peg
          const d = Math.sqrt(d2) || 0.0001;
          m.x = p.x + (dx / d) * (hitRadius + 0.001);
          m.y = p.y + (Math.abs(dy) / d) * (hitRadius + 0.001) + 0.001;
          p.glow = 1;
          break;
        }
      }
    }

    // landing in a bin
    if (m.y >= BIN_TOP) {
      m.landed = true;
      m.y = BIN_TOP;
      const bin = binForX(m.x);
      m.binIndex = bin;
      const velocity = Math.min(1, Math.abs(m.vy) / 0.5 + 0.4);
      landings.push({ marble: m, bin, velocity });
    }
  }

  return landings;
}

export const LAYOUT = { PEG_TOP, PEG_BOTTOM, BIN_TOP };
