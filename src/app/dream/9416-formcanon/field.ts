// field.ts — the geometry state-space for Form Canon.
//
// Klüver's four form constants (tunnel · spoke · spiral · honeycomb) are the
// EMPIRICAL taxonomy of flicker/bright-light entoptic geometry — recently
// CV-mapped at scale (bioRxiv 2026.02.18.705710) and long understood as images
// of plane-wave cortical activity under the retina→V1 log-polar map
// (Klüver 1926; Bressloff–Cowan–Golubitsky–Thomas 2002). Every prior lab piece
// rendered ONE constant reacting to sound. Here the four are the corners of a
// continuous 2D space you steer a cursor through: the rendered field is a
// weighted blend of the four form-constant fields at the cursor, and each
// corner sings its own generative voice.
//
// Deterministic throughout: no Math.random / Date.now. All "randomness" comes
// from mulberry32 seeded with 0x9416; animation time is performance.now().

import {
  type FormConstant,
  FORM_CONSTANTS,
  formConstant,
  honeycomb,
  screenToCortex,
} from "../_shared/visionary/logpolar";

/** Deterministic PRNG. Seed once, reuse — never Math.random(). */
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

/** The seed used everywhere in this prototype. */
export const SEED = 0x9416;

// ── the geometry space ──────────────────────────────────────────────────────
// Four corners of a unit square. The cursor lives in [0,1]²; bilinear weights
// of the four corners give a partition of unity, so the blended field stays in
// [0,1] and morphs continuously between constants.
//
//   spiral (0,1) ───────── honeycomb (1,1)
//        │                      │
//   tunnel (0,0) ───────── spoke (1,0)
//
// Weight order is ALWAYS [tunnel, spoke, spiral, honeycomb] to match
// FORM_CONSTANTS.
export const CORNERS: Array<{ name: FormConstant; x: number; y: number }> = [
  { name: "tunnel", x: 0, y: 0 },
  { name: "spoke", x: 1, y: 0 },
  { name: "spiral", x: 0, y: 1 },
  { name: "honeycomb", x: 1, y: 1 },
];

export type Weights = [number, number, number, number];

/** Bilinear weights of the four corners at cursor (cx,cy) in [0,1]². */
export function cursorWeights(cx: number, cy: number): Weights {
  const x = Math.min(1, Math.max(0, cx));
  const y = Math.min(1, Math.max(0, cy));
  return [
    (1 - x) * (1 - y), // tunnel
    x * (1 - y), // spoke
    (1 - x) * y, // spiral
    x * y, // honeycomb
  ];
}

/** Index of the currently dominant form constant. */
export function dominant(w: Weights): number {
  let best = 0;
  for (let i = 1; i < 4; i++) if (w[i] > w[best]) best = i;
  return best;
}

// The plane-wave direction (radians, cortical space) that yields each of the
// three stripe constants under the exp() warp. honeycomb is a hex lattice.
export const PHI_TUNNEL = 0; // vary with log r  → concentric rings
export const PHI_SPOKE = Math.PI / 2; // vary with theta → radial rays
export const PHI_SPIRAL = Math.PI / 4; // diagonal        → spirals

/** Spatial density of rings / spokes / hex cells (cortical frequency). */
export const FREQ = 6.0;

/** Per-constant base hue (0..1) for the iridescent palette. Blended linearly by
 *  the cursor weights so the color identity shifts as you morph. */
export const REGIME_HUE: Weights = [0.63, 0.86, 0.46, 0.12];

/** Slow, continuous phase drift for each constant (NEVER flicker). `reduce`
 *  halves the rates for prefers-reduced-motion. Returns absolute phases. */
export interface Phases {
  t: number;
  s: number;
  sp: number;
  h: number;
}
export function computePhases(timeSec: number, reduce: boolean): Phases {
  const k = reduce ? 0.4 : 1;
  return {
    t: timeSec * 0.35 * k, // tunnels drift inward
    s: timeSec * 0.16 * k, // spokes rotate slowly
    sp: timeSec * 0.42 * k, // spirals wind
    h: timeSec * 0.12 * k, // honeycomb shimmers
  };
}

/** Linear blend of the four base hues by weights (weights sum to 1). */
export function blendHue(w: Weights): number {
  return w[0] * REGIME_HUE[0] + w[1] * REGIME_HUE[1] + w[2] * REGIME_HUE[2] + w[3] * REGIME_HUE[3];
}

/** CPU reference: the blended form-constant field at a centered, aspect-
 *  normalized screen point. Mirrors the WGSL fragment exactly. Returns [0,1]. */
export function blendField(
  px: number,
  py: number,
  w: Weights,
  freq: number,
  ph: Phases,
): number {
  const [u, v] = screenToCortex(px, py);
  const ft = formConstant(u, v, PHI_TUNNEL, freq, ph.t);
  const fs = formConstant(u, v, PHI_SPOKE, freq, ph.s);
  const fsp = formConstant(u, v, PHI_SPIRAL, freq, ph.sp);
  const fh = honeycomb(u, v, freq, ph.h);
  return w[0] * ft + w[1] * fs + w[2] * fsp + w[3] * fh;
}

// ── shared render params + backend interface ────────────────────────────────
export interface RenderParams {
  w: Weights;
  freq: number;
  phases: Phases;
  time: number;
  bright: number; // slow luminance drift multiplier (never a strobe)
  hueBase: number;
  sat: number;
}

/** GPU and CPU backends both satisfy this. */
export interface Stage {
  readonly backend: "GPU" | "CPU";
  render(p: RenderParams): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

// ── HSV→RGB (shared by the CPU path; the WGSL path has its own copy) ─────────
export function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 1) + 1) % 1;
  const r = Math.abs(hh * 6 - 3) - 1;
  const g = 2 - Math.abs(hh * 6 - 2);
  const b = 2 - Math.abs(hh * 6 - 4);
  const cl = (x: number) => Math.min(1, Math.max(0, x));
  return [
    v * (1 + s * (cl(r) - 1)),
    v * (1 + s * (cl(g) - 1)),
    v * (1 + s * (cl(b) - 1)),
  ];
}

// ── key / note mapping ──────────────────────────────────────────────────────
// A pressed key selects a scale DEGREE (0..4); each of the four regime voices
// plays that degree in its own pool, crossfaded by the cursor weights.
export function keyToDegree(charCode: number): number {
  const r = mulberry32(SEED ^ (charCode * 2654435761));
  return Math.floor(r() * 5) % 5;
}

/** MIDI note number → a scale degree 0..4 (mod for wide keyboards). */
export function midiToDegree(note: number): number {
  return ((note % 5) + 5) % 5;
}

export { FORM_CONSTANTS };
export type { FormConstant };
