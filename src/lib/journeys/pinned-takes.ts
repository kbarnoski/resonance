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
export const PINNED_TAKES: Record<string, number> = {
  // "first-snow": 123456789,
};
