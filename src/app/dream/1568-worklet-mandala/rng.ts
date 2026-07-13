// Deterministic PRNG + helpers. No nondeterministic entropy anywhere here —
// every "random" value flows from a fixed seed so the mandala is byte-identical
// on every mount and in a headless container.

/** mulberry32 — tiny, fast, well-distributed 32-bit seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed base seed for the whole piece. */
export const SEED = 0x1568c0de;

/** Uniform in [lo, hi). */
export function rangeOf(rng: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}
