// ════════════════════════════════════════════════════════════════════════════
// Goad (2578) — deterministic PRNG
//
// The lab forbids Math.random / Date.now / new Date(). Every stochastic choice
// (the synthetic human, seeded tie-breaks inside the beam search) is driven by
// this hand-written mulberry32 so the auto-demo and every "new dialogue"
// replay bit-for-bit identically. Seed the whole piece from 0x2578.
// ════════════════════════════════════════════════════════════════════════════

/** Classic mulberry32 — 32-bit state, uniform in [0, 1). */
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

/** Integer in [lo, hi] from a generator. */
export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Fold two seeds into one deterministically (for per-phrase substreams). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
