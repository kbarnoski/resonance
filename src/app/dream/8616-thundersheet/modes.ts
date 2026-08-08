// Shared plate-mode roster + deterministic RNG for the thunder sheet.
//
// A real thin metal plate has INHARMONIC modes — its partials are not integer
// multiples of a fundamental. We craft a stretched, jittered set (exponent > 1
// gives the stiff-plate "stretch" that reads as metal, not string). Each mode
// carries BOTH its acoustic identity (frequency, damping, how strongly external
// drive feeds it) AND its spatial identity on the visible sheet (mode numbers
// nx/ny, visual amplitude, wobble rate) so audio.ts and gl.ts stay in lockstep.

export const NM = 14;

/** Deterministic PRNG. Seed a fixed constant — never Math.random(). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED = 0x7355c0de;

export type PlateMode = {
  /** acoustic partial frequency (Hz) — inharmonic across the bank */
  f: number;
  /** per-second energy damping rate (highs ring down faster) */
  damp: number;
  /** how strongly external "drive" injects into this mode (highs get almost
   *  nothing directly — they only light up via nonlinear cascade) */
  drive: number;
  /** audible output weight (tame the piercing top a little) */
  out: number;
  /** biquad resonance sharpness */
  q: number;
  /** spatial mode numbers on the sheet (higher index -> finer ripple) */
  nx: number;
  ny: number;
  /** visual displacement weight (low modes are the big floppy buckle) */
  amp: number;
  /** visual wobble rate (rad/s) — slow enough to actually see */
  omega: number;
  /** static phase offset so modes don't all peak together */
  phase: number;
};

/** Build the roster once from a fixed seed (pure + deterministic). */
export function buildModes(): PlateMode[] {
  const rng = mulberry32(SEED);
  const modes: PlateMode[] = [];
  for (let i = 0; i < NM; i++) {
    const jf = 1 + (rng() - 0.5) * 0.08; // +-4% frequency jitter
    const f = 44 * Math.pow(i + 1, 1.52) * jf; // stretched inharmonic series
    const damp = 0.55 + i * 0.5 + rng() * 0.15; // highs damp faster
    const drive = Math.exp(-i * 0.52); // drive feeds the low end
    const out = 0.95 / (1 + i * 0.16);
    const q = 9 + i * 2.4;
    const nx = 1 + Math.floor(i * 0.55 + rng() * 0.6);
    const ny = 1 + Math.floor(i * 0.85 + rng() * 0.6);
    const amp = 1 / (1 + i * 0.62);
    const omega = 0.7 + i * 0.28 + rng() * 0.2;
    const phase = rng() * Math.PI * 2;
    modes.push({ f, damp, drive, out, q, nx, ny, amp, omega, phase });
  }
  return modes;
}

/** Index at/above which a mode counts as a "high" (shimmer/storm) mode. */
export const HIGH_START = 7;

/** The discoverable crash threshold: once a low mode's energy climbs past this,
 *  the nonlinear coupling starts pumping energy up the ladder. */
export const CRASH_THRESHOLD = 0.34;
