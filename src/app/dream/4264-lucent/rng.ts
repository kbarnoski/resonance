// rng.ts — deterministic seeded pseudo-randomness for 4264-lucent.
//
// The dream lab forbids Math.random()/Date.now(): every run must be
// reproducible. All stochastic choices in this piece (synth progression,
// stroke jitter, curl-noise seeding) draw from a mulberry32 stream seeded on
// the prototype id 0x4264.

/** mulberry32 — tiny, fast, deterministic 32-bit PRNG. Returns floats in [0,1). */
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

/** The canonical seed for this prototype. */
export const SEED = 0x4264;
