// Deterministic PRNG for 1578 — Dream Jump.
// mulberry32: a tiny, fast, well-distributed seedable generator.
// The whole piece derives every "random" value from these streams so that
// a given seed always reproduces the exact same dream-scene. No nondeterministic
// randomness and no wall-clock entropy anywhere in this prototype.

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
