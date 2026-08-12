// ─────────────────────────────────────────────────────────────────────────────
// rng.ts — the ONE sanctioned source of randomness for Tideglass.
//
//   A tiny deterministic mulberry32 PRNG. The whole point of this instrument is
//   reproducibility: a recorded gesture must replay to the exact same wake +
//   sound, and the seeded "ghost hand" auto-conductor must trace the exact same
//   loop every run so the muted-phone morning review is byte-identical.
//
//   Math.random / Date.now / argless `new Date()` are BANNED in this folder
//   (the build's lint/rng discipline forbids them). Time always comes from
//   `performance.now()`; every random draw comes from here.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic 32-bit PRNG. Same seed → same stream, forever. */
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

/** The canonical seed for this prototype (slug 10376). */
export const TIDEGLASS_SEED = 0x10376;
