// ─────────────────────────────────────────────────────────────────────────────
// 2244-deep-now — rng.ts
//
// A tiny, deterministic PRNG. The self-demo autopilot MUST be reproducible for
// the headless morning reviewer, so nothing in this prototype may touch
// Math.random / Date.now / argless Date. Everything random flows through this
// seeded mulberry32 (fixed literal seed 0x2244 in page.tsx), and everything
// time-related flows through rAF timestamps.
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded mulberry32 PRNG → a function returning floats in [0, 1). */
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

/** Random float in [lo, hi) drawn from a mulberry32 stream. */
export function randRange(rnd: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rnd();
}
