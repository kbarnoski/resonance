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
/** A recorded shader timeline from a loved session's flight log —
 *  replayed EXACTLY by progress, immune to pool reshuffles and pick
 *  walks. Banned shaders are filtered at apply time (the previous
 *  shader holds), so later bans trim a take without destroying it.
 *  THIS is "keep that take" (Karel 2026-09-29: "i asked you to use
 *  the previous snowflake take"). */
export type TakeScriptEntry = { p: number; role: "primary" | "dual" | "tertiary-on" | "tertiary-off"; mode: string };
export const SCRIPTED_TAKES: Record<string, TakeScriptEntry[]> = {
  // Snowflake — session dl8fbj ("i like all of the shaders used in
  // this take"); r3-lightrivers is pick-banned so r-silk holds the ending.
  "first-snow": [
    {"p":0,"role":"primary","mode":"plasma"},{"p":0.112,"role":"primary","mode":"swell"},
    {"p":0.183,"role":"primary","mode":"r2-photon"},{"p":0.292,"role":"primary","mode":"whorl"},
    {"p":0.314,"role":"dual","mode":"r-molten"},{"p":0.354,"role":"primary","mode":"r3-spirittrails"},
    {"p":0.429,"role":"primary","mode":"r2-spiralgal"},{"p":0.498,"role":"primary","mode":"credo"},
    {"p":0.616,"role":"primary","mode":"eclipse-ring"},{"p":0.676,"role":"primary","mode":"apophatic"},
    {"p":0.704,"role":"dual","mode":"enzyme"},{"p":0.753,"role":"primary","mode":"r-silk"},
    {"p":0.82,"role":"primary","mode":"r3-lightrivers"},
  ],
  // Ghost — session p4jv6o ("ghost take you should keep"); lightrivers
  // filtered here too per the same ban (dharma holds through p0.637).
  "ghost": [
    {"p":0,"role":"primary","mode":"chakra"},{"p":0.073,"role":"primary","mode":"starfield"},
    {"p":0.134,"role":"dual","mode":"lightning-field"},{"p":0.152,"role":"primary","mode":"redshift"},
    {"p":0.208,"role":"primary","mode":"yantra"},{"p":0.272,"role":"primary","mode":"gnosis"},
    {"p":0.389,"role":"primary","mode":"magma"},{"p":0.453,"role":"primary","mode":"smoke-signal"},
    {"p":0.472,"role":"dual","mode":"chrysalis"},{"p":0.52,"role":"primary","mode":"dharma"},
    {"p":0.558,"role":"dual","mode":"cymatic"},{"p":0.576,"role":"primary","mode":"r3-lightrivers"},
    {"p":0.637,"role":"primary","mode":"furnace"},{"p":0.69,"role":"primary","mode":"biofilm"},
    {"p":0.749,"role":"primary","mode":"night-rain"},{"p":0.817,"role":"primary","mode":"lectio"},
    {"p":0.877,"role":"primary","mode":"r-droplets"},
  ],
};

export const PINNED_TAKES: Record<string, number | number[]> = {
  "ghost": 1034657006,
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
