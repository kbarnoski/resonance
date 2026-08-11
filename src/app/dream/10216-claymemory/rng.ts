// rng.ts — the ONE source of randomness for 10216 · Clay Memory.
//
// Determinism is a hard constraint: no Math.random, no Date.now. Every stochastic
// choice (ghost-hand paths, seeded material warmth, audio grain jitter) draws from
// mulberry32 seeded with the prototype number, so a muted phone renders the exact
// same sculpt every load.

export const SEED = 0x10216;

/** mulberry32 — tiny, fast, deterministic 32-bit PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh generator on the shared seed. */
export function clayRng(): () => number {
  return mulberry32(SEED);
}
