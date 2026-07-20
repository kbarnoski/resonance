// pendulum.ts — the deterministic-chaos engine.
//
// A damped MAGNETIC PENDULUM: a bob swings over N fixed magnets while three
// forces act on it every step —
//   1. a linear RESTORING pull toward the plane's centre (the pivot),  −k·p
//   2. viscous FRICTION opposing its velocity,                         −c·v
//   3. attraction toward each MAGNET, softened by a small height offset
//      so the singularity at the magnet is finite:  strength·(mᵢ−p) / (|mᵢ−p|²+h²)^(3/2)
//
// Which magnet finally captures the bob depends with infinite sensitivity on
// where it was released — the release plane is carved into fractal BASINS OF
// ATTRACTION, one per magnet, whose shared boundary is a fractal set (the same
// sensitive-dependence Poincaré and the Julia–Fatou theory made famous).
//
// Everything here is pure + deterministic: fixed timestep, no Math.random /
// Date.now / performance.now. The only stochastic element in the whole
// prototype (a touch of jitter on the auto-demo release points) is drawn from
// the seeded mulberry32 below.

export interface Magnet {
  x: number;
  y: number;
  freq: number; // geometry-derived pitch (Hz), recomputed when the magnet moves
}

export interface PendulumParams {
  k: number; // restoring stiffness toward centre
  c: number; // friction coefficient
  h2: number; // squared height offset that softens each magnet's pull
  strength: number; // magnet attraction strength
  dt: number; // integration timestep
}

export const DEFAULT_PARAMS: PendulumParams = {
  k: 0.32,
  c: 0.18,
  h2: 0.28 * 0.28,
  strength: 1.0,
  dt: 0.04,
};

// Half-extent of the square release plane in world units. Everything (magnets,
// basin grid, pointer picks) lives in [-WORLD_H, +WORLD_H]².
export const WORLD_H = 1.0;

// ── seeded RNG (mulberry32, seed 0x2020) ────────────────────────────────────
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── geometry → pitch (NON-JI: 12-TET, derived from each magnet's polar place) ─
// A magnet's ANGLE around the pivot selects a scale degree from a 12-tone
// EQUAL-TEMPERED pentatonic (semitone offsets 0,2,4,7,9 — an equal-tempered set,
// NOT a just-intonation ratio stack). Its RADIUS from the pivot chooses the
// octave: magnets near the centre ring high, magnets flung wide ring deep. So
// dragging a magnet re-tunes it, and the three captors form an evolving chord.
const ET_PENTATONIC = [0, 2, 4, 7, 9]; // semitone offsets within an octave
const ROOT_MIDI = 57; // A3

export function geometryToFreq(x: number, y: number): number {
  const angle = Math.atan2(y, x); // −π..π
  const u = angle / (Math.PI * 2) + 0.5; // 0..1
  const degIndex = Math.min(ET_PENTATONIC.length - 1, Math.floor(u * ET_PENTATONIC.length));
  const deg = ET_PENTATONIC[degIndex];
  const r = Math.hypot(x, y);
  const octShift = Math.max(-1, Math.min(2, Math.round((0.45 - r) * 5)));
  const midi = ROOT_MIDI + deg + 12 * octShift;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Three magnets on an equilateral triangle around the pivot (a classic basin).
export function defaultMagnets(): Magnet[] {
  const R = 0.5;
  const out: Magnet[] = [];
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    const x = Math.cos(a) * R;
    const y = Math.sin(a) * R;
    out.push({ x, y, freq: geometryToFreq(x, y) });
  }
  return out;
}

// ── the acceleration field ──────────────────────────────────────────────────
function accel(
  x: number,
  y: number,
  vx: number,
  vy: number,
  magnets: Magnet[],
  P: PendulumParams,
  out: { ax: number; ay: number },
): void {
  let ax = -P.k * x - P.c * vx;
  let ay = -P.k * y - P.c * vy;
  for (let i = 0; i < magnets.length; i++) {
    const dx = magnets[i].x - x;
    const dy = magnets[i].y - y;
    const d2 = dx * dx + dy * dy + P.h2;
    const f = P.strength / (d2 * Math.sqrt(d2));
    ax += f * dx;
    ay += f * dy;
  }
  out.ax = ax;
  out.ay = ay;
}

// Nearest magnet index + its (squared) distance.
export function nearestMagnet(
  x: number,
  y: number,
  magnets: Magnet[],
): { index: number; dist2: number } {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < magnets.length; i++) {
    const dx = magnets[i].x - x;
    const dy = magnets[i].y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  return { index: best, dist2: bestD };
}

const SETTLE_SPEED2 = 0.05 * 0.05; // below this speed …
const SETTLE_DIST2 = 0.12 * 0.12; // … and this near a magnet ⇒ captured
export const MAX_BASIN_STEPS = 480;

// Integrate one release to its captor. Returns the magnet index and how long it
// took to settle (0..1, longer near fractal boundaries) — used to shade the map.
export function computeBasinCell(
  x0: number,
  y0: number,
  magnets: Magnet[],
  P: PendulumParams,
): { magnet: number; settle: number } {
  let x = x0;
  let y = y0;
  let vx = 0;
  let vy = 0;
  const a = { ax: 0, ay: 0 };
  for (let step = 0; step < MAX_BASIN_STEPS; step++) {
    accel(x, y, vx, vy, magnets, P, a);
    vx += a.ax * P.dt;
    vy += a.ay * P.dt;
    x += vx * P.dt;
    y += vy * P.dt;
    if (vx * vx + vy * vy < SETTLE_SPEED2) {
      const n = nearestMagnet(x, y, magnets);
      if (n.dist2 < SETTLE_DIST2) {
        return { magnet: n.index, settle: step / MAX_BASIN_STEPS };
      }
    }
  }
  return { magnet: nearestMagnet(x, y, magnets).index, settle: 1 };
}

// ── the live, playable bob ──────────────────────────────────────────────────
export interface Bob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  captured: number; // −1 while flying, else captor magnet index
  steps: number;
  trail: number[]; // flat [x,y,x,y,…]
}

export function spawnBob(x: number, y: number): Bob {
  return { x, y, vx: 0, vy: 0, captured: -1, steps: 0, trail: [x, y] };
}

export interface BobTelemetry {
  blendFreq: number; // inverse-distance-weighted magnet pitch (glide target)
  speed: number; // instantaneous speed
  nearest: number; // nearest magnet index
  justCaptured: number; // −1, or the captor index on the frame of capture
}

const MAX_TRAIL = 900; // flat entries ⇒ 450 points

// Advance one bob `substeps` timesteps; report what the audio should track.
export function stepBob(
  b: Bob,
  magnets: Magnet[],
  P: PendulumParams,
  substeps: number,
): BobTelemetry {
  const a = { ax: 0, ay: 0 };
  let justCaptured = -1;
  if (b.captured < 0) {
    for (let s = 0; s < substeps; s++) {
      accel(b.x, b.y, b.vx, b.vy, magnets, P, a);
      b.vx += a.ax * P.dt;
      b.vy += a.ay * P.dt;
      b.x += b.vx * P.dt;
      b.y += b.vy * P.dt;
      b.steps++;
      b.trail.push(b.x, b.y);
      if (b.trail.length > MAX_TRAIL) b.trail.splice(0, b.trail.length - MAX_TRAIL);
      const speed2 = b.vx * b.vx + b.vy * b.vy;
      if (speed2 < SETTLE_SPEED2) {
        const n = nearestMagnet(b.x, b.y, magnets);
        if (n.dist2 < SETTLE_DIST2) {
          b.captured = n.index;
          justCaptured = n.index;
          break;
        }
      }
      // safety cap so a boundary-wanderer eventually rings
      if (b.steps >= MAX_BASIN_STEPS * 2) {
        b.captured = nearestMagnet(b.x, b.y, magnets).index;
        justCaptured = b.captured;
        break;
      }
    }
  }

  // inverse-distance blend of magnet pitches — the flight voice glides between
  // captors, brightening as the bob accelerates through a basin boundary.
  let wSum = 0;
  let fSum = 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < magnets.length; i++) {
    const dx = magnets[i].x - b.x;
    const dy = magnets[i].y - b.y;
    const d2 = dx * dx + dy * dy + 0.02;
    const w = 1 / (d2 * d2);
    wSum += w;
    fSum += w * magnets[i].freq;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  return {
    blendFreq: fSum / (wSum || 1),
    speed: Math.hypot(b.vx, b.vy),
    nearest: best,
    justCaptured,
  };
}
