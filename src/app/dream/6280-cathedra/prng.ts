// ─────────────────────────────────────────────────────────────────────────────
// prng.ts — deterministic randomness.
//
//   The whole piece is reproducible: nothing here ever calls Math.random(),
//   Date.now(), or new Date(). Time comes from performance.now() / the rAF
//   timestamp; all "chance" comes from these seeded generators. Two visits with
//   the same seed trace the same journey.
// ─────────────────────────────────────────────────────────────────────────────

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

/** Smooth Hermite step in [0,1] between edges e0 and e1. */
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp to [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
