// rng.ts — deterministic seeded pseudo-randomness for 5976-luminous.
//
// The dream lab forbids Math.random() / Date.now() / new Date(): every run
// must be byte-for-byte reproducible. Every stochastic choice in this piece
// (mote placement, ring radii, reverb impulse noise, bell pitch selection)
// draws from a single mulberry32 stream seeded on the prototype id 0x5976.

/** mulberry32 — tiny, fast, deterministic 32-bit PRNG. Floats in [0, 1). */
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
export const SEED = 0x5976;
