// ── The score: an S×S ruleset you author and breed ──────────────────────────
//
// The interaction matrix IS the composition. These pure helpers let a human
// (or the virtual author) sculpt it, save it to a gene pool, and cross two
// saved rulesets into offspring — Dawkins' "Biomorphs" / Sims' evolved
// creatures translated to a force field.

import { S } from "./sim";

// Deterministic PRNG (mulberry32) so the self-demo is reproducible.
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

export function makeRandomMatrix(rng: () => number): Float32Array {
  const m = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) m[i] = rng() * 2 - 1;
  return m;
}

export const clampCell = (v: number) => Math.max(-1, Math.min(1, v));

// Crossover + mutation: per-cell pick from parent A or B, then jitter a few
// cells. This is the compositional move — evolving rulesets you like.
export function breedMatrices(
  a: Float32Array,
  b: Float32Array,
  rng: () => number,
): Float32Array {
  const child = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) child[i] = rng() < 0.5 ? a[i] : b[i];
  const mutations = 2 + Math.floor(rng() * 3); // 2..4 mutated cells
  for (let k = 0; k < mutations; k++) {
    const i = Math.floor(rng() * S * S);
    child[i] = clampCell(child[i] + (rng() * 2 - 1) * 0.5);
  }
  return child;
}

// Diverging heatmap for the editor: violet = attract (+), red = repel (−),
// near-zero fades to a neutral slate. Art-only ramp (house palette allows a
// violet↔red diverging ramp inside the canvas / matrix art).
export function cellColor(v: number): string {
  const t = clampCell(v);
  const mag = Math.abs(t);
  // neutral base (dark slate) → target hue, brightness rises with magnitude
  const base = 26;
  if (t >= 0) {
    // toward violet 139,92,246
    const r = Math.round(base + (139 - base) * mag);
    const g = Math.round(base + (92 - base) * mag);
    const bl = Math.round(base + (246 - base) * mag);
    return `rgb(${r},${g},${bl})`;
  }
  // toward red 239,68,68
  const r = Math.round(base + (239 - base) * mag);
  const g = Math.round(base + (68 - base) * mag);
  const bl = Math.round(base + (68 - base) * mag);
  return `rgb(${r},${g},${bl})`;
}

// Per-species art colors (RGB 0..1), shared by points + editor headers.
export const SPECIES_RGB: ReadonlyArray<[number, number, number]> = [
  [0.55, 0.7, 1.0], // periwinkle
  [0.78, 0.55, 0.99], // violet
  [0.99, 0.55, 0.82], // pink
  [0.55, 0.95, 0.86], // aqua
  [0.99, 0.78, 0.5], // warm sand
];

// C major pentatonic: C D E G A
export const SPECIES_HZ = [261.63, 293.66, 329.63, 392.0, 440.0];
export const SPECIES_NOTE = ["C", "D", "E", "G", "A"];
