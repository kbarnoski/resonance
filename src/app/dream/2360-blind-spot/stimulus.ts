// ─────────────────────────────────────────────────────────────────────────────
// stimulus.ts — the Motion-Induced-Blindness geometry + seeded fade schedule.
//
//   Pure data & math, no React, no DOM. Everything the SVG renderer and the
//   report state-machine need to place the rotating blue grid, position the
//   warm target dots on BOTH cardinal and oblique meridians, and drive the
//   deterministic "auto-fade" demo without ever touching Math.random / Date.now.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG. Seeded once with 0x2360 so the demo is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SVG coordinate space — a square viewBox, fixation at the centre. */
export const VIEW = 1000;
export const CENTER = VIEW / 2;
export const TARGET_RADIUS = 320; // distance of each target from fixation
export const DOT_R = 22; // drawn radius of a target dot

export type Meridian = "cardinal" | "oblique";

export interface Target {
  id: number; // 1..6, matches the number key that toggles it
  angleDeg: number; // 0 = east, CCW positive
  meridian: Meridian; // cardinal (H/V) vs oblique (diagonal)
  freq: number; // Hz — this dot's sustained partial in the chord
  cx: number; // resolved SVG x
  cy: number; // resolved SVG y
}

// Warm additive chord over an A2 root. Six soft partials, one per target.
// Stacked so the full field reads as a calm, consonant pad and each removal is
// audible as a distinct thinning rather than a beat.
const CHORD_HZ = [110, 165, 220, 275, 330, 440];

// Three dots on cardinal meridians (up / right / left) and three on obliques.
// The 2024 anisotropy result (PMC11557702) predicts the obliques fade sooner &
// longer under real fixation — the layout lets an attentive viewer notice that.
const LAYOUT: Array<{ angleDeg: number; meridian: Meridian }> = [
  { angleDeg: 90, meridian: "cardinal" }, // up
  { angleDeg: 0, meridian: "cardinal" }, // right
  { angleDeg: 180, meridian: "cardinal" }, // left
  { angleDeg: 45, meridian: "oblique" }, // up-right
  { angleDeg: 135, meridian: "oblique" }, // up-left
  { angleDeg: 315, meridian: "oblique" }, // down-right
];

export const TARGETS: Target[] = LAYOUT.map((l, i) => {
  const rad = (l.angleDeg * Math.PI) / 180;
  return {
    id: i + 1,
    angleDeg: l.angleDeg,
    meridian: l.meridian,
    freq: CHORD_HZ[i],
    // SVG y grows downward, so negate the sin term to make 90° point up.
    cx: CENTER + Math.cos(rad) * TARGET_RADIUS,
    cy: CENTER - Math.sin(rad) * TARGET_RADIUS,
  };
});

/** A single "+" cross of the background grid, as two line endpoints. */
export interface GridCross {
  x: number;
  y: number;
}

/**
 * Lattice of blue crosses covering more than the viewBox so the corners stay
 * filled while the whole group slowly rotates about the centre. Generated once.
 */
export function buildGrid(spacing = 120, arm = 16): {
  crosses: GridCross[];
  arm: number;
} {
  const crosses: GridCross[] = [];
  const reach = VIEW * 0.86; // cover the rotated half-diagonal
  for (let x = CENTER - reach; x <= CENTER + reach + 1; x += spacing) {
    for (let y = CENTER - reach; y <= CENTER + reach + 1; y += spacing) {
      crosses.push({ x, y });
    }
  }
  return { crosses, arm };
}

// ── Seeded auto-fade schedule ────────────────────────────────────────────────
// The honest stand-in for real MIB during a silent 06:30 phone review: a viewer
// who taps nothing still watches dots vanish & return and hears the chord thin &
// re-bloom. Obliques are biased to fade more often and stay gone longer.

export interface FadeState {
  seen: boolean; // demo's current subjective verdict for this dot
  nextFlipMs: number; // perf-time at which it flips
}

/** Initialise one scheduler slot per target (all start visible/seen). */
export function initSchedule(targets: Target[], startMs: number): FadeState[] {
  const rng = mulberry32(0x2360);
  return targets.map((t) => ({
    seen: true,
    // stagger the first disappearance so they don't all vanish at once
    nextFlipMs: startMs + 1400 + rng() * 3600 * (t.meridian === "oblique" ? 0.7 : 1),
  }));
}

/**
 * Advance the seeded schedule to `nowMs`, flipping any dot whose timer elapsed.
 * Mutates `states` in place; returns nothing. Uses one shared PRNG so the whole
 * run is a pure function of the 0x2360 seed and elapsed perf-time.
 */
const scheduleRng = mulberry32(0x2360 ^ 0x9e37);
export function stepSchedule(
  states: FadeState[],
  targets: Target[],
  nowMs: number
): void {
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (nowMs < s.nextFlipMs) continue;
    s.seen = !s.seen;
    const oblique = targets[i].meridian === "oblique";
    let dur: number;
    if (s.seen) {
      // time visible before the next fade — obliques get shorter visible spells
      dur = (2600 + scheduleRng() * 4200) * (oblique ? 0.65 : 1.25);
    } else {
      // time spent faded — obliques stay gone noticeably longer
      dur = (1600 + scheduleRng() * 2600) * (oblique ? 1.7 : 0.85);
    }
    s.nextFlipMs = nowMs + dur;
  }
}
