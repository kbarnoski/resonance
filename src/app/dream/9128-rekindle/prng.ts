/**
 * Deterministic PRNG for `9128-rekindle`.
 *
 * The whole piece is seeded so the auto-run demo, the reharmonization
 * choices and any tie-breaks are reproducible frame-for-frame. NEVER use
 * `Math.random()` or `Date.now()` anywhere in this prototype — timing comes
 * from `performance.now()` / `AudioContext.currentTime`, and every stochastic
 * decision draws from a `mulberry32` stream seeded with 0x9128.
 */

export const SEED = 0x9128;

/** Classic mulberry32 — fast, seedable, returns a float in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer in [0, n) from a mulberry32 stream. */
export function randInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

/** Deterministic pick from a non-empty array. */
export function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length) % xs.length];
}
