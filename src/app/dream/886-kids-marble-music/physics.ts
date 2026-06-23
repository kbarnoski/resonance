// Self-contained 2D physics for the marble run. No libraries.
//
// Marbles are circles. Obstacles are either circles (pegs, bells, drum pads)
// or capsules (a line segment with a radius -> ramps and chime bars).
// Collisions resolve with restitution along the contact normal plus tangential
// friction, and report the normal impact speed so the synth can scale loudness.

import type { Material } from "./synth";

export interface Marble {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  trail: { x: number; y: number }[];
  stuck: boolean; // caught by sticky-mud object
  stuckIn: number; // obstacle index holding it
}

export type ObstacleShape = "circle" | "capsule";

export interface Obstacle {
  shape: ObstacleShape;
  material: Material;
  fundamentalHz: number;
  // circle: (cx,cy,r). capsule: (ax,ay)->(bx,by) with radius r.
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  restitution: number;
  sticky: boolean; // sticky-mud variant traps marbles
  pulse: number; // visual flash 0..1, decays
}

export interface Collision {
  obstacleIndex: number;
  normalSpeed: number; // px/s of approach along normal (>=0)
}

// Closest point on segment AB to point P.
function closestOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, y: ay + aby * t };
}

const MAX_SPEED = 1400; // clamp to keep integration stable

// Advance one marble by dt. gx/gy = gravity vector (rotated by tilt).
// Returns a collision if one fired (for sound), else null.
export function stepMarble(
  m: Marble,
  obstacles: Obstacle[],
  gx: number,
  gy: number,
  dt: number,
  width: number,
): Collision | null {
  if (m.stuck) {
    // Held by sticky mud: only gentle drift, no integration.
    return null;
  }

  m.vx += gx * dt;
  m.vy += gy * dt;

  // Clamp speed.
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > MAX_SPEED) {
    const k = MAX_SPEED / sp;
    m.vx *= k;
    m.vy *= k;
  }

  m.x += m.vx * dt;
  m.y += m.vy * dt;

  // Side walls (soft bounce so marbles don't escape).
  if (m.x < m.r) {
    m.x = m.r;
    m.vx = Math.abs(m.vx) * 0.6;
  } else if (m.x > width - m.r) {
    m.x = width - m.r;
    m.vx = -Math.abs(m.vx) * 0.6;
  }

  let fired: Collision | null = null;

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    let nearX: number;
    let nearY: number;
    if (o.shape === "circle") {
      nearX = o.cx;
      nearY = o.cy;
    } else {
      const c = closestOnSegment(m.x, m.y, o.ax, o.ay, o.bx, o.by);
      nearX = c.x;
      nearY = c.y;
    }

    const dx = m.x - nearX;
    const dy = m.y - nearY;
    const dist = Math.hypot(dx, dy);
    const minDist = m.r + o.r;

    if (dist < minDist) {
      // Normal pointing from obstacle toward marble.
      let nx: number;
      let ny: number;
      if (dist > 0.0001) {
        nx = dx / dist;
        ny = dy / dist;
      } else {
        nx = 0;
        ny = -1;
      }

      // Push the marble out of penetration.
      const pen = minDist - dist;
      m.x += nx * pen;
      m.y += ny * pen;

      // Velocity along normal (negative = approaching).
      const vn = m.vx * nx + m.vy * ny;

      if (vn < 0) {
        const normalSpeed = -vn;

        if (o.sticky) {
          // Sticky mud: trap the marble in place.
          m.vx = 0;
          m.vy = 0;
          m.stuck = true;
          m.stuckIn = i;
        } else {
          // Reflect with restitution along normal, friction on tangent.
          const tvx = m.vx - vn * nx;
          const tvy = m.vy - vn * ny;
          const friction = 0.82;
          m.vx = tvx * friction - vn * o.restitution * nx;
          m.vy = tvy * friction - vn * o.restitution * ny;
        }

        o.pulse = 1;
        // Only report the loudest contact this step.
        if (!fired || normalSpeed > fired.normalSpeed) {
          fired = { obstacleIndex: i, normalSpeed };
        }
      }
    }
  }

  return fired;
}
