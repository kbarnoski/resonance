// prng.ts — deterministic randomness for the self-playing pattern.
//
// mulberry32: a tiny, fast, well-distributed 32-bit PRNG. We use it (never
// Math.random) so the drum's unattended "wake" pattern is identical on every
// load — the 06:30 review sees the same gentle performance every morning.

export type Rng = () => number; // returns a float in [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** Integer in [0, n). */
export function int(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}
