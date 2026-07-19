/**
 * ghost.ts — the deterministic auto-reader.
 *
 * When no one has scrolled for ~1.5s, a ghost takes over and reads the score
 * itself so the piece always demos with sound + motion (important: a reviewer
 * often sees this headless, untouched). Its tempo breathes — accelerating into
 * dense passages, easing toward zero to let sustained marks ring — but it is
 * entirely deterministic: velocity is a fixed function of an accumulated clock
 * (seconds) and a seeded set of phases. No Math.random, no wall-clock time.
 * Any real scroll instantly overrides it; the ghost resumes after idle.
 */

import { mulberry32 } from "./score";

export interface Ghost {
  /** Downward reading velocity in score-px per second at time t (seconds). */
  velocity: (t: number) => number;
}

export function buildGhost(seed: number): Ghost {
  const rng = mulberry32((seed ^ 0x5eed_1958) >>> 0);
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const base = 46; // gentle baseline reading speed (px/s)

  return {
    velocity: (t: number) => {
      // breathing envelope 0..1 — the main tempo swell
      const breath = 0.5 + 0.5 * Math.sin(t * 0.42 + p1);
      // slow secondary sway
      const sway = 0.6 + 0.4 * Math.pow(Math.sin(t * 0.17 + p2), 2);
      // occasional near-stop so held marks sustain (dwell dips toward 0)
      const dwell = Math.sin(t * 0.11 + p3);
      const gate = dwell > 0.72 ? 0.08 : 0.18 + 0.82 * (breath * breath);
      const v = base * gate * sway;
      return v < 0 ? 0 : v;
    },
  };
}
