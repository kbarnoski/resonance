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
  // PINNED to the loved lap of 2026-10-01 03:34 ("the flight recorder
  // knows what i loved") — recast-lottery removed: every slot names
  // its final shader. Dual rests until pendulum-dust's loved entrance.
  "first-snow": [
    {"p":0,"role":"primary","mode":"plasma"},{"p":0.112,"role":"primary","mode":"swell"},
    {"p":0.183,"role":"primary","mode":"r2-photon"},{"p":0.292,"role":"primary","mode":"cirrus"},
    {"p":0.354,"role":"primary","mode":"r3-spirittrails"},
    {"p":0.429,"role":"primary","mode":"murmuration"},{"p":0.498,"role":"primary","mode":"firefly-field"},
    {"p":0.616,"role":"primary","mode":"eclipse-ring"},{"p":0.676,"role":"primary","mode":"r-droplets"},
    {"p":0.704,"role":"dual","mode":"pendulum-dust"},{"p":0.753,"role":"primary","mode":"r-silk"},
    {"p":0.82,"role":"primary","mode":"drift"},
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
  // Realized — locked 2026-09-30 ("keep every take of what you have and
  // we will start mastering from here") — latest complete lap, flight log.
  "inferno": [
    {"p":0,"role":"primary","mode":"ember"},{"p":0.094,"role":"primary","mode":"maelstrom-dark"},{"p":0.148,"role":"dual","mode":"eclipse-ring"},{"p":0.165,"role":"primary","mode":"redshift"},{"p":0.217,"role":"dual","mode":"photon"},{"p":0.234,"role":"primary","mode":"singularity"},{"p":0.279,"role":"primary","mode":"lectio"},{"p":0.295,"role":"dual","mode":"biolume"},{"p":0.331,"role":"primary","mode":"r3-dreamtendrils"},{"p":0.366,"role":"dual","mode":"r-silk"},{"p":0.382,"role":"primary","mode":"catacomb-torch"},{"p":0.47,"role":"primary","mode":"numinous"},{"p":0.525,"role":"primary","mode":"parsec"},{"p":0.598,"role":"primary","mode":"seraph"},{"p":0.609,"role":"tertiary-on","mode":"r3-coronastreams"},{"p":0.614,"role":"tertiary-off","mode":""},{"p":0.625,"role":"dual","mode":"radiance"},{"p":0.65,"role":"primary","mode":"hesychasm"},{"p":0.724,"role":"primary","mode":"revelation"},{"p":0.782,"role":"primary","mode":"maelstrom"},{"p":0.84,"role":"primary","mode":"portal"},{"p":0.851,"role":"tertiary-on","mode":"maelstrom"},{"p":0.876,"role":"dual","mode":"r3-aurorastreams"},{"p":0.893,"role":"primary","mode":"cataphatic"},{"p":0.932,"role":"tertiary-off","mode":""},
  ],
  // Surrounded by Light 6 — locked 2026-09-30 ("keep every take of what you have and
  // we will start mastering from here") — latest complete lap, flight log.
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc": [
    {"p":0,"role":"primary","mode":"r2-coral"},{"p":0.074,"role":"primary","mode":"selene"},{"p":0.129,"role":"dual","mode":"seraph"},{"p":0.152,"role":"primary","mode":"aurora-borealis"},{"p":0.219,"role":"dual","mode":"r3-arcdischarge"},{"p":0.241,"role":"primary","mode":"cataphatic"},{"p":0.316,"role":"primary","mode":"r-smokerings"},{"p":0.339,"role":"dual","mode":"ember-drift"},{"p":0.394,"role":"primary","mode":"spore"},{"p":0.554,"role":"primary","mode":"diatom"},{"p":0.622,"role":"primary","mode":"meristem"},{"p":0.646,"role":"dual","mode":"r3-peelingbark"},{"p":0.681,"role":"primary","mode":"plankton"},{"p":0.747,"role":"primary","mode":"r3-auroradream"},
  ],
  // Nothing 30 — locked 2026-09-30 ("keep every take of what you have and
  // we will start mastering from here") — latest complete lap, flight log.
  "79cad85a-13fa-4db9-b4cd-a507b62a6084": [
    {"p":0,"role":"primary","mode":"starfield"},{"p":0.061,"role":"primary","mode":"r2-portalrim"},{"p":0.131,"role":"primary","mode":"zenith"},{"p":0.154,"role":"dual","mode":"diatom"},{"p":0.205,"role":"primary","mode":"biolume"},{"p":0.248,"role":"dual","mode":"r3-coralpulse"},{"p":0.268,"role":"primary","mode":"kepler"},{"p":0.363,"role":"primary","mode":"vortex"},{"p":0.383,"role":"dual","mode":"monsoon"},{"p":0.424,"role":"primary","mode":"r3-arcdischarge"},{"p":0.57,"role":"primary","mode":"dark-nebula"},{"p":0.629,"role":"primary","mode":"spore"},{"p":0.699,"role":"primary","mode":"parsec"},{"p":0.763,"role":"primary","mode":"rime"},{"p":0.828,"role":"primary","mode":"stigmata"},{"p":0.9,"role":"primary","mode":"r2-marble"},
  ],
  // Night Wind 2 — locked 2026-09-30 ("keep every take of what you have and
  // we will start mastering from here") — latest complete lap, flight log.
  "4cd35ec2-bc13-4b9a-b26c-9e38e956fb80": [
    {"p":0,"role":"primary","mode":"witch-light"},{"p":0.061,"role":"primary","mode":"gnosis"},{"p":0.083,"role":"dual","mode":"jubilee"},{"p":0.112,"role":"primary","mode":"soma"},{"p":0.154,"role":"dual","mode":"kenosis"},{"p":0.182,"role":"primary","mode":"dark-crystal"},{"p":0.248,"role":"primary","mode":"r3-wishtrails"},{"p":0.304,"role":"primary","mode":"r3-seaweedsway"},{"p":0.363,"role":"primary","mode":"night-rain"},{"p":0.43,"role":"dual","mode":"merkaba"},{"p":0.449,"role":"primary","mode":"anima"},{"p":0.501,"role":"dual","mode":"kelp"},{"p":0.52,"role":"primary","mode":"mandorla"},{"p":0.571,"role":"primary","mode":"r2-pixie"},{"p":0.602,"role":"dual","mode":"blood-moon"},{"p":0.64,"role":"primary","mode":"thermal"},{"p":0.701,"role":"primary","mode":"vestige"},{"p":0.772,"role":"primary","mode":"agape"},{"p":0.833,"role":"primary","mode":"redshift"},
  ],
  // The Other Side 10 — locked 2026-09-30 ("keep every take of what you have and
  // we will start mastering from here") — latest complete lap, flight log.
  "6499ac06-2cb1-4970-b75f-1258587c84d8": [
    {"p":0,"role":"primary","mode":"inferno"},{"p":0.093,"role":"primary","mode":"revelation"},{"p":0.183,"role":"primary","mode":"r3-aurorastreams"},{"p":0.289,"role":"primary","mode":"r3-memoryflow"},{"p":0.395,"role":"primary","mode":"monsoon"},{"p":0.506,"role":"primary","mode":"typhoon"},{"p":0.676,"role":"primary","mode":"r3-sleepingbloom"},{"p":0.794,"role":"primary","mode":"dark-crystal"},
  ],
  // Northern Plane 5 — locked 2026-09-30 ("keep every take of what you have and
  // we will start mastering from here") — latest complete lap, flight log.
  "13e71555-03d6-4b27-ad32-2c6834559c24": [
    {"p":0,"role":"primary","mode":"empyrean"},{"p":0.078,"role":"primary","mode":"plankton"},{"p":0.169,"role":"primary","mode":"ocean"},{"p":0.22,"role":"dual","mode":"torrent"},{"p":0.246,"role":"primary","mode":"nadir"},{"p":0.318,"role":"primary","mode":"maelstrom"},{"p":0.336,"role":"tertiary-on","mode":"threshold"},{"p":0.423,"role":"primary","mode":"chrysalis"},{"p":0.448,"role":"dual","mode":"blood-moon"},{"p":0.456,"role":"tertiary-off","mode":""},{"p":0.498,"role":"primary","mode":"coral"},{"p":0.66,"role":"primary","mode":"r2-portalrim"},{"p":0.757,"role":"primary","mode":"r2-fibers"},{"p":0.849,"role":"primary","mode":"iron-forge"},
  ],
  // No question 8 — locked 2026-09-30 ("keep every take of what you have and
  // we will start mastering from here") — latest complete lap, flight log.
  "6407bf5c-7862-49e8-883d-59754c4caf18": [
    {"p":0,"role":"primary","mode":"r-embers"},{"p":0.067,"role":"primary","mode":"protostar"},{"p":0.145,"role":"primary","mode":"cascade"},{"p":0.174,"role":"dual","mode":"r-droplets"},{"p":0.224,"role":"primary","mode":"r-embers"},{"p":0.292,"role":"dual","mode":"smoke-signal"},{"p":0.315,"role":"primary","mode":"zenith"},{"p":0.387,"role":"primary","mode":"r3-silkwind"},{"p":0.464,"role":"primary","mode":"parsec"},{"p":0.533,"role":"dual","mode":"chinook"},{"p":0.626,"role":"primary","mode":"cirrus"},{"p":0.708,"role":"primary","mode":"obsidian-flow"},{"p":0.741,"role":"dual","mode":"kepler"},{"p":0.79,"role":"primary","mode":"smolder"},{"p":0.864,"role":"primary","mode":"supernova"},{"p":0.003,"role":"primary","mode":"covenant"},
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

/** Pinned TITLING still — the image under the journey title card,
 *  every lap (Karel 2026-10-01: "keep that intro image always in
 *  titling section"). */
export const TAKE_INTRO_STILLS: Record<string, string> = {
  "first-snow": "/tramokyo-pack/images/journeys/first-snow/gen-106.jpg",
};

/** Pinned FINALE still — shown once as soon as playback enters the
 *  journey's last phase, every lap (Karel 2026-10-01: Ghost must END on
 *  the angel unifying with light amidst the cosmos; one run ended on a
 *  stone corridor). Filled per journey once Karel approves the image. */
export const TAKE_FINALE_STILLS: Record<string, string> = {
  // Round 4 (Karel 2026-10-01): c9 — the MOST DISTANT image, the angel
  // small in a spiral of light amidst the cosmos. Lives in the LAST
  // integration slot (089); the pin makes sure it is seen the moment
  // the ending begins (the slot walk rarely reaches 089 before the 0.96
  // quiet zone).
  "ghost": "/tramokyo-pack/images/journeys/ghost/gen-089.jpg",
};

/** Pinned FINALE shader — the forced switch at the last morph's end
 *  (Karel 2026-10-01: "dont end on that green tinted shader").
 *  first-snow ends on the loved colored-lines photon. */
export const TAKE_FINALE_SHADERS: Record<string, string> = {
  "first-snow": "r2-photon",
};
