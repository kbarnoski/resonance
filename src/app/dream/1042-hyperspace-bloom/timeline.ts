/* ── 1042-hyperspace-bloom · auto-journey timeline ───────────────────────
 *
 *  A single scalar `t` (seconds since "Begin descent") drives a ~75s journey
 *  that rises into the DMT-style "breakthrough" and settles. Everything
 *  (rotation speed, saturation, neon brightness, projection bloom) peaks at
 *  the breakthrough, then eases back into a sustained afterglow that loops.
 *
 *  Pure phenomenology — no medical claims. Shape inspired by trip-report
 *  arcs: build-up → onset → breakthrough plateau → gentle integration.
 */

export interface TimelineState {
  /** overall 4D rotation rate multiplier */
  speed: number;
  /** neon emissive gain 0..1 */
  glow: number;
  /** color saturation / iridescence depth 0..1 */
  sat: number;
  /** stereographic bloom — how hard near edges balloon, 0..1 */
  bloom: number;
  /** breakthrough proximity 0..1 (used for vignette open + chroma) */
  peak: number;
}

const LOOP = 75; // seconds per full journey, then repeats

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function evalTimeline(time: number): TimelineState {
  const t = time % LOOP;

  // breakthrough window centred ~42s, broad plateau
  const onset = smoothstep(6, 30, t); // build-up
  const breakIn = smoothstep(30, 42, t); // surge into breakthrough
  const breakOut = 1 - smoothstep(54, 70, t); // settle after
  const peak = Math.min(onset + breakIn, 1) * breakOut;

  // a gentle base hum so the idle/return state is never dead-flat
  const base = 0.18 + 0.12 * onset;

  return {
    speed: 0.35 + 0.9 * peak + 0.15 * onset,
    glow: base + 0.7 * peak,
    sat: 0.45 + 0.5 * onset + 0.05 * peak,
    bloom: 0.3 + 0.6 * peak,
    peak,
  };
}
