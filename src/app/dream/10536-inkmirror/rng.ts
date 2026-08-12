// ─────────────────────────────────────────────────────────────────────────────
// 10536-inkmirror — rng.ts
//
// A tiny deterministic PRNG. The muted 06:30 phone reviewer must watch the SAME
// self-writing illuminated figure every load, so nothing in this piece may touch
// Math.random / Date.now / argless Date. All randomness flows through this
// seeded mulberry32 (fixed literal seed 0x10536 in page.tsx); everything
// time-related flows through performance.now() and AudioContext.currentTime.
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
