// ─────────────────────────────────────────────────────────────────────────────
// 11840-bodyloom · prng.ts — deterministic randomness + tiny math helpers.
//
//   NOTHING in this prototype calls Math.random(), Date.now(), or argless
//   new Date(). Every phase offset and scripted wobble in the seeded demo dancer
//   is derived from mulberry32 seeded on SEED; all time comes from the rAF
//   timestamp. The muted phone at 06:30 — with no camera and no audio — sees the
//   SAME dancer building the SAME canon. Reproducible by construction.
// ─────────────────────────────────────────────────────────────────────────────

/** The one seed the whole piece derives its determinism from. */
export const SEED = 0x11840;

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

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
