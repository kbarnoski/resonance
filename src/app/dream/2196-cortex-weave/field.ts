// ─────────────────────────────────────────────────────────────────────────────
// 2196 · cortex-weave — field.ts
//
//   Pure-math helpers for the SVG-DOM form-constant instrument. The heavy
//   lifting (log-polar warp + cortical plane waves + hex Turing lattice) lives
//   in the shared engine `_shared/psych/logpolar.ts`; this module only:
//     • lays out a bounded cortical grid and pre-warps it to screen space,
//     • interpolates the single played "form" parameter F across all four
//       Klüver constants (tunnel → spoke → spiral → honeycomb),
//     • samples the blended field at a node,
//     • maps F to a warm phosphene hue,
//     • provides a deterministic mulberry32 PRNG for the seeded autopilot.
//
//   No React, no DOM, no Math.random / Date.now — deterministic.
// ─────────────────────────────────────────────────────────────────────────────

import {
  cortexToScreen,
  formConstant,
  honeycomb,
  FORM_PHI,
} from "../_shared/psych/logpolar";

/** One node of the pre-warped cortical grid. */
export interface GridNode {
  /** cortical log-radius */
  u: number;
  /** cortical angle */
  v: number;
  /** screen x in SVG user units (centered, r = exp(u)) */
  x: number;
  /** screen y in SVG user units */
  y: number;
}

/**
 * Lay out a regular grid in *cortical* space (u = log-radius rows, v = angle
 * columns) and push each node through the inverse warp `cortexToScreen`, so a
 * plain grid becomes a log-polar phosphene lattice on screen. `vOff`/`uOff`
 * fractionally offset the grid (used for the interleaved second harmonic layer).
 */
export function buildGrid(
  uRows: number,
  vCols: number,
  uMin: number,
  uMax: number,
  uOff = 0,
  vOff = 0,
): GridNode[] {
  const nodes: GridNode[] = [];
  const du = (uMax - uMin) / (uRows - 1);
  const dv = (Math.PI * 2) / vCols;
  for (let i = 0; i < uRows; i++) {
    const u = uMin + (i + uOff) * du;
    for (let j = 0; j < vCols; j++) {
      const v = (j + vOff) * dv;
      const [x, y] = cortexToScreen(u, v);
      nodes.push({ u, v, x, y });
    }
  }
  return nodes;
}

/** The interpolated plane-wave direction + honeycomb blend for played F∈[0,1]. */
export interface FormState {
  phi: number;
  /** honeycomb blend weight (0 = pure plane wave, 1 = pure hex lattice) */
  hex: number;
}

/**
 * Map the single played form parameter F∈[0,1] continuously across the four
 * constants: [0,1/3] tunnel→spoke, [1/3,2/3] spoke→spiral, [2/3,1] spiral +
 * honeycomb fading in.
 */
export function formStateFor(F: number): FormState {
  const seg = clamp01(F) * 3;
  if (seg < 1) {
    return { phi: lerp(FORM_PHI.tunnel, FORM_PHI.spoke, seg), hex: 0 };
  }
  if (seg < 2) {
    return { phi: lerp(FORM_PHI.spoke, FORM_PHI.spiral, seg - 1), hex: 0 };
  }
  return { phi: FORM_PHI.spiral, hex: clamp01(seg - 2) };
}

/**
 * Sample the blended form-constant field at a cortical node → [0,1]. Blends the
 * plane-wave form constant with the hex Turing lattice per FormState.
 */
export function sampleForm(
  node: GridNode,
  fs: FormState,
  freq: number,
  phase: number,
): number {
  const wave = formConstant(node.u, node.v, fs.phi, freq, phase);
  if (fs.hex <= 0) return wave;
  const hex = honeycomb(node.u, node.v, freq, phase);
  return wave * (1 - fs.hex) + hex * fs.hex;
}

/**
 * Warm luminous phosphene hue (degrees) for played F. Sweeps gold → amber →
 * magenta → violet, always taking the *warm* path (never through green).
 */
export function hueForF(F: number): number {
  const h = 45 - 130 * clamp01(F);
  return ((h % 360) + 360) % 360;
}

/** Deterministic PRNG — mulberry32, seeded with a fixed constant. */
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

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
