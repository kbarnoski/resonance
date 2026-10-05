/**
 * Mastered journeys (Karel 2026-10-05: "snowflake and realized and ghost
 * were in final stages of mastering so we need to protect any global
 * changes to them from this other work").
 *
 * MASTERED_JOURNEYS — nothing global (shader pools/gains, casting,
 * analysis rebuilds, slideshow changes) may alter how these play.
 * Guarded by mastered-lock.test.ts against docs/mastered-lock.json.
 *
 * LEGACY_SLIDESHOW — Snowflake + Realized were mastered BEFORE the
 * phase-bounded slideshow (77a25877 / 6ae8a2d2 / 2e49f65f, built for
 * Ghost's arc), so they keep the exact still sequencing they were
 * mastered with: unbounded jitter, no forced phase entry, wrap-around
 * walks. Ghost was mastered ON the new behavior and keeps it.
 */
export const MASTERED_JOURNEYS: ReadonlySet<string> = new Set(["ghost", "first-snow", "inferno"]);

export const LEGACY_SLIDESHOW_JOURNEYS: ReadonlySet<string> = new Set(["first-snow", "inferno"]);

export function isMasteredJourney(id?: string | null): boolean {
  return !!id && MASTERED_JOURNEYS.has(id);
}
