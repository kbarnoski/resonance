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
 *   - `journeyCapMs` — per-journey safety timeout derived from the
 *     track's known duration instead of a fixed 8 minutes
 *   - `QUARANTINED_RECORDING_IDS` — recordings excluded from the
 *     installation fallback/DJ pool (unverified authorship)
 */

import {
  SEVENTEENTH_ST_TRACKS,
  FOLSOM_ST_TRACKS,
} from "@/app/dream/_shared/welcomeHome";

/** Cycle intro screen duration before the cycle text begins fading.
 *  Karel's kiosk test (2026-08-24): 7s was too short to read the
 *  program description — hold a few seconds longer. */
export const INTRO_MS = 11_000;
/** Tramokyo cold open — the experience-level "Resonance" card shown
 *  once per full cycle, before program 0's intro. */
export const EXPERIENCE_INTRO_MS = 15_000;
/** Mid-show artist-statement interstitial: shown between journeys every
 *  N tracks so a 30-minute drop-in still meets the statement. */
export const STATEMENT_INTERSTITIAL_MS = 14_000;
/** Universal quiet breath between consecutive journeys — a few seconds
 *  of silence before each next track begins (Karel 2026-08-30). Per-
 *  journey PRE_ENTRY_PAUSE values can lengthen it, never shorten it. */
export const INTER_JOURNEY_BREATH_MS = 4_000;
export const STATEMENT_EVERY_N_JOURNEYS = 7;

/** Closing credits hold duration before the loop returns to intro. */
export const CREDITS_MS = 16_000;

/** Per-journey safety-timeout FLOOR. When a track's duration is known,
 *  `journeyCapMs` derives the real cap from it (duration + margin) and
 *  only ever raises it above this floor — so bad metadata can't cut a
 *  piece short, and a long track (e.g. an 18-minute fallback pick) is
 *  no longer chopped at 8:00. This constant alone is only the fallback
 *  for tracks with unknown duration. */
export const MAX_JOURNEY_MS = 8 * 60 * 1_000;

/** Margin added on top of a track's known duration when deriving its
 *  per-journey safety cap. Generous enough to absorb slow starts,
 *  mid-track stall recoveries, and the pre-entry breath — the cap is
 *  a last-resort advance, not a scheduler. */
export const JOURNEY_CAP_MARGIN_MS = 90_000;

/**
 * Per-journey safety timeout for a track of the given duration
 * (seconds, as stored on `recordings.duration`). Returns
 * `duration + JOURNEY_CAP_MARGIN_MS`, floored at MAX_JOURNEY_MS —
 * never lower, so suspect duration metadata can only lengthen the
 * window, never truncate a piece mid-play.
 */
export function journeyCapMs(trackDurationSec: number | null | undefined): number {
  if (
    typeof trackDurationSec !== "number" ||
    !Number.isFinite(trackDurationSec) ||
    trackDurationSec <= 0
  ) {
    return MAX_JOURNEY_MS;
  }
  return Math.max(
    MAX_JOURNEY_MS,
    Math.round(trackDurationSec * 1_000) + JOURNEY_CAP_MARGIN_MS,
  );
}

/**
 * Recording IDs excluded from the installation fallback/DJ pool.
 *
 * The 17th St + Folsom St session uploads are quarantined — a Joseph
 * drone surfaced in a "Folsom St" file (2026-08-14), so authorship of
 * every take in those sessions is unverified until Karel signs off per
 * track. Karel's decision (2026-08-25 audit): EXCLUDE them from the
 * Tramokyo offline fallback/DJ pool. This also removes the 18:40
 * "17th St 64" that previously overflowed the journey cap.
 *
 * The canonical quarantine list lives in
 * `src/app/dream/_shared/welcomeHome.ts` — imported here rather than
 * copied so the two can never drift. Curated PAIRED_TRACKS pairings
 * are a separate mechanism and unaffected (none of the current
 * installation programs pair a quarantined track).
 */
export const QUARANTINED_RECORDING_IDS: ReadonlySet<string> = new Set(
  [...SEVENTEENTH_ST_TRACKS, ...FOLSOM_ST_TRACKS].map((t) => t.id),
);

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
