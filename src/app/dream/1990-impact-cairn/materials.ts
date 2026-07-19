// ── Materials ────────────────────────────────────────────────────────────────
// There is NO harmonic model here — no scale, no tuning, no pitch lattice.
// A "material" is purely a recipe for a struck-object TIMBRE: a base frequency
// (arbitrary, not a tuned pitch), a small bank of INHARMONIC modal ratios, an
// excitation colour, and a decay. Four materials differ only in these physical
// characteristics. Timbre + rhythm are the entire compositional material.
//
// The base frequencies are deliberately non-commensurate and every hit gets
// ±4% jitter (see audio.ts) so no stable pitch can ever crystallise, even when
// two layers phase against each other.

export type MaterialId = "droplet" | "ceramic" | "wood" | "stone";

export interface Material {
  id: MaterialId;
  label: string;
  /** Base frequency in Hz — arbitrary, not a tuned pitch. */
  base: number;
  /** Inharmonic modal ratios (never integers → metallic/woody, never chordal). */
  ratios: number[];
  /** Relative amplitude of each mode. */
  weights: number[];
  /** Fundamental decay target in seconds (higher modes fade faster). */
  decay: number;
  /** Low-pass cutoff shaping the excitation noise colour (Hz). */
  exciteCutoff: number;
  /** Excitation burst length in seconds (the "attack"). */
  exciteLen: number;
  /** Ceiling on resonator Q so a hard strike can never blow up. */
  qCap: number;
  /** Per-material output trim. */
  gain: number;
  /** Art colour for the stone in the DOM — near-monochrome graphite/bone. */
  color: string;
  /** Haptic pulse length in ms at full velocity (scaled by velocity). */
  haptic: number;
}

export const MATERIALS: Record<MaterialId, Material> = {
  droplet: {
    id: "droplet",
    label: "droplet",
    base: 928,
    ratios: [1, 2.36, 3.71],
    weights: [1, 0.42, 0.2],
    decay: 0.16,
    exciteCutoff: 7200,
    exciteLen: 0.005,
    qCap: 320,
    gain: 0.85,
    color: "hsl(205 12% 82%)",
    haptic: 10,
  },
  ceramic: {
    id: "ceramic",
    label: "ceramic",
    base: 543,
    ratios: [1, 1.87, 2.53, 3.62, 4.91],
    weights: [1, 0.6, 0.42, 0.28, 0.16],
    decay: 0.6,
    exciteCutoff: 5200,
    exciteLen: 0.007,
    qCap: 360,
    gain: 0.72,
    color: "hsl(38 9% 78%)",
    haptic: 16,
  },
  wood: {
    id: "wood",
    label: "wood",
    base: 301,
    ratios: [1, 1.61, 2.29, 3.11],
    weights: [1, 0.55, 0.3, 0.18],
    decay: 0.24,
    exciteCutoff: 1900,
    exciteLen: 0.009,
    qCap: 120,
    gain: 0.9,
    color: "hsl(28 11% 48%)",
    haptic: 20,
  },
  stone: {
    id: "stone",
    label: "stone",
    base: 151,
    ratios: [1, 1.44, 2.09, 2.71],
    weights: [1, 0.5, 0.3, 0.16],
    decay: 0.34,
    exciteCutoff: 900,
    exciteLen: 0.013,
    qCap: 90,
    gain: 1,
    color: "hsl(220 7% 36%)",
    haptic: 28,
  },
};

/** Fixed cycle order for the material selector and the "change stone" gesture. */
export const ORDER: MaterialId[] = ["droplet", "ceramic", "wood", "stone"];
