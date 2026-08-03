// rng.ts — deterministic, seeded randomness.
//
// The whole search is reproducible: every candidate the evolutionary
// strategy samples comes from mulberry32, never `Math.random()`. Two runs
// with the same seed sample the same swarm and converge identically.

/** mulberry32 — tiny, fast, well-distributed 32-bit PRNG. Returns a
 *  function yielding floats in [0,1). */
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

/** One standard-normal sample via Box–Muller, drawn from a seeded uniform
 *  source so the ES population stays deterministic. */
export function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
