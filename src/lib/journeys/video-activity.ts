/**
 * Shared video quiet window (Karel 2026-09-28: "a couple of dropped
 * frames when the morphs played").
 *
 * Morphs are now the ONLY moving imagery below the climax — so a main-
 * thread stall (shader compile, still decode/first-draw, layer churn)
 * is invisible on held stills but reads as a dropped frame the moment
 * it lands while a morph is playing or fading. Both frame gaps in
 * session z2wg4u did exactly that: a shader-primary compile 2s after a
 * morph's fade began, and a layer-evict + still-push 9ms before a gap
 * while a morph was easing out.
 *
 * The fix is scheduling, not speed: while a morph is visible, the rest
 * of the stack holds its churn. ai-image-layer marks the window when a
 * clip starts playing (and extends it over the ended-fade); the journey
 * engine and the pack still-cadence consult it before switching shaders
 * or pushing layers. Module-level on purpose — the engine is a
 * singleton outside React and must see the same clock.
 */

let activeUntilMs = 0;

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : 0);

/** Extend the quiet window to at least `holdMs` from now. */
export function markVideoActive(holdMs: number): void {
  activeUntilMs = Math.max(activeUntilMs, nowMs() + holdMs);
}

/** True while a morph is (or was very recently) visible on screen. */
export function isVideoActive(): boolean {
  return nowMs() < activeUntilMs;
}

/** Test hook — clears the window. */
export function resetVideoActivity(): void {
  activeUntilMs = 0;
}
