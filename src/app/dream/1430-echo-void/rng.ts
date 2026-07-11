// ─────────────────────────────────────────────────────────────────────────────
// rng.ts — deterministic PRNG for 1430-echo-void.
//
//   Everything seeded (cathedral geometry, idle-ping jitter) runs through this so
//   the unseen space is IDENTICAL every load. Math.random() and Date.now()/new
//   Date() are banned in this environment (non-deterministic + flagged), so this
//   is the ONLY source of "randomness" in the piece.
// ─────────────────────────────────────────────────────────────────────────────

/** mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Returns a function
 *  yielding floats in [0,1). */
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

/** The constant seed for this prototype's hidden cathedral. */
export const ECHO_SEED = 0x1430ec0;
