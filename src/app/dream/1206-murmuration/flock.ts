// Murmuration boid simulation (Reynolds 1987, boids) steered by a union of
// glowing attractors. Integrated locally on every client from a fixed seed so
// all same-origin tabs converge to the same emergent flock shape.

export type Boid = {
  x: number;
  y: number;
  px: number; // previous position (for streak rendering)
  py: number;
  vx: number;
  vy: number;
};

export type Attractor = {
  x: number;
  y: number;
  hue: number; // 0..360
  weight: number; // pull strength multiplier
  kind: "self" | "peer" | "ghost";
};

// Deterministic PRNG so every tab starts from an identical flock.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFlock(count: number, w: number, h: number): Boid[] {
  const rng = makeRng(0x9e3779b9); // fixed seed → shared shape across tabs
  const flock: Boid[] = [];
  for (let i = 0; i < count; i++) {
    const x = w * (0.35 + rng() * 0.3);
    const y = h * (0.35 + rng() * 0.3);
    const ang = rng() * Math.PI * 2;
    const spd = 0.6 + rng() * 0.6;
    flock.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
    });
  }
  return flock;
}

const SEP_R = 16;
const ALIGN_R = 46;
const COH_R = 64;
const MAX_SPEED = 3.4;
const MIN_SPEED = 1.1;

// One integration step. dt is normalised to ~1 at 60fps.
export function stepFlock(
  flock: Boid[],
  attractors: Attractor[],
  dt: number,
  w: number,
  h: number,
): void {
  const sepR2 = SEP_R * SEP_R;
  const alignR2 = ALIGN_R * ALIGN_R;
  const cohR2 = COH_R * COH_R;
  const n = flock.length;

  for (let i = 0; i < n; i++) {
    const b = flock[i];
    let sepX = 0,
      sepY = 0;
    let alignX = 0,
      alignY = 0,
      alignN = 0;
    let cohX = 0,
      cohY = 0,
      cohN = 0;

    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = flock[j];
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > cohR2) continue;
      if (d2 < sepR2 && d2 > 0.0001) {
        sepX -= dx / d2;
        sepY -= dy / d2;
      }
      if (d2 < alignR2) {
        alignX += o.vx;
        alignY += o.vy;
        alignN++;
      }
      cohX += o.x;
      cohY += o.y;
      cohN++;
    }

    let ax = 0,
      ay = 0;

    // separation
    ax += sepX * 1.4;
    ay += sepY * 1.4;

    // alignment
    if (alignN > 0) {
      ax += (alignX / alignN - b.vx) * 0.06;
      ay += (alignY / alignN - b.vy) * 0.06;
    }

    // cohesion
    if (cohN > 0) {
      ax += (cohX / cohN - b.x) * 0.0016;
      ay += (cohY / cohN - b.y) * 0.0016;
    }

    // attractors — pull that eases with distance (a soft well)
    for (let k = 0; k < attractors.length; k++) {
      const at = attractors[k];
      const dx = at.x - b.x;
      const dy = at.y - b.y;
      const dist = Math.hypot(dx, dy) + 1;
      const falloff = 1 / (1 + dist * 0.006);
      const g = at.weight * 0.05 * falloff;
      ax += (dx / dist) * g;
      ay += (dy / dist) * g;
    }

    // gentle centring so the flock never escapes the frame
    const mx = w * 0.09;
    const my = h * 0.09;
    if (b.x < mx) ax += (mx - b.x) * 0.0009;
    if (b.x > w - mx) ax -= (b.x - (w - mx)) * 0.0009;
    if (b.y < my) ay += (my - b.y) * 0.0009;
    if (b.y > h - my) ay -= (b.y - (h - my)) * 0.0009;

    b.vx += ax * dt;
    b.vy += ay * dt;

    // clamp speed
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_SPEED) {
      b.vx = (b.vx / sp) * MAX_SPEED;
      b.vy = (b.vy / sp) * MAX_SPEED;
    } else if (sp < MIN_SPEED && sp > 0.0001) {
      b.vx = (b.vx / sp) * MIN_SPEED;
      b.vy = (b.vy / sp) * MIN_SPEED;
    }

    b.px = b.x;
    b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // hard clamp as a safety net
    if (b.x < 0) b.x = 0;
    else if (b.x > w) b.x = w;
    if (b.y < 0) b.y = 0;
    else if (b.y > h) b.y = h;
  }
}

export type Cluster = {
  col: number;
  row: number;
  cx: number;
  cy: number;
  count: number;
  speed: number; // mean speed, 0..1 normalised
};

export const GRID_COLS = 10;
export const GRID_ROWS = 7;

// Find knots of birds — grid cells holding >= minCount boids. Their region id
// (col,row), centroid, and mean speed drive the quantised voice events.
export function findClusters(
  flock: Boid[],
  w: number,
  h: number,
  minCount: number,
): Cluster[] {
  const cells = GRID_COLS * GRID_ROWS;
  const counts = new Int32Array(cells);
  const sx = new Float32Array(cells);
  const sy = new Float32Array(cells);
  const spd = new Float32Array(cells);
  const cw = w / GRID_COLS;
  const ch = h / GRID_ROWS;

  for (let i = 0; i < flock.length; i++) {
    const b = flock[i];
    let c = Math.floor(b.x / cw);
    let r = Math.floor(b.y / ch);
    if (c < 0) c = 0;
    else if (c >= GRID_COLS) c = GRID_COLS - 1;
    if (r < 0) r = 0;
    else if (r >= GRID_ROWS) r = GRID_ROWS - 1;
    const idx = r * GRID_COLS + c;
    counts[idx]++;
    sx[idx] += b.x;
    sy[idx] += b.y;
    spd[idx] += Math.hypot(b.vx, b.vy);
  }

  const out: Cluster[] = [];
  for (let idx = 0; idx < cells; idx++) {
    if (counts[idx] < minCount) continue;
    const c = idx % GRID_COLS;
    const r = Math.floor(idx / GRID_COLS);
    out.push({
      col: c,
      row: r,
      cx: sx[idx] / counts[idx],
      cy: sy[idx] / counts[idx],
      count: counts[idx],
      speed: Math.min(1, spd[idx] / counts[idx] / MAX_SPEED),
    });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}
