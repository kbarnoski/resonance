// Verlet integration string physics for the wind-harp.
//
// Each string is a vertical chain of point masses (nodes) pinned at the top
// and bottom. Between the pins the nodes are free to swing. We integrate with
// Verlet integration (position-based, no explicit velocity) and then satisfy
// distance constraints with a few relaxation iterations per frame. A gravity
// vector — driven by device tilt — pulls all the free nodes sideways/down so
// tipping the iPad swings the whole row of strings.
//
// Coordinates are in a normalised space where x in [0,1] across the screen and
// y in [0,1] top-to-bottom. Gravity is also in this normalised space.

export interface Node {
  x: number;
  y: number;
  px: number; // previous x (Verlet)
  py: number; // previous y
  pinned: boolean;
}

export interface HarpString {
  nodes: Node[];
  restX: number; // resting x position (the vertical line the string hangs on)
  restY: number; // resting y of the midpoint, used to measure displacement
  segLen: number; // rest length between adjacent nodes
  // swing tracking
  swing: number; // current |displacement| of midpoint from rest (normalised)
  peakSwing: number; // running peak used for pluck detection
  plucking: boolean; // true while above threshold (so we only fire on rising edge)
  refractory: number; // seconds remaining before this string may pluck again
}

export interface HarpConfig {
  count: number; // number of strings
  nodesPerString: number; // chain resolution
  topY: number; // y of the top pin
  botY: number; // y of the bottom pin
  marginX: number; // horizontal margin on each side
}

export function buildHarp(cfg: HarpConfig): HarpString[] {
  const strings: HarpString[] = [];
  const span = 1 - cfg.marginX * 2;
  const height = cfg.botY - cfg.topY;
  const segLen = height / (cfg.nodesPerString - 1);

  for (let s = 0; s < cfg.count; s++) {
    // even spacing across the playable span
    const t = cfg.count === 1 ? 0.5 : s / (cfg.count - 1);
    const x = cfg.marginX + t * span;
    const nodes: Node[] = [];
    for (let i = 0; i < cfg.nodesPerString; i++) {
      const y = cfg.topY + (i / (cfg.nodesPerString - 1)) * height;
      const pinned = i === 0 || i === cfg.nodesPerString - 1;
      nodes.push({ x, y, px: x, py: y, pinned });
    }
    strings.push({
      nodes,
      restX: x,
      restY: cfg.topY + height * 0.5,
      segLen,
      swing: 0,
      peakSwing: 0,
      plucking: false,
      refractory: 0,
    });
  }
  return strings;
}

// One physics step.
//   gx, gy : gravity vector (normalised units / s^2-ish, tuned, not physical)
//   damping: velocity retention (0.96..0.99). Lower = settles faster.
//   stiffness springs each free node gently back toward its resting x so the
//   harp re-centres when the device is held flat.
export function stepHarp(
  strings: HarpString[],
  dt: number,
  gx: number,
  gy: number,
  damping: number,
  iterations: number,
  stiffness: number,
): void {
  const dt2 = dt * dt;

  for (const str of strings) {
    if (str.refractory > 0) str.refractory = Math.max(0, str.refractory - dt);

    // Verlet integrate the free nodes.
    for (const n of str.nodes) {
      if (n.pinned) continue;
      const vx = (n.x - n.px) * damping;
      const vy = (n.y - n.py) * damping;
      n.px = n.x;
      n.py = n.y;
      n.x += vx + gx * dt2;
      n.y += vy + gy * dt2;
      // gentle restoring pull toward the resting vertical line (springiness)
      n.x += (str.restX - n.x) * stiffness;
    }

    // Satisfy distance constraints (relaxation). Keeps the chain coherent.
    for (let k = 0; k < iterations; k++) {
      const nodes = str.nodes;
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const diff = (dist - str.segLen) / dist;
        const offx = dx * 0.5 * diff;
        const offy = dy * 0.5 * diff;
        if (!a.pinned) {
          a.x += offx;
          a.y += offy;
        }
        if (!b.pinned) {
          b.x -= offx;
          b.y -= offy;
        }
      }
    }

    // Measure swing as the horizontal displacement of the midpoint from rest.
    const mid = str.nodes[(str.nodes.length / 2) | 0];
    str.swing = Math.abs(mid.x - str.restX);
    str.peakSwing = Math.max(str.peakSwing, str.swing);
  }
}

// Pluck detection: a string "plucks" when its swing crosses `threshold` on the
// way up and it isn't in a refractory window. Returns the strings that fired
// this frame (with the swing amplitude at the moment of firing) and resets
// their state. The caller maps amplitude -> loudness/brightness.
export interface PluckEvent {
  index: number;
  amplitude: number; // normalised swing at trigger (clamped useful range outside)
}

export function detectPlucks(
  strings: HarpString[],
  threshold: number,
  refractorySec: number,
): PluckEvent[] {
  const events: PluckEvent[] = [];
  for (let i = 0; i < strings.length; i++) {
    const str = strings[i];
    const above = str.swing >= threshold;
    if (above && !str.plucking && str.refractory <= 0) {
      events.push({ index: i, amplitude: str.peakSwing });
      str.plucking = true;
      str.refractory = refractorySec;
    }
    // reset the "plucking" latch only when the string has swung back below a
    // lower hysteresis line, so a single swing fires exactly once.
    if (str.swing < threshold * 0.5) {
      str.plucking = false;
      str.peakSwing = str.swing;
    }
  }
  return events;
}
