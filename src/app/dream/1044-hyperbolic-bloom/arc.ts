/* ── 1044-hyperbolic-bloom · the descent arc ─────────────────────────────
 *
 *  A single non-looping `progress` clock (0 → 1 over ~5 minutes) drives the
 *  whole journey. From it we derive the shader/audio uniforms so the visuals
 *  and sound rise into the "breakthrough" together and ease back down.
 *
 *  Arc (per the brief):
 *    onset        0.00–0.18  low recursion, slow fall, low saturation
 *    come-up      0.18–0.35  depth + fall speed + warp rising
 *    breakthrough 0.35–0.60  PEAK — max depth, fastest geodesic fall, max
 *                            saturation + chromatic aberration
 *    plateau      0.60–0.80  slower morph, sustained intensity
 *    return       0.80–1.00  depth/saturation decay, soft landing
 *
 *  Pure phenomenology — no medical claims.
 */

export const JOURNEY_SECONDS = 300; // ~5 minutes, then it just holds the landing

export interface ArcState {
  progress: number; // 0..1 raw clock
  peak: number; // 0..1 breakthrough proximity (bell)
  /** hyperbolic recursion depth, fed as an int 0..1 scaler for fold count */
  depth: number;
  /** geodesic fall speed along the arc (the perpetual hyperbolic fall) */
  fall: number;
  /** breathing fBm warp amplitude */
  warp: number;
  /** colour saturation / jewel intensity */
  sat: number;
  /** chromatic-aberration + thin-film iridescence amount */
  chroma: number;
  /** overall emissive gain */
  glow: number;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function evalArc(timeSeconds: number): ArcState {
  const progress = Math.min(1, timeSeconds / JOURNEY_SECONDS);

  // build-up envelope and a settle envelope; their product is the peak bell
  const comeUp = smoothstep(0.18, 0.4, progress);
  const settle = 1 - smoothstep(0.62, 0.92, progress);
  const peak = comeUp * settle;

  // depth rises early and stays high through the plateau, decays on return
  const onset = smoothstep(0.02, 0.22, progress);
  const depth = Math.min(1, 0.18 + 0.82 * (onset * settle));

  // the fall is always present (never dead) but surges at the breakthrough
  const fall = 0.12 + 0.95 * peak + 0.1 * onset;

  // warp breathes in on the come-up, eases at the landing
  const warp = 0.08 + 0.55 * peak + 0.1 * onset;

  // saturation / chroma climb into the peak
  const sat = 0.32 + 0.55 * peak + 0.13 * onset;
  const chroma = 0.15 + 0.85 * peak;

  const glow = 0.4 + 0.6 * peak + 0.1 * onset;

  return { progress, peak, depth, fall, warp, sat, chroma, glow };
}
