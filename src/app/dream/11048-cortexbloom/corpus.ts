// corpus.ts — the seeded self-demo corpus.
//
// We manufacture ~256 timbre vectors in R^12 so the SOM has REAL structure to
// discover. Five "timbre archetypes" (bright / dark / hollow / buzzy / bell)
// are defined as base band-energy profiles; the corpus is then built by
// sampling archetypes, interpolating between pairs, and adding seeded jitter.
// Every vector is L2-normalised. No Math.random, no files — pure seeded RNG.

export const B = 12; // feature bands per vector

/** Deterministic PRNG. Same seed → same corpus, every run. */
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

// Five archetypal band-energy profiles across the 12 bands (low → high).
const ARCHETYPES: number[][] = [
  // bright: energy climbing into the highs
  [0.05, 0.06, 0.08, 0.1, 0.14, 0.2, 0.3, 0.45, 0.6, 0.78, 0.9, 1.0],
  // dark: energy hugging the lows
  [1.0, 0.9, 0.72, 0.55, 0.38, 0.26, 0.17, 0.11, 0.07, 0.05, 0.04, 0.03],
  // hollow: energy at the extremes, scooped middle (odd-partial feel)
  [0.9, 0.7, 0.35, 0.14, 0.08, 0.06, 0.06, 0.08, 0.16, 0.4, 0.7, 0.95],
  // buzzy: broad, dense, high-mid heavy
  [0.4, 0.5, 0.62, 0.75, 0.85, 0.92, 0.9, 0.8, 0.66, 0.5, 0.36, 0.24],
  // bell-like: sparse inharmonic peaks
  [0.15, 0.9, 0.1, 0.08, 0.7, 0.06, 0.05, 0.55, 0.05, 0.04, 0.35, 0.06],
];

export const ARCHETYPE_NAMES = ["bright", "dark", "hollow", "buzzy", "bell"];

function l2normalise(v: number[]): Float32Array {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/**
 * Build the corpus. `count` vectors in R^12, each L2-normalised.
 * ~65% are a single archetype + jitter; the rest interpolate two archetypes so
 * the map discovers smooth gradients between the clusters, not just islands.
 */
export function buildCorpus(seed = 0x11048, count = 256): Float32Array[] {
  const rng = mulberry32(seed);
  const corpus: Float32Array[] = [];
  const K = ARCHETYPES.length;

  for (let n = 0; n < count; n++) {
    const raw = new Array(B).fill(0);
    if (rng() < 0.65) {
      // single archetype
      const a = ARCHETYPES[Math.floor(rng() * K)];
      for (let b = 0; b < B; b++) raw[b] = a[b];
    } else {
      // interpolate a pair
      const i = Math.floor(rng() * K);
      let j = Math.floor(rng() * K);
      if (j === i) j = (j + 1) % K;
      const t = rng();
      const a = ARCHETYPES[i];
      const c = ARCHETYPES[j];
      for (let b = 0; b < B; b++) raw[b] = a[b] * (1 - t) + c[b] * t;
    }
    // seeded jitter
    for (let b = 0; b < B; b++) {
      raw[b] += (rng() - 0.5) * 0.12;
      if (raw[b] < 0) raw[b] = 0;
    }
    corpus.push(l2normalise(raw));
  }
  return corpus;
}
