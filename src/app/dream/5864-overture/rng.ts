// Deterministic RNG for the Overture prototype.
//
// Every random choice in this piece flows through mulberry32 so that a
// given seed always renders the exact same 6-minute journey. We NEVER call
// Math.random() / Date.now() / new Date() anywhere in the logic.
// performance.now() is used only for animation timing, never for content.

/** mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. */
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

/** Combine several integers into one 32-bit seed (order matters). */
export function hashSeed(...nums: number[]): number {
  let h = 0x811c9dc5;
  for (const n of nums) {
    h ^= n | 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
