// ─────────────────────────────────────────────────────────────────────────────
// ink.ts — colour + wet-bleed math for 7992-quillsvg.
//
// Ink lives in the brand violet ramp with a warm bright core. The wet-bleed is
// pure SVG: an feTurbulence → feDisplacementMap (+ feGaussianBlur) filter whose
// displacement scale and blur are driven, per completed layer, by a "wetness"
// curve — high the instant a stroke (re)appears, then settling as it dries.
// ─────────────────────────────────────────────────────────────────────────────

/** Violet ink fill, darker/more saturated as average pressure rises. */
export function inkFill(avgPressure: number): string {
  // violet-400 (#a78bfa) at light pressure → violet-600 (#5b2ec9) at heavy.
  const t = Math.min(1, Math.max(0, avgPressure));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = lerp(0xa7, 0x5b);
  const g = lerp(0x8b, 0x2e);
  const b = lerp(0xfa, 0xc9);
  return `rgb(${r} ${g} ${b})`;
}

/** The warm wet-core stroke colour (violet-100 with a warm bias). */
export const CORE_COLOR = "#f2ecff";

/**
 * Wetness ∈ [0,1] for a layer given its loop phase (0 = just re-inked).
 * Sharp rise then exponential settle, plus a faint always-on breath so even a
 * dried line shimmers a little at its edges.
 */
export function wetness(phase01: number, reduced: boolean): number {
  const settle = Math.exp(-phase01 * (reduced ? 5 : 3.4));
  const breath = 0.12 * (0.5 + 0.5 * Math.sin(phase01 * Math.PI * 2 * 1.5));
  return Math.min(1, settle * 0.88 + breath);
}

/** Displacement scale (paper units) for a given wetness. */
export function bleedScale(wet: number, reduced: boolean): number {
  const max = reduced ? 3.5 : 9;
  return 1.2 + wet * max;
}

/** Gaussian blur stdDeviation for a given wetness. */
export function bleedBlur(wet: number, reduced: boolean): number {
  const max = reduced ? 0.5 : 1.4;
  return 0.25 + wet * max;
}
