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
  boundaryUntilMs = 0;
}

/**
 * Boundary settle window (Karel 2026-09-28: "the transition remains a
 * big problem" — after months of fixing individual boundary movers,
 * the design changes: during the handoff NOTHING moves at once).
 *
 * At a journey change, four transitions used to fire within 300ms of
 * each other: every old still flips to fading, the parallax base
 * starts its cross-journey mix, the incoming journey's first shader
 * compiles + crossfades, and post-processing glides to the new palette
 * on a fast 1.5s curve. Individually gentle; stacked in one instant
 * they read as flicker. This window staggers them: while it is open
 * (the title-card seconds), the parallax HOLDS its old base, post-
 * processing slows its glide ~4x, and no clips play. The old stills'
 * 8s boundary fade and the title's compositor-threaded text fade are
 * the only movers.
 */
let boundaryUntilMs = 0;

export function markJourneyBoundary(settleMs: number): void {
  boundaryUntilMs = Math.max(boundaryUntilMs, nowMs() + settleMs);
}

export function inBoundarySettle(): boolean {
  return nowMs() < boundaryUntilMs;
}

/** Settle plus a grace tail — consumers whose catch-up is itself
 *  visible (the shader-opacity ramp) hold a little longer so the
 *  settle-end releases don't all land in the same second. */
export function inBoundarySettleExtended(extraMs: number): boolean {
  return nowMs() < boundaryUntilMs + extraMs;
}
