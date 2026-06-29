// ─────────────────────────────────────────────────────────────────────────────
// _shared/psych/logpolar.ts — the load-bearing psychedelic-geometry engine.
//
//   PSYCHEDELIC.md §"single most load-bearing finding": ALL psychedelic geometry
//   is one stripe/hexagon pattern seen through a log-polar warp. The retina→V1
//   cortical map is a complex logarithm (Bressloff–Cowan, on Klüver's four
//   "form constants"): concentric circles ↔ vertical cortical stripes, radial
//   spokes ↔ horizontal stripes, spirals ↔ diagonals, lattices ↔ hexagons.
//
//   So: generate plane-wave stripes (or a hex Turing pattern) in *cortical*
//   space, apply the inverse warp (exp) to screen space, and one shader yields
//   tunnels, funnels, spirals and honeycombs. This module is that engine,
//   extracted once so prototypes COMPOSE it instead of re-deriving it. It was
//   re-derived in 1038-form-constant, 1042-hyperspace-bloom, 1044-hyperbolic-
//   bloom; this is the consolidation (JURY 2026-06-29 #3).
//
//   No React, no DOM — pure math + GLSL strings, so any Canvas2D / WebGL2 /
//   WebGPU prototype can import it. The JS functions mirror the GLSL exactly
//   (see logpolar.test.ts) so CPU fallbacks and GPU paths agree.
//
//   Klüver's four form constants:
//     (1) lattices / honeycombs  (2) cobwebs  (3) tunnels / funnels / cones
//     (4) spirals
//   They recur across DMT, LSD, psilocybin, migraine, hypnagogia and flicker —
//   a property of visual cortex, not any drug.
// ─────────────────────────────────────────────────────────────────────────────

export type FormConstant = "tunnel" | "spoke" | "spiral" | "honeycomb";

/** Plane-wave direction (radians, in cortical space) that yields each form
 *  constant under the exp() warp. tunnel = vary with log r (concentric rings);
 *  spoke = vary with theta (radial rays); spiral = diagonal. */
export const FORM_PHI: Record<Exclude<FormConstant, "honeycomb">, number> = {
  tunnel: 0,
  spoke: Math.PI / 2,
  spiral: Math.PI / 4,
};

/** Human labels for UI. */
export const FORM_LABEL: Record<FormConstant, string> = {
  tunnel: "Tunnels / funnels",
  spoke: "Radial spokes",
  spiral: "Spirals",
  honeycomb: "Honeycomb lattice",
};

export const FORM_CONSTANTS: FormConstant[] = ["tunnel", "spoke", "spiral", "honeycomb"];

// ── JS reference implementation (mirrors the GLSL below; tested) ──────────────

/** Screen point (centered, aspect-normalized) → cortical coordinates.
 *  cortex = (log r, theta). r must be > 0. */
export function screenToCortex(x: number, y: number): [number, number] {
  const r = Math.hypot(x, y);
  return [Math.log(Math.max(r, 1e-8)), Math.atan2(y, x)];
}

/** Cortical coordinates → screen point. The inverse warp: r = exp(u). */
export function cortexToScreen(u: number, v: number): [number, number] {
  const r = Math.exp(u);
  return [r * Math.cos(v), r * Math.sin(v)];
}

/** Plane-wave form constant evaluated in cortical space, in [0,1].
 *  phi selects the constant (see FORM_PHI); freq = ring/spoke density;
 *  phase animates (e.g. a slow inward drift = tunnel motion). */
export function formConstant(
  u: number,
  v: number,
  phi: number,
  freq: number,
  phase: number,
): number {
  return 0.5 + 0.5 * Math.sin(freq * (Math.cos(phi) * u + Math.sin(phi) * v) + phase);
}

/** Hexagonal Turing lattice in cortical space → honeycomb under the warp.
 *  Sum of three plane waves at 0°, 60°, 120°, normalized to [0,1]. */
export function honeycomb(u: number, v: number, freq: number, phase: number): number {
  const a = freq * (u) + phase;
  const b = freq * (0.5 * u + 0.8660254 * v) + phase;
  const c = freq * (-0.5 * u + 0.8660254 * v) + phase;
  const s = (Math.cos(a) + Math.cos(b) + Math.cos(c)) / 3; // [-1,1]
  return 0.5 + 0.5 * s;
}

// ── GLSL strings — splice into any fragment/compute shader (WebGL2 or WGSL-ish).
//   These functions are written in GLSL ES 3.00. They are byte-for-byte the same
//   math as the JS above. Drop `LOGPOLAR_GLSL` into your shader prelude, then call
//   formConstantGLSL / honeycombGLSL / cortex helpers. ─────────────────────────

export const LOGPOLAR_GLSL = /* glsl */ `
// --- _shared/psych/logpolar.ts: form-constant / log-polar engine ---
const float TAU_LP = 6.28318530718;

// screen (centered, aspect-normalized) -> cortical (log r, theta)
vec2 screenToCortex(vec2 p) {
  float r = max(length(p), 1e-4);
  return vec2(log(r), atan(p.y, p.x));
}

// cortical -> screen (inverse exp warp)
vec2 cortexToScreen(vec2 c) {
  float r = exp(c.x);
  return vec2(r * cos(c.y), r * sin(c.y));
}

// plane-wave form constant in cortical space, [0,1]
// phi: 0=tunnels, PI/2=spokes, PI/4=spirals
float formConstant(vec2 c, float phi, float freq, float phase) {
  return 0.5 + 0.5 * sin(freq * (cos(phi) * c.x + sin(phi) * c.y) + phase);
}

// hexagonal lattice in cortical space -> honeycomb under warp, [0,1]
float honeycomb(vec2 c, float freq, float phase) {
  float a = freq * c.x + phase;
  float b = freq * (0.5 * c.x + 0.8660254 * c.y) + phase;
  float d = freq * (-0.5 * c.x + 0.8660254 * c.y) + phase;
  return 0.5 + 0.5 * (cos(a) + cos(b) + cos(d)) / 3.0;
}
`;

/** A small preset: the phi angle + label for a named form constant. */
export function formPreset(name: FormConstant): { phi: number; label: string } {
  return {
    phi: name === "honeycomb" ? FORM_PHI.tunnel : FORM_PHI[name],
    label: FORM_LABEL[name],
  };
}
