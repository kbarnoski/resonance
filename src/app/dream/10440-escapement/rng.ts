// ─────────────────────────────────────────────────────────────────────────────
// rng.ts — the ONE sanctioned source of randomness for Escapement.
//
//   A tiny deterministic mulberry32 PRNG. A mechanical clock is the opposite of
//   chance: the same seed must produce the same auto-conductor gesture and the
//   same noise texture every run, so a MUTED phone left on the bench ticks the
//   exact same polyrhythm each morning.
//
//   Math.random / Date.now / argless `new Date()` are BANNED in this folder (the
//   build's lint/rng discipline forbids them). Time always comes from
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

/** The canonical seed for this prototype (slug 10440). */
export const ESCAPEMENT_SEED = 0x10440;
