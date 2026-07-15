/**
 * Shared deterministic DSP + math helpers for the Fracture prototype.
 *
 * DETERMINISM CONTRACT: nothing here calls Math.random / Date.now /
 * performance.now. Randomness comes only from a fixed-seed mulberry32.
 */

/** Fixed-seed PRNG. Same seed → same stream on every machine. */
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

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** MIDI note number → frequency in Hz. */
export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Grit slider (0..1) mapped to the crusher's two headline parameters. */
export interface GritParams {
  bits: number; // effective bit-depth (12 → 2)
  hold: number; // sample-hold length in input samples (1 → 24)
  wet: number; // dry/wet blend for the crushed signal (0.35 → 1)
}

export function gritToParams(grit: number): GritParams {
  const g = clamp(grit, 0, 1);
  // ease the curve so the low end still bites a little
  const e = g * g * (3 - 2 * g); // smoothstep
  return {
    bits: lerp(12, 2, e),
    hold: Math.max(1, Math.round(lerp(1, 24, e))),
    wet: lerp(0.35, 1, e),
  };
}

/**
 * Three coarse spectral bands (0..1) from an AnalyserNode's byte FFT.
 * Returns zeros gracefully when the context is suspended (all-zero FFT).
 */
export interface Bands {
  bass: number;
  mid: number;
  high: number;
}

export function readBands(freq: Uint8Array): Bands {
  const n = freq.length;
  if (n === 0) return { bass: 0, mid: 0, high: 0 };
  const loEnd = Math.max(1, Math.floor(n * 0.08));
  const midEnd = Math.max(loEnd + 1, Math.floor(n * 0.4));
  let bass = 0;
  let mid = 0;
  let high = 0;
  for (let i = 0; i < loEnd; i++) bass += freq[i];
  for (let i = loEnd; i < midEnd; i++) mid += freq[i];
  for (let i = midEnd; i < n; i++) high += freq[i];
  bass /= loEnd * 255;
  mid /= (midEnd - loEnd) * 255;
  high /= (n - midEnd) * 255;
  return { bass, mid, high };
}
