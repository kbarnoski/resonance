/* ── 1041-nde-tunnel · the single shared journey timeline ─────────────────
 *
 *  One clock drives BOTH visuals and audio. The piece loops forever over
 *  ~120s, easing through the NDE phenomenology arc:
 *
 *    1. Onset            near-black, body-still, a faint distant point
 *    2. Leaving the body the void opens, slow forward drift begins
 *    3. The tunnel       the wormhole forms, gentle acceleration, vignette
 *    4. The light        centre bloom fills, the gamma clarity-snap (peak)
 *    5. Return           the light recedes, soft landing back into calm void
 *
 *  Every value is a smooth function of phase — no discontinuities, nothing
 *  flashes. timeScale stretches the whole clock slow (time dilation).
 */

export const LOOP_SECONDS = 120;

export interface TimelineState {
  speed: number; // forward travel along the tunnel
  light: number; // 0..1 being-of-light intensity
  vignette: number; // 0..1 hypoxic constriction
  clarity: number; // 0..1 gamma clarity-snap
  open: number; // 0..1 how open the void is
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// a smooth bump that rises to 1 at `centre` over `width` and eases back
function bump(x: number, centre: number, width: number): number {
  const d = Math.abs(x - centre) / width;
  return Math.max(0, 1 - d * d * (3 - 2 * Math.min(1, d)));
}

/** Evaluate the timeline at elapsed seconds (already time-scaled upstream). */
export function evalTimeline(elapsed: number): TimelineState {
  // phase 0..1 around the loop
  const p = (elapsed % LOOP_SECONDS) / LOOP_SECONDS;

  // ── openness: void blooms open after onset, closes a touch on return ──
  const open =
    smoothstep(0.04, 0.22, p) * (1 - 0.4 * smoothstep(0.86, 1.0, p));

  // ── forward speed: still → drift → accelerate down tunnel → ease back ──
  const drift = smoothstep(0.12, 0.34, p) * 1.0;
  const accel = smoothstep(0.34, 0.62, p) * 1.4;
  const returnEase = 1 - smoothstep(0.7, 0.95, p) * 0.75;
  const speed = (0.25 + drift + accel) * returnEase;

  // ── the being of light: faint point early, fills toward white at peak ──
  // peak centred around p≈0.66 (phase 4)
  const lightRise = smoothstep(0.4, 0.66, p);
  const lightFall = 1 - smoothstep(0.7, 0.92, p);
  const light = Math.min(1, lightRise * lightFall + 0.05 * open);

  // ── hypoxic vignette: tightens as we descend, tightest just before peak ──
  const vignette =
    smoothstep(0.28, 0.6, p) * (1 - 0.6 * smoothstep(0.74, 0.94, p));

  // ── gamma clarity-snap: a brief hyper-lucid lift right at the light ──
  // ~2.5s wide bump centred at peak; width is in phase units
  const clarity = bump(p, 0.67, 0.045);

  return { speed, light, vignette, clarity, open };
}
