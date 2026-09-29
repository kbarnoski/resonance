/**
 * Pinned takes (Karel 2026-09-29: "is it possible to reproduce that one
 * i loved? it had a great magic to it").
 *
 * Every kiosk journey run now plays from an explicit TAKE SEED — one
 * number that deterministically produces the entire performance:
 * shader picks and rotation timing, breath wave, stillness windows,
 * tertiary moments. The seed is stamped into the flight log at start
 * (`take-seed <journeyId> #<n>`), so when a run has the magic, look up
 * its number in docs/glitch-events.jsonl and pin it here — that
 * journey then plays that exact performance every time. Unpinned
 * journeys stay fully generative (a fresh take each run).
 *
 * CAVEAT: a pinned take reproduces exactly only while the journey's
 * shader pool is unchanged — banning a shader reshuffles the draws.
 * Cull the duds first, then pin the take that sings.
 */
/**
 * A journey maps to one take (always that performance) or a LIBRARY of
 * loved takes — the kiosk picks one at random each run (Karel
 * 2026-09-29: "record multiple takes i like and when it runs it
 * chooses one — deterministic brought back in a very compelling way").
 * The generative engine becomes the composer; the pinned list is the
 * album of approved performances.
 */
export const PINNED_TAKES: Record<string, number | number[]> = {
  // Karel 2026-09-29: "i really liked the take up until the helix...
  // retain that" — the r-growth slot re-picks via the pick-time ban;
  // everything else replays exactly.
  "first-snow": 1955860385,
};

/** Resolve tonight's take for a journey: a pinned one (or a random
 *  pick from its library), else null = fresh generative take. */
export function pickPinnedTake(journeyId: string): number | null {
  const p = PINNED_TAKES[journeyId];
  if (p == null) return null;
  if (Array.isArray(p)) return p.length ? p[Math.floor(Math.random() * p.length)] : null;
  return p;
}
