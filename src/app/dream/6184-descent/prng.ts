// prng.ts — deterministic, seeded randomness.
//
// Every "random" value in this piece — the synthetic singer's drift phases,
// the descent's exploration kicks — is drawn from mulberry32, never
// `Math.random()`. Same seed → same duet, byte for byte. The canonical seed
// for this prototype is 0x6184.

/** mulberry32 — tiny, fast, well-distributed 32-bit PRNG. Returns a function
 *  that yields floats in [0,1). */
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
