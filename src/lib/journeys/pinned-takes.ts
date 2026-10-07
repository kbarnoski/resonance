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
  // LOCKED 2026-10-01 (Karel: "everything else use that take as far as
  // images and shaders etc. lock it in") — mastered Ghost take. Pack
  // stills snapshot: ~/Documents/Resonance/ghost-LOCKED-2026-10-01/.
  // Change only on Karel's explicit note.
  "ghost": [
    // Rebuilt 2026-10-01 (Karel: "dont use the full screen shaders that
    // lighten the screen it looks bad and removes detail" — the first
    // section's exit and "that oval one in tunnel"). Measured over the
    // pack (headed harness): lightning-field/redshift/gnosis/magma/
    // smoke-signal/chrysalis/dharma/protostar/threshold/furnace/biofilm
    // lifted the black floor to 21-27 and washed the imagery; only dark
    // particle shaders here, no duals. r-petals = the ending's pink
    // particles (Karel 2026-10-01).
    {"p":0,"role":"primary","mode":"starfield"},
    {"p":0.152,"role":"primary","mode":"drift"},
    {"p":0.208,"role":"primary","mode":"yantra"},
    {"p":0.272,"role":"primary","mode":"firefly-field"}, // coral out (Karel 2026-10-06: "remove those bubbles in ghost")
    {"p":0.33,"role":"primary","mode":"murmuration"},
    {"p":0.389,"role":"primary","mode":"drift"},
    {"p":0.453,"role":"primary","mode":"r-stardust"},
    {"p":0.52,"role":"primary","mode":"pendulum-dust"}, // coral out (bubbles)
    {"p":0.576,"role":"primary","mode":"r3-fairyglow"},
    {"p":0.637,"role":"primary","mode":"r2-curlswarm"}, // cirrus out (Karel 2026-10-06: "that algae neon green shader")
    {"p":0.69,"role":"primary","mode":"magma"}, // amber web back (Karel 2026-10-01: "you lost that cool amber web shader. a mix of shaders is good"); sparkler banned
    {"p":0.749,"role":"primary","mode":"starfield"},
    {"p":0.817,"role":"primary","mode":"drift"}, // cirrus out (neon-green algae)
        {"p":0.85,"role":"primary","mode":"r-petals"}, // petals over the TREE/union only (Karel: "cool with that tree scene but dont have it over the cosmos scene after")
    {"p":0.91,"role":"primary","mode":"starfield"}, // the cosmos ending: "another subtle shader"
  ],
  // Realized — locked 2026-09-30 ("keep every take of what you have and
  // we will start mastering from here") — latest complete lap, flight log.
  "inferno": [
    {"p":0,"role":"primary","mode":"ember"},{"p":0.094,"role":"primary","mode":"maelstrom-dark"},{"p":0.148,"role":"dual","mode":"eclipse-ring"},{"p":0.165,"role":"primary","mode":"redshift"},{"p":0.217,"role":"dual","mode":"photon"},{"p":0.234,"role":"primary","mode":"singularity"},{"p":0.279,"role":"primary","mode":"lectio"},{"p":0.295,"role":"dual","mode":"biolume"},{"p":0.331,"role":"primary","mode":"r3-dreamtendrils"},{"p":0.366,"role":"dual","mode":"r-silk"},{"p":0.382,"role":"primary","mode":"catacomb-torch"},{"p":0.47,"role":"primary","mode":"numinous"},{"p":0.525,"role":"primary","mode":"parsec"},{"p":0.598,"role":"primary","mode":"seraph"},{"p":0.609,"role":"tertiary-on","mode":"r3-coronastreams"},{"p":0.614,"role":"tertiary-off","mode":""},{"p":0.625,"role":"dual","mode":"radiance"},{"p":0.65,"role":"primary","mode":"hesychasm"},{"p":0.724,"role":"primary","mode":"revelation"},{"p":0.782,"role":"primary","mode":"maelstrom"},{"p":0.84,"role":"primary","mode":"portal"},{"p":0.851,"role":"tertiary-on","mode":"maelstrom"},{"p":0.876,"role":"dual","mode":"r3-aurorastreams"},{"p":0.893,"role":"primary","mode":"cataphatic"},{"p":0.932,"role":"tertiary-off","mode":""},
  ],
  // Expansion set 1's six scripted takes (locked 2026-09-30, pre-kinetic
  // rosters) were RETIRED 2026-10-04: Karel asked for every Expansion
  // journey to be recast from the vetted pool with an exclusive lead and
  // an analysis-driven arc ("i see the same over and over"); a scripted
  // take replays its recorded shaders and would bypass the recast (and
  // disables tertiary moments). The rosters live in git history
  // (0f9abd8d) if a take is ever wanted back.
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
