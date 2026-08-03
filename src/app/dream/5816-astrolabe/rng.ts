// ─────────────────────────────────────────────────────────────────────────────
// 5816-astrolabe · deterministic randomness
//
// A single self-contained mulberry32 PRNG. Everything "random" in this
// prototype — background starfield placement, azimuth jitter, the auto-demo's
// melodic walk, the plucked-string excitation noise — is drawn from a
// fixed-seed instance of this. No Math.random / Date.now / new Date anywhere.
// ─────────────────────────────────────────────────────────────────────────────

export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth 0→1 ramp used for glow falloff and eased motion. */
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
