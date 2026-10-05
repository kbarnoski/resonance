// ─────────────────────────────────────────────────────────────────────────────
// souls.ts — the particle engine's "souls" (presets). Each soul is a force
// law in the simulation shader (particle-engine.ts, `soulForce`) plus the
// staging knobs here: camera, trail persistence, palette. Palettes are
// swappable so a soul can be CAST as a journey lead actor in that journey's
// colours later (setPalette).
//
// Band → attribute map (kinetic EQ law — motion, never brightness):
//   vortex      bass → orbit radius surge + spin dilation · mid → curl drift ·
//               treble → finest dust scatters off the arms
//   smoke       bass → plume lift + field breath · mid → curl speed ·
//               treble → filament shimmer
//   bloom       swell (onsets) → phyllotaxis opens / unfurls · bass → shell
//               breath · mid → petal rotation · treble → shimmer along normals
//   murmuration bass → flock sweep speed · mid → turning curl · treble →
//               edge scatter
// ─────────────────────────────────────────────────────────────────────────────

export type SoulId = "vortex" | "smoke" | "bloom" | "murmuration";

/** Three linear-RGB stops: low band → mid band → high band. */
export interface ParticlePalette {
  low: [number, number, number];
  mid: [number, number, number];
  high: [number, number, number];
}

export interface SoulPreset {
  id: SoulId;
  index: number;
  title: string;
  line: string;
  palette: ParticlePalette;
  /** Trail persistence per 1/60 s frame (0 = none). */
  trail: number;
  /** Camera elevation (radians) and distance. */
  camElev: number;
  camDist: number;
  /** Camera orbit speed (rad/s). */
  camSpin: number;
  /** Overall energy (pre-exposure). */
  intensity: number;
}

export const SOULS: readonly SoulPreset[] = [
  {
    id: "vortex",
    index: 0,
    title: "Vortex",
    line: "a galaxy that breathes with the bass",
    palette: { low: [1.0, 0.55, 0.22], mid: [0.75, 0.42, 1.0], high: [0.45, 0.78, 1.0] },
    trail: 0.5,
    camElev: 0.95,
    camDist: 5.0,
    camSpin: 0.035,
    intensity: 1.0,
  },
  {
    id: "smoke",
    index: 1,
    title: "Smoke of Light",
    line: "a curl-noise current, slow as breath",
    palette: { low: [0.35, 0.3, 1.0], mid: [0.25, 0.85, 0.85], high: [0.95, 0.9, 1.0] },
    trail: 0.72,
    camElev: 0.12,
    camDist: 5.2,
    camSpin: 0.02,
    intensity: 0.75,
  },
  {
    id: "bloom",
    index: 2,
    title: "Fibonacci Bloom",
    line: "a golden-angle flower that opens on swells",
    palette: { low: [1.0, 0.32, 0.45], mid: [1.0, 0.72, 0.3], high: [1.0, 0.95, 0.75] },
    trail: 0.55,
    camElev: 1.2,
    camDist: 3.9,
    camSpin: 0.025,
    intensity: 0.95,
  },
  {
    id: "murmuration",
    index: 3,
    title: "Murmuration",
    line: "a flock of light folding through the dark",
    palette: { low: [0.3, 0.5, 1.0], mid: [0.6, 0.55, 1.0], high: [0.85, 1.0, 0.95] },
    trail: 0.65,
    camElev: 0.25,
    camDist: 4.6,
    camSpin: 0.015,
    intensity: 0.95,
  },
] as const;

export function soulById(id: SoulId): SoulPreset {
  const s = SOULS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown soul ${id}`);
  return s;
}

export function lerpPalette(a: ParticlePalette, b: ParticlePalette, t: number): ParticlePalette {
  const l = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [
    x[0] + (y[0] - x[0]) * t,
    x[1] + (y[1] - x[1]) * t,
    x[2] + (y[2] - x[2]) * t,
  ];
  return { low: l(a.low, b.low), mid: l(a.mid, b.mid), high: l(a.high, b.high) };
}

/** Square texture side for a requested particle count (clamped 64..1024). */
export function texSideFor(count: number): number {
  const side = Math.round(Math.sqrt(Math.max(1, count)));
  return Math.max(64, Math.min(1024, side));
}

/**
 * Luminance governor (WCAG 2.3.1 guard). Given the measured mean displayed
 * luminance and the current exposure, return the next exposure: pulled down
 * when the frame exceeds `cap`, relaxed back toward `base` otherwise, never
 * changing by more than `maxStep` (fraction) per update — so global
 * brightness can only ever drift, never flash.
 */
export function governExposure(
  exposure: number,
  meanLum: number,
  opts: { cap?: number; base?: number; maxStep?: number; min?: number } = {},
): number {
  const cap = opts.cap ?? 0.13;
  const base = opts.base ?? 1;
  const maxStep = opts.maxStep ?? 0.02;
  const min = opts.min ?? 0.15;
  let want = base;
  if (meanLum > cap && meanLum > 1e-6) want = Math.min(base, exposure * (cap / meanLum));
  const ratio = Math.max(1 - maxStep, Math.min(1 + maxStep, want / Math.max(exposure, 1e-6)));
  return Math.max(min, Math.min(base, exposure * ratio));
}
