// ─────────────────────────────────────────────────────────────────────────────
// 11792-snakevoid · prng.ts — deterministic randomness + tiny math helpers.
//
//   NOTHING in this prototype calls Math.random(), Date.now(), or argless
//   new Date(). All "chance" (ring offsets, the self-driving breath LFOs) comes
//   from mulberry32 seeded on SEED; all time comes from performance.now() deltas
//   / the rAF timestamp. Two visits — and the muted-phone self-demo — breathe the
//   SAME breath and drift the SAME drift. Reproducible by construction.
// ─────────────────────────────────────────────────────────────────────────────

/** The one seed the whole piece derives its randomness from. */
export const SEED = 0x11792;

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

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
