// Deterministic PRNG. No Math.random / Date.now anywhere in this prototype —
// every "random" choice (freq jitter, noise fill, ghost material/velocity,
// visual scatter) is drawn from a seeded mulberry32 so the whole piece is
// reproducible and the headless self-demo is identical every run.
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
