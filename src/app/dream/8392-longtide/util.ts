// 8392-longtide · util.ts
// Small deterministic helpers shared by the sim, the audio engine and the
// virtual traveller. No React, no side effects.

export const TAU = Math.PI * 2;

/** Deterministic PRNG (Mulberry32). Seed the whole piece from 0x8392 so the
 *  auto-demo replays identically on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ── The five movements ──────────────────────────────────────────────────────
export const MOVEMENT_NAMES = [
  "Stillness",
  "Bloom",
  "Turbulence",
  "Recollection",
  "Dissolution",
] as const;

export type MovementName = (typeof MOVEMENT_NAMES)[number];

/** Total journey length and per-movement length (seconds). ~10 minutes. */
export const MOVEMENT_SEC = 120;
export const JOURNEY_SEC = MOVEMENT_SEC * MOVEMENT_NAMES.length; // 600s

export function movementIndex(t: number): number {
  return clamp(Math.floor(t / MOVEMENT_SEC), 0, MOVEMENT_NAMES.length - 1);
}

/** Progress 0..1 within the current movement. */
export function movementPhase(t: number): number {
  const i = movementIndex(t);
  return clamp((t - i * MOVEMENT_SEC) / MOVEMENT_SEC, 0, 1);
}
