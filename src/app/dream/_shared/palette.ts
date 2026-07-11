/**
 * Canonical generative-art palette for the dream lab.
 *
 * Every prototype's canvas / WebGL / shader color language should draw from
 * THIS module rather than inventing its own hex values — that shared source is
 * what makes 548 distinct pieces read as one product (see
 * `docs/design-system.md` §6). The ramp is the Resonance violet accent
 * (hue ~270) plus its analogous indigo→magenta neighbors and a neutral
 * luminance scale. No off-brand hues (coral, amber/gold, green, full rainbow).
 *
 * Use hex/rgb strings for Canvas2D fills, and the normalized `vec3` triples or
 * `PALETTE_GLSL` snippet for shaders. Vary pieces by LUMINANCE and MOTION, not
 * by jumping to foreign hues.
 */

/** The one sanctioned pure black — full-bleed art/player canvas base only. */
export const ART_BLACK = "#000000";

/** Violet accent ramp (dark → light), anchored on the brand primary #8B5CF6. */
export const VIOLET = {
  950: "#0b0713", // near-black violet wash — backdrops
  900: "#150c26",
  800: "#241147",
  700: "#3a1d78",
  600: "#5b2ec9",
  500: "#8b5cf6", // brand primary (Tailwind violet-500)
  400: "#a78bfa",
  300: "#c4b5fd", // soft highlight
  200: "#ddd6fe",
  100: "#ede9fe",
} as const;

/** Analogous neighbors — use sparingly for depth, never as a competing accent. */
export const INDIGO = "#6366f1"; // cooler side (hue ~245)
export const MAGENTA = "#b043e0"; // warmer side (hue ~300)

/** Neutral luminance scale (grayscale, faintly cool) for structure + text. */
export const NEUTRAL = {
  0: "#000000",
  50: "#0a0a0b",
  100: "#141416",
  200: "#1e1e22",
  400: "#4b4b52",
  600: "#8a8a93",
  800: "#c9c9d0",
  1000: "#fafafa",
} as const;

/** Ordered gradient stops for spectra / ramps that need a full sweep. */
export const ART_GRADIENT = [
  VIOLET[950],
  VIOLET[800],
  INDIGO,
  VIOLET[500],
  MAGENTA,
  VIOLET[300],
] as const;

/** Normalized [r,g,b] 0–1 triples for shader uniforms. */
export const VIOLET_VEC3 = {
  deep: [0.043, 0.027, 0.075] as [number, number, number], // 950
  mid: [0.545, 0.361, 0.965] as [number, number, number], // 500
  light: [0.769, 0.71, 0.992] as [number, number, number], // 300
  indigo: [0.388, 0.4, 0.945] as [number, number, number],
  magenta: [0.69, 0.263, 0.878] as [number, number, number],
};

/** Drop-in GLSL helper: palette(t) sweeps the canonical ramp for t in [0,1]. */
export const PALETTE_GLSL = /* glsl */ `
vec3 dreamPalette(float t) {
  vec3 deep    = vec3(0.043, 0.027, 0.075);
  vec3 indigo  = vec3(0.388, 0.400, 0.945);
  vec3 violet  = vec3(0.545, 0.361, 0.965);
  vec3 magenta = vec3(0.690, 0.263, 0.878);
  vec3 light   = vec3(0.769, 0.710, 0.992);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(deep, indigo, t / 0.33);
  if (t < 0.66) return mix(indigo, violet, (t - 0.33) / 0.33);
  return mix(violet, mix(magenta, light, (t - 0.66) / 0.34), 1.0);
}
`;

/** Random on-palette hue for particle systems — stays in the violet arc. */
export function dreamHue(seed = Math.random()): string {
  const stops = ART_GRADIENT;
  return stops[Math.floor(seed * stops.length) % stops.length];
}
