import { SHADER_MEAN_LUMA } from "./shader-brightness.generated";

/** Consistent ~2.5s crossfade for all shader transitions. */
export const SHADER_FADE_DURATION_MS = 2500;

/** BRIGHTNESS-AWARE FADE (Karel 2026-10-12, Snowflake: "a slight jump in color
 *  brightness … at same spot every time"): plasma (mean luma 0.1) → swell (91.8)
 *  in 2.5 s lifted the whole frame ~1 level per frame. A fade to a much brighter
 *  shader now stretches ~1 s per 30 luma of rise, up to 7 s; darker or similar
 *  shaders keep the 2.5 s fade. `from` null = fading in from nothing.
 *  Pure (lives outside visualizer.tsx so the engine's morph-shader timing can
 *  predict the exact fade the visualizer will run). */
export function fadeMsFor(from: string | null | undefined, to: string | null | undefined): number {
  const a = from ? SHADER_MEAN_LUMA[from] ?? 20 : 0;
  const b = to ? SHADER_MEAN_LUMA[to] ?? 20 : 0;
  const rise = Math.max(0, b - a);
  return Math.min(7000, SHADER_FADE_DURATION_MS * (1 + rise / 75));
}
