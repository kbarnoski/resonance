// Position Based Dynamics soft-body jelly creatures.
//
// Each creature is a small filled blob: a ring of perimeter particles plus
// a center particle. We hold its shape with two kinds of constraints,
// projected a few times per frame (Müller, Heidelberger, Hennix, Ratcliff,
// "Position Based Dynamics", 2007):
//   1) distance constraints  — perimeter springs + spokes to the center
//      keep the ring from collapsing or stretching.
//   2) an area constraint     — total signed area is pulled back toward its
//      rest area, so the blob squishes on impact and bounces back to full
//      volume (the "jelly" feel).
//
// Names avoid the `use*` prefix (reserved for React hooks).

export type Vec2 = { x: number; y: number };

export interface Particle {
  x: number;
  y: number;
  px: number; // previous position (Verlet-style integration)
  py: number;
  vx: number;
  vy: number;
  invMass: number;
}

export interface Creature {
  id: number;
  parts: Particle[]; // [0] = center, [1..N] = perimeter ring
  ring: number[]; // indices into parts for the perimeter, ordered
  edges: { a: number; b: number; rest: number }[]; // distance constraints
  restArea: number;
  hue: number; // 0..1 base color hue
  spawnT: number; // birth time (s) for spawn pop animation
  radius: number;
  squish: number; // 0 = relaxed, 1 = max squished (drives glow/audio)
}

export interface World {
  creatures: Creature[];
  width: number;
  height: number;
  gravity: number;
  nextId: number;
  // running energy + spawn accounting that the audio engine reads
  kinetic: number; // smoothed total kinetic energy, normalized ~0..1
  spawnPulse: number; // decays toward 0; bumped on each spawn
  collisionPulse: number; // decays; bumped on hard collisions
  lastImpacts: number[]; // hues of recent impacts (drained by audio)
}

export function makeWorld(width: number, height: number): World {
  return {
    creatures: [],
    width,
    height,
    gravity: 1900, // px/s^2 — snappy, kid-pleasing drop
    nextId: 1,
    kinetic: 0,
    spawnPulse: 0,
    collisionPulse: 0,
    lastImpacts: [],
  };
}

const RING_N = 12; // perimeter particles per creature
const SOLVER_ITERS = 5; // constraint projection passes per substep
const SUBSTEPS = 2;

// Bright saturated kid palette spread across the hue wheel.
const PALETTE = [0.0, 0.08, 0.14, 0.33, 0.5, 0.58, 0.78, 0.92];

export function makeCreature(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  vx = 0,
  vy = 0,
  nowSec = 0
): Creature {
  const parts: Particle[] = [];
  // center particle (heavier so the blob has a stable core)
  parts.push({
    x: cx,
    y: cy,
    px: cx - vx * 0.016,
    py: cy - vy * 0.016,
    vx,
    vy,
    invMass: 1 / 2.0,
  });
  const ring: number[] = [];
  for (let i = 0; i < RING_N; i++) {
    const a = (i / RING_N) * Math.PI * 2;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    parts.push({
      x,
      y,
      px: x - vx * 0.016,
      py: y - vy * 0.016,
      vx,
      vy,
      invMass: 1,
    });
    ring.push(i + 1);
  }

  const edges: Creature["edges"] = [];
  // perimeter springs (ring)
  for (let i = 0; i < RING_N; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % RING_N];
    edges.push({ a, b, rest: dist(parts[a], parts[b]) });
  }
  // spokes to center
  for (let i = 0; i < RING_N; i++) {
    edges.push({ a: 0, b: ring[i], rest: radius });
  }
  // a few cross-braces so it keeps a rounded shape but stays squishy
  for (let i = 0; i < RING_N; i += 2) {
    const a = ring[i];
    const b = ring[(i + RING_N / 2) % RING_N];
    edges.push({ a, b, rest: dist(parts[a], parts[b]) });
  }

  const hue = PALETTE[world.nextId % PALETTE.length];
  const creature: Creature = {
    id: world.nextId++,
    parts,
    ring,
    edges,
    restArea: polyArea(parts, ring),
    hue,
    spawnT: nowSec,
    radius,
    squish: 0,
  };
  world.creatures.push(creature);
  world.spawnPulse = Math.min(1.4, world.spawnPulse + 0.5);
  return creature;
}

function dist(p: Particle, q: Particle): number {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return Math.hypot(dx, dy) || 1e-4;
}

function polyArea(parts: Particle[], ring: number[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = parts[ring[i]];
    const q = parts[ring[(i + 1) % ring.length]];
    area += p.x * q.y - q.x * p.y;
  }
  return area * 0.5;
}

// Push every particle of a creature near (x,y) outward — a "poke".
export function applyPoke(
  world: World,
  x: number,
  y: number,
  strength: number,
  flingX = 0,
  flingY = 0
): void {
  const r2 = 130 * 130;
  for (const c of world.creatures) {
    for (const p of c.parts) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        const d = Math.sqrt(d2) || 1;
        const f = (1 - d / 130) * strength;
        p.vx += (dx / d) * f + flingX;
        p.vy += (dy / d) * f + flingY;
      }
    }
  }
  world.collisionPulse = Math.min(1.5, world.collisionPulse + 0.4);
}

export function stepWorld(world: World, dt: number, nowSec: number): void {
  // clamp dt so a tab-switch doesn't explode the sim
  dt = Math.min(dt, 1 / 30);
  const sdt = dt / SUBSTEPS;

  let totalKE = 0;
  for (let s = 0; s < SUBSTEPS; s++) {
    integrate(world, sdt);
    for (let k = 0; k < SOLVER_ITERS; k++) {
      for (const c of world.creatures) {
        solveDistance(c);
        solveArea(c);
      }
      collideCreatures(world);
      collideBounds(world);
    }
    finalizeVelocities(world, sdt);
  }

  // measure energy + update per-creature squish
  for (const c of world.creatures) {
    let ke = 0;
    for (const p of c.parts) ke += p.vx * p.vx + p.vy * p.vy;
    totalKE += ke;
    const area = Math.abs(polyArea(c.parts, c.ring));
    const compression = Math.max(0, 1 - area / Math.abs(c.restArea));
    c.squish += (Math.min(1, compression * 2.2) - c.squish) * 0.4;
  }

  // normalize energy to ~0..1 (scaled by count so a full screen reads ~1)
  const n = Math.max(1, world.creatures.length);
  const raw = Math.min(1, totalKE / (n * 9_000_00));
  world.kinetic += (raw - world.kinetic) * 0.12;

  world.spawnPulse *= Math.pow(0.0008, dt);
  world.collisionPulse *= Math.pow(0.0008, dt);

  void nowSec;
}

function integrate(world: World, dt: number): void {
  for (const c of world.creatures) {
    for (const p of c.parts) {
      if (p.invMass === 0) continue;
      p.vy += world.gravity * dt;
      // light global damping
      p.vx *= 0.999;
      p.vy *= 0.999;
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
}

function solveDistance(c: Creature): void {
  const stiff = 0.9;
  for (const e of c.edges) {
    const p = c.parts[e.a];
    const q = c.parts[e.b];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1e-4;
    const diff = (d - e.rest) / d;
    const wsum = p.invMass + q.invMass;
    if (wsum === 0) continue;
    const kp = (p.invMass / wsum) * stiff;
    const kq = (q.invMass / wsum) * stiff;
    p.x += dx * diff * kp;
    p.y += dy * diff * kp;
    q.x -= dx * diff * kq;
    q.y -= dy * diff * kq;
  }
}

// Pull the perimeter area back toward rest area (volume/area constraint).
function solveArea(c: Creature): void {
  const ring = c.ring;
  const parts = c.parts;
  const n = ring.length;
  const area = polyArea(parts, ring);
  const C = area - c.restArea;
  // gradient of area wrt each ring vertex = 0.5 * (next - prev) rotated
  let gradSum = 0;
  const gx: number[] = new Array(n);
  const gy: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = parts[ring[(i - 1 + n) % n]];
    const next = parts[ring[(i + 1) % n]];
    const dgx = 0.5 * (next.y - prev.y);
    const dgy = 0.5 * (prev.x - next.x);
    gx[i] = dgx;
    gy[i] = dgy;
    gradSum += parts[ring[i]].invMass * (dgx * dgx + dgy * dgy);
  }
  if (gradSum < 1e-6) return;
  const stiff = 0.85;
  const s = (-C / gradSum) * stiff;
  for (let i = 0; i < n; i++) {
    const p = parts[ring[i]];
    p.x += s * p.invMass * gx[i];
    p.y += s * p.invMass * gy[i];
  }
}

// Cheap blob-vs-blob collision: keep centers apart and add a soft contact
// impulse on the perimeter so they pile and jostle.
function collideCreatures(world: World): void {
  const cs = world.creatures;
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i];
    const ca = a.parts[0];
    for (let j = i + 1; j < cs.length; j++) {
      const b = cs[j];
      const cb = b.parts[0];
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      const minD = a.radius + b.radius;
      if (d < minD) {
        const overlap = (minD - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        // separate centers and nearest ring points softly
        ca.x -= nx * overlap * 0.5;
        ca.y -= ny * overlap * 0.5;
        cb.x += nx * overlap * 0.5;
        cb.y += ny * overlap * 0.5;
        for (const p of a.ring.map((k) => a.parts[k])) {
          if ((p.x - cb.x) ** 2 + (p.y - cb.y) ** 2 < b.radius * b.radius) {
            p.x -= nx * overlap * 0.6;
            p.y -= ny * overlap * 0.6;
          }
        }
        for (const p of b.ring.map((k) => b.parts[k])) {
          if ((p.x - ca.x) ** 2 + (p.y - ca.y) ** 2 < a.radius * a.radius) {
            p.x += nx * overlap * 0.6;
            p.y += ny * overlap * 0.6;
          }
        }
        const rel = Math.hypot(ca.vx - cb.vx, ca.vy - cb.vy);
        if (rel > 360) {
          world.collisionPulse = Math.min(
            1.6,
            world.collisionPulse + Math.min(0.35, rel / 4000)
          );
          if (world.lastImpacts.length < 8) {
            world.lastImpacts.push((a.hue + b.hue) * 0.5);
          }
        }
      }
    }
  }
}

function collideBounds(world: World): void {
  const W = world.width;
  const H = world.height;
  const rest = 0.42; // bouncy floor for kid-pleasing bounce
  for (const c of world.creatures) {
    for (const p of c.parts) {
      if (p.x < 6) {
        p.x = 6;
      } else if (p.x > W - 6) {
        p.x = W - 6;
      }
      if (p.y > H - 6) {
        const impact = Math.abs(p.y - p.py);
        p.y = H - 6;
        // reflect via previous position so velocity update bounces
        p.py = p.y + (p.py - p.y) * -rest;
        if (impact > 9 && world.lastImpacts.length < 8) {
          world.collisionPulse = Math.min(
            1.6,
            world.collisionPulse + Math.min(0.3, impact / 90)
          );
          world.lastImpacts.push(c.hue);
        }
      } else if (p.y < 6) {
        p.y = 6;
        p.py = p.y + (p.py - p.y) * -rest;
      }
    }
  }
}

function finalizeVelocities(world: World, dt: number): void {
  const inv = 1 / dt;
  for (const c of world.creatures) {
    for (const p of c.parts) {
      p.vx = (p.x - p.px) * inv;
      p.vy = (p.y - p.py) * inv;
    }
  }
}

// Remove oldest creatures over the cap so perf stays solid.
export function enforceCap(world: World, cap: number): void {
  if (world.creatures.length > cap) {
    world.creatures.splice(0, world.creatures.length - cap);
  }
}
