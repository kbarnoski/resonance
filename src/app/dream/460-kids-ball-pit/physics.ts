// physics.ts — uniform-grid spatial-hash many-body collision solver
// Reference: Müller, Heidelberger, Hennix & Ratcliff, "Position Based Dynamics" (2007)
// ~1000 circles, CPU, broad-phase spatial hash, narrow-phase penetration resolution.

export interface Ball {
  /** Stable identity for pair deduplication */
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** hue 0–360 */
  hue: number;
  /** note index into BELL_FREQS */
  noteIdx: number;
  /** mass = r² (proportional to area) */
  mass: number;
  /** flash brightness [0..1], decays each frame */
  flash: number;
}

export interface CollisionEvent {
  ballA: Ball;
  ballB: Ball;
  /** relative speed at collision moment, px/s */
  speed: number;
}

// Restitution coefficient (bounciness)
const RESTITUTION = 0.55;
// Velocity damping per step
const DAMPING = 0.9985;
// Minimum impact speed to trigger a sound (px/s)
export const COLLISION_SOUND_THRESHOLD = 60;
// Max collision events returned per step (throttle audio)
const MAX_EVENTS_PER_STEP = 8;

let _nextId = 0;

/** Allocate a new stable ball id */
export function nextBallId(): number {
  return _nextId++;
}

/** Derive spatial hash cell size from the ball array */
function cellSize(balls: Ball[]): number {
  let maxR = 8;
  for (const b of balls) if (b.r > maxR) maxR = b.r;
  return maxR * 2.2;
}

type CellMap = Map<number, Ball[]>;

function hashKey(cx: number, cy: number, cols: number): number {
  return cy * cols + cx;
}

function buildGrid(balls: Ball[], cs: number, cols: number): CellMap {
  const map: CellMap = new Map();
  for (const b of balls) {
    const cx = Math.floor(b.x / cs);
    const cy = Math.floor(b.y / cs);
    const key = hashKey(cx, cy, cols);
    const bucket = map.get(key);
    if (bucket) bucket.push(b);
    else map.set(key, [b]);
  }
  return map;
}

/**
 * Step the simulation one frame.
 * Returns collision events (ball-ball) above the sound threshold.
 */
export function stepPhysics(
  balls: Ball[],
  gx: number,
  gy: number,
  width: number,
  height: number,
  dt: number
): CollisionEvent[] {
  const n = balls.length;
  if (n === 0) return [];

  const cs   = cellSize(balls);
  const cols = Math.ceil(width / cs) + 1;

  // 1. Integrate gravity + damp + move
  for (let i = 0; i < n; i++) {
    const b = balls[i];
    b.vx  = (b.vx + gx * dt) * DAMPING;
    b.vy  = (b.vy + gy * dt) * DAMPING;
    b.x  += b.vx * dt;
    b.y  += b.vy * dt;
    b.flash *= 0.87;
  }

  // 2. Wall collisions (hard clamp + reflect)
  for (let i = 0; i < n; i++) {
    const b = balls[i];
    if (b.x - b.r < 0) {
      b.x  = b.r;
      b.vx = Math.abs(b.vx) * RESTITUTION;
    } else if (b.x + b.r > width) {
      b.x  = width - b.r;
      b.vx = -Math.abs(b.vx) * RESTITUTION;
    }
    if (b.y - b.r < 0) {
      b.y  = b.r;
      b.vy = Math.abs(b.vy) * RESTITUTION;
    } else if (b.y + b.r > height) {
      b.y  = height - b.r;
      b.vy = -Math.abs(b.vy) * RESTITUTION;
    }
  }

  // 3. Spatial hash
  const grid = buildGrid(balls, cs, cols);

  // 4. Ball–ball narrow-phase + impulse
  const events: CollisionEvent[] = [];
  // Use a Set<string> keyed by min/max id to prevent double-resolving each pair
  const processed = new Set<number>();

  for (let i = 0; i < n; i++) {
    const a   = balls[i];
    const acx = Math.floor(a.x / cs);
    const acy = Math.floor(a.y / cs);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = grid.get(hashKey(acx + dx, acy + dy, cols));
        if (!bucket) continue;

        for (const b of bucket) {
          if (b === a) continue;

          // Canonical pair key using stable ids
          const lo = a.id < b.id ? a.id : b.id;
          const hi = a.id < b.id ? b.id : a.id;
          // Pack into one number (ids stay < 2^20 for ~1M balls)
          const pairKey = lo * 1048576 + hi;
          if (processed.has(pairKey)) continue;
          processed.add(pairKey);

          const nx    = b.x - a.x;
          const ny    = b.y - a.y;
          const dist2 = nx * nx + ny * ny;
          const minD  = a.r + b.r;
          if (dist2 >= minD * minD) continue;

          const dist    = Math.sqrt(dist2) || 0.0001;
          const overlap = minD - dist;
          const inv     = 1 / dist;

          // Relative velocity along collision normal (before resolution)
          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const rvn = rvx * (nx * inv) + rvy * (ny * inv);

          // Positional correction split by mass
          const totalMass = a.mass + b.mass;
          const wa = b.mass / totalMass;
          const wb = a.mass / totalMass;
          a.x -= nx * inv * overlap * wa;
          a.y -= ny * inv * overlap * wa;
          b.x += nx * inv * overlap * wb;
          b.y += ny * inv * overlap * wb;

          // Velocity impulse (only for approaching pairs)
          if (rvn < 0) {
            const j  = -(1 + RESTITUTION) * rvn / (1 / a.mass + 1 / b.mass);
            const jx = (nx * inv) * j;
            const jy = (ny * inv) * j;
            a.vx -= jx / a.mass;
            a.vy -= jy / a.mass;
            b.vx += jx / b.mass;
            b.vy += jy / b.mass;

            const speed = Math.abs(rvn);
            if (speed > COLLISION_SOUND_THRESHOLD && events.length < MAX_EVENTS_PER_STEP) {
              events.push({ ballA: a, ballB: b, speed });
              a.flash = Math.min(1, a.flash + speed / 380);
              b.flash = Math.min(1, b.flash + speed / 380);
            }
          }
        }
      }
    }
  }

  return events;
}

/** Drop a handful of balls near (cx, cy) */
export function spawnHandful(
  balls: Ball[],
  cx: number,
  cy: number,
  count: number,
  width: number,
  noteIdxOffset: number,
  bellFreqs: readonly number[]
): void {
  // Clamp x so balls don't spawn outside the pit
  const safeX = Math.max(20, Math.min(width - 20, cx));
  for (let i = 0; i < count; i++) {
    const r       = 7 + Math.random() * 8;
    const hue     = Math.random() * 360;
    const noteIdx = (noteIdxOffset + i + Math.floor(Math.random() * 3)) % bellFreqs.length;
    const angle   = Math.random() * Math.PI * 2;
    const spd     = 50 + Math.random() * 130;
    balls.push({
      id:      nextBallId(),
      x:       safeX + (Math.random() - 0.5) * 55,
      y:       cy + (Math.random() - 0.5) * 28,
      vx:      Math.cos(angle) * spd,
      vy:      Math.sin(angle) * spd - 90,
      r,
      hue,
      noteIdx,
      mass:    r * r,
      flash:   0.55,
    });
  }
  // Hard cap
  if (balls.length > 1400) balls.splice(0, balls.length - 1400);
}

/** Randomly kick all balls (shake gesture) */
export function scrambleBalls(balls: Ball[]): void {
  for (const b of balls) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 220 + Math.random() * 420;
    b.vx += Math.cos(angle) * spd;
    b.vy += Math.sin(angle) * spd;
    b.flash = 1;
  }
}
