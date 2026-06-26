/**
 * Iron Garden — magnetic field helper module.
 *
 * Pure math, no React, no DOM. Computes a superposed 2D magnetic-dipole field
 * from a set of point poles (Faraday's "lines of force"), and the alignment of
 * iron filings to that field. Everything works in device-pixel canvas units.
 */

/** Note tuning + colour for each magnet-flower. Pentatonic — no wrong notes. */
export const NOTES = [
  { freq: 130.81, hue: 268 }, // C3  violet
  { freq: 164.81, hue: 175 }, // E3  teal
  { freq: 196.0, hue: 42 }, // G3  amber
  { freq: 220.0, hue: 345 }, // A3  rose
  { freq: 261.63, hue: 200 }, // C4  cyan
  { freq: 329.63, hue: 135 }, // E4  emerald
] as const;

export const N_MAGNETS = NOTES.length;

/** A magnet-flower: a 2D dipole. Position is the centre; axis points N pole→S. */
export interface Magnet {
  x: number;
  y: number;
  /** unit axis vector (the dipole orientation) */
  ax: number;
  ay: number;
  /** half-separation of the two poles, in px */
  half: number;
  /** smooth-drift phase seeds for the autonomous demo */
  seedX: number;
  seedY: number;
  seedR: number;
  /** glow/hum envelope (0..1), eased toward target each frame */
  glow: number;
}

/** A single iron filing. Streak is drawn from (x,y) along (dx,dy). */
export interface Filing {
  x: number;
  y: number;
  /** smoothed local field direction (unit) */
  dx: number;
  dy: number;
  /** field magnitude at this point (for brightness) */
  mag: number;
  /** index of nearest magnet → colour */
  hue: number;
  /** small per-filing life counter to stagger respawns */
  age: number;
}

/** The two signed poles of a dipole magnet. q = +1 (N) / -1 (S). */
export interface Pole {
  x: number;
  y: number;
  q: number;
}

/** Expand magnets into their +/- poles. */
export function computePoles(magnets: Magnet[]): Pole[] {
  const poles: Pole[] = [];
  for (const m of magnets) {
    poles.push({ x: m.x + m.ax * m.half, y: m.y + m.ay * m.half, q: 1 });
    poles.push({ x: m.x - m.ax * m.half, y: m.y - m.ay * m.half, q: -1 });
  }
  return poles;
}

/**
 * Superposed dipole field at point P:
 *   B(P) = Σ_k  q_k · (P − pole_k) / |P − pole_k|^3
 * Returns the raw (unnormalised) vector via the out-array [bx, by].
 * `soft` is a softening radius² that prevents singularities at the poles.
 */
export function computeField(
  px: number,
  py: number,
  poles: Pole[],
  soft: number,
  out: [number, number],
): void {
  let bx = 0;
  let by = 0;
  for (let k = 0; k < poles.length; k++) {
    const rx = px - poles[k].x;
    const ry = py - poles[k].y;
    const r2 = rx * rx + ry * ry + soft;
    const r = Math.sqrt(r2);
    const inv = poles[k].q / (r2 * r); // q / r^3
    bx += rx * inv;
    by += ry * inv;
  }
  out[0] = bx;
  out[1] = by;
}

/** Index of the magnet nearest to (px,py). Used to colour a filing. */
export function nearestMagnet(px: number, py: number, magnets: Magnet[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < magnets.length; i++) {
    const dx = magnets[i].x - px;
    const dy = magnets[i].y - py;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Scatter `count` filings uniformly across the canvas. */
export function buildFilings(count: number, W: number, H: number): Filing[] {
  const arr: Filing[] = new Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = {
      x: Math.random() * W,
      y: Math.random() * H,
      dx: 1,
      dy: 0,
      mag: 0,
      hue: 0,
      age: Math.random() * 1000,
    };
  }
  return arr;
}

/** Build the initial ring of magnet-flowers. */
export function buildMagnets(W: number, H: number): Magnet[] {
  const arr: Magnet[] = [];
  for (let i = 0; i < N_MAGNETS; i++) {
    const a = (i / N_MAGNETS) * Math.PI * 2 - Math.PI / 2;
    const r = Math.min(W, H) * 0.3;
    const axis = Math.random() * Math.PI * 2;
    arr.push({
      x: W / 2 + Math.cos(a) * r,
      y: H / 2 + Math.sin(a) * r,
      ax: Math.cos(axis),
      ay: Math.sin(axis),
      half: 0,
      seedX: Math.random() * 1000,
      seedY: Math.random() * 1000,
      seedR: 0.2 + Math.random() * 0.5,
      glow: 0,
    });
  }
  return arr;
}

/**
 * Cheap smooth 1-D noise in [-1,1] from a phase. Sum of a few incommensurate
 * sines → wandering-but-bounded paths for the autonomous demo.
 */
export function applyDrift(t: number, seed: number): number {
  return (
    0.6 * Math.sin(t * 0.21 + seed) +
    0.3 * Math.sin(t * 0.37 + seed * 1.7) +
    0.1 * Math.sin(t * 0.53 + seed * 2.9)
  );
}

/**
 * Proximity in [0,1] between two magnets given a bridge distance.
 * 1 when centres coincide, 0 at/after `bridge`. Used both for the audio chord
 * bloom and for deciding when to draw the connecting field line strongly.
 */
export function computeProximity(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  bridge: number,
): number {
  const d = Math.hypot(ax - bx, ay - by);
  return Math.max(0, 1 - d / bridge);
}
