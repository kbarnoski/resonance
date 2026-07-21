// Deterministic PRNG for 2100-veil-cathedral.
//
// mulberry32 — a fast, well-distributed 32-bit generator. Seeded once at setup
// so the point-field layout and the generative carrier's note sequence are
// perfectly reproducible (and identical headless). Never call this inside the
// per-frame render/audio loop with a fresh seed — build all randomness up front.

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

/** Fixed master seed — change this and the whole cathedral re-rolls identically. */
export const VEIL_SEED = 0x5eed_ca7;
