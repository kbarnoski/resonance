// ─────────────────────────────────────────────────────────────────────────────
// 11776-lissaknot · prng.ts — deterministic randomness + small math helpers.
//
//   NOTHING in this prototype calls Math.random(), Date.now(), or argless
//   new Date(). All "chance" comes from mulberry32 seeded on SEED; all time
//   comes from performance.now() (the age clock only). Two visits — and the
//   muted-phone self-demo — sing the SAME melody and draw the SAME knots.
// ─────────────────────────────────────────────────────────────────────────────

/** The one seed the whole piece derives its randomness from. */
export const SEED = 0x11776;

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

export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** MIDI note → frequency in Hz. */
export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
