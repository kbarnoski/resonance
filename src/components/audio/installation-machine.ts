/**
 * Pure timing + selection helpers for the installation loop.
 *
 * The state-machine logic itself stays in installation-loop-client.tsx
 * (it is already an explicit timed FSM driven by setTimeout chains —
 * no useReducer rewrite is necessary, and a useReducer wrapper adds
 * indirection without making the timing easier to read).
 *
 * What got lifted out:
 *   - timing constants used by both the loop client and any test
 *   - the `distributedTrackIndex` helper for picking a fallback track,
 *     which is pure and easy to unit-test
 */

/** Cycle intro screen duration before the cycle text begins fading.
 *  Karel's kiosk test (2026-08-24): 7s was too short to read the
 *  program description — hold a few seconds longer. */
export const INTRO_MS = 11_000;

/** Closing credits hold duration before the loop returns to intro. */
export const CREDITS_MS = 16_000;

/** Per-journey safety timeout. Generously above the longest journey
 *  so a track that stalls without firing `ended` still advances. */
export const MAX_JOURNEY_MS = 8 * 60 * 1_000;

/** Stalled-detector window during a journey phase. If currentTime
 *  hasn't moved off ~0 within this period the loop client gives up
 *  on the track and skips. Generous to allow slow CDN starts and
 *  the mid-stall reload attempt at 12s a chance to recover. */
export const STALLED_THRESHOLD_MS = 30_000;

/** Mid-stall reload: if the track hasn't started by this time, force
 *  a fresh URL resolve and reload before the stalled detector fires. */
export const MID_STALL_RELOAD_MS = 12_000;

/** Cycle intro stage timings — exported so the visual choreography
 *  can be inspected and tested without re-deriving from the loop
 *  client's setTimeout chains. All are offsets from t=0. */
export const CYCLE_INTRO_TIMINGS = {
  /** Cycle text fades in over this duration starting at t=0
   *  (installationContentFade in installation-intro.tsx). */
  cycleFadeInMs: 1400,
  /** Cycle text begins fading out at this offset (kiosk pre-start). */
  cycleFadeOutStartMs: INTRO_MS,
  /** Cycle fade-out duration. */
  cycleFadeOutMs: 1500,
  /** BG starts fading on the SAME clock as the journey title mount —
   *  bg fade and title inner fade run together so the shader emerges
   *  alongside the title (see installation-intro.tsx). */
  bgFadeStartMs: INTRO_MS + 3500,
  /** BG fade-out duration — matches the title's inner fade-in clock. */
  bgFadeOutMs: 3800,
  /** Journey title mounts after the cycle fade-out window + a short
   *  black hold for shader compile / A/B crossfade settle. */
  journeyMountMs: INTRO_MS + 3500,
  /** Journey title inner fade-in animation duration. */
  journeyFadeInMs: 3800,
  /** Journey title outer fade-out begins here (~4.2s peak hold). */
  journeyFadeOutStartMs: INTRO_MS + 11_500,
  /** Journey title outer fade-out duration. */
  journeyFadeOutMs: 1800,
  /** Final phase change to the actual journey-0 phase. */
  phaseChangeMs: INTRO_MS + 13_300,
} as const;

/**
 * Compute a distributed index into a fallback-track pool for a
 * journey position. Avoids `i % length` (which would cluster
 * consecutive unpaired journeys on adjacent tracks and amplify any
 * single bad track) by multiplying by a coprime — picks scatter.
 *
 * @param i             - journey position (0-indexed)
 * @param poolLength    - number of available fallback tracks
 * @returns index into the pool, or -1 if the pool is empty
 */
export function distributedTrackIndex(i: number, poolLength: number): number {
  if (poolLength <= 0) return -1;
  return ((i * 7) + 3) % poolLength;
}
