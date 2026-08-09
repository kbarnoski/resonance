// prng.ts — deterministic seeded randomness. The whole piece (initial geometry
// jitter, the auto-breeze that plays the structure while muted, the Karplus
// noise bursts) is driven from THIS generator seeded with 0x8952. Nothing here
// calls Math.random() or Date.now(), so every load is bit-for-bit identical.

/** Classic mulberry32 — tiny, fast, well-distributed 32-bit PRNG. */
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

/** Seed used everywhere in this prototype. */
export const SEED = 0x8952;
