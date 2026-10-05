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
// Realized (inferno) UNLOCKED 2026-10-05 — Karel: "realized btw does need all
// of the sound responsive and other global features we applied to all
// others. just snowflake and ghost are locked down for now".
export const MASTERED_JOURNEYS: ReadonlySet<string> = new Set(["ghost", "first-snow"]);

export const LEGACY_SLIDESHOW_JOURNEYS: ReadonlySet<string> = new Set(["first-snow"]);

export function isMasteredJourney(id?: string | null): boolean {
  return !!id && MASTERED_JOURNEYS.has(id);
}

/** Names the mastered journeys play under. A shared/path row that wraps a
 *  built-in carries its DB uuid as id but the live name, so protection
 *  checks match on either. */
export const MASTERED_JOURNEY_NAMES: ReadonlySet<string> = new Set(["snowflake", "ghost"]);

export function isMasteredJourneyLike(j?: { id?: string | null; name?: string | null } | null): boolean {
  if (!j) return false;
  return isMasteredJourney(j.id) || MASTERED_JOURNEY_NAMES.has((j.name ?? "").trim().toLowerCase());
}
