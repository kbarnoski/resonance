// THE JOSEPH SET (Tramokyo show day, 2026-10-15). Joseph's own tracks, played
// in order through the speakers while Live Theatre wanders Karel's local
// worlds, driven by Joseph's audio. OFFLINE ONLY: the audio lives in the
// gitignored local pack (public/tramokyo-pack/joseph/<id>.m4a, written by
// scripts/import-joseph-set.ts from ~/Documents/Resonance/joseph-set/originals)
// — never Supabase, never Vercel, never the catalogue, never git.
//
// Dependency-free on purpose: the import script loads this file with jiti.

export interface JosephTrack {
  /** Stable id — NOT tied to the order, so reordering never renames files. */
  id: string;
  /** Display name (Joseph's own title; version tags kept as he wrote them). */
  title: string;
  /** Source master in ~/Documents/Resonance/joseph-set/originals/. */
  file: string;
  /** Seconds (probed from the master). */
  duration: number;
  /** World steering words, matched against each world's own imagery prompts
   *  (with the music analysis' energy deciding calm vs intense picks). */
  words: string[];
  /** Only this track may use the bird worlds (Yellow Bird's signature flight). */
  birds?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// THE ORDER — reorder / cut lines here; that is the whole edit.
// Draft from Joseph's playlist + notes (2026-10-15, Karel: "for the moment
// just do your best"). "?" = position unconfirmed until Karel talks to Joseph.
// Not in the folder (so not in the set): "The sp…", "I was here (Remix)".
// Superseded, left out: the old "Just for a moment.m4a".
// ─────────────────────────────────────────────────────────────────────────
export const JOSEPH_SET_ORDER: string[] = [
  "joseph-closer-to-an-end",        //  1 ?
  "joseph-just-for-a-moment",       //  2 ?  (the "(final)" version)
  "joseph-sky-and-storm",           //  3
  "joseph-whispers-in-the-trees",   //  4
  "joseph-in-motion",               //  5
  "joseph-time-pulls-slow",         //  6
  "joseph-teaching-birds-to-fly",   //  7
  "joseph-without-a-brightness",    //  8
  "joseph-burning-bush",            //  9
  "joseph-worth-the-war",           // 10
  "joseph-closer-now",              // 11
  "joseph-the-way",                 // 12
  "joseph-ill-be-your-home",        // 13
  "joseph-i-am",                    // 14
  "joseph-sixteen-thousand-days",   // 15
  "joseph-i-was-here",              // 16
  "joseph-a-better-wish",           // 17 ?
  "joseph-time",                    // 18    ("Time goes after better wish")
  "joseph-from-the-cradle",         // 19
  "joseph-road-less-traveled",      // 20
  "joseph-closer-now-2",            // 21
  "joseph-butterfly",               // 22
  "joseph-faded-outlines",          // 23
  "joseph-maybe",                   // 24
];

/** Every Joseph track the pack knows (any order — JOSEPH_SET_ORDER decides). */
export const JOSEPH_TRACKS: JosephTrack[] = [
  {
    id: "joseph-closer-to-an-end", title: "Closer to an end than a beginning",
    file: "Closer to an end than a beginning.m4a", duration: 245,
    // "my life is a miracle … my heart is a metronome … this, all of, is a gift"
    words: ["gift", "golden", "ember", "glow", "heart", "pulse", "horizon", "dawn", "warm", "clockwork"],
  },
  {
    id: "joseph-just-for-a-moment", title: "Just for a moment",
    file: "Just for a moment (final).m4a", duration: 207,
    words: ["moment", "glimmer", "spark", "dew", "breath", "fleeting", "shimmer", "soft"],
  },
  {
    id: "joseph-sky-and-storm", title: "You were the sky and I was the storm",
    file: "You were the sky and I was the storm.m4a", duration: 213,
    // his father: "the sky … its storm … the ocean does a cliff … your darkness and your light"
    words: ["storm", "sky", "ocean", "cliff", "wave", "lightning", "thunder", "cloud", "sea", "rain", "raindrop", "tempest", "gale", "spray", "crest", "gust", "wind"],
  },
  {
    id: "joseph-whispers-in-the-trees", title: "Whispers in the trees - (The holy shit remix)",
    file: "Whispers in the trees - (The holy shit remix).m4a", duration: 245,
    words: ["tree", "forest", "redwood", "leaf", "leaves", "canopy", "branch", "grove", "moss", "fern", "trunk"],
  },
  {
    id: "joseph-in-motion", title: "In motion",
    file: "In motion.m4a", duration: 319,
    words: ["motion", "flow", "current", "river", "stream", "rolling", "spiral", "vortex", "swirl", "rush"],
  },
  {
    id: "joseph-time-pulls-slow", title: "Time pulls slow",
    file: "Time pulls slow.m4a", duration: 269,
    words: ["slow", "still", "dusk", "twilight", "amber", "tide", "sand", "honey", "drift", "hush"],
  },
  {
    id: "joseph-teaching-birds-to-fly", title: "Teaching birds to fly",
    file: "Teaching birds to fly.m4a", duration: 520, birds: true,
    words: ["bird", "wing", "feather", "flight", "fly", "soar", "nest", "sky", "air", "rising"],
  },
  {
    id: "joseph-without-a-brightness", title: "Without a brightness",
    file: "Without a brightness.m4a", duration: 277,
    words: ["night", "shadow", "dim", "void", "faint", "deep", "starless", "abyss", "obsidian", "smoke"],
  },
  {
    id: "joseph-burning-bush", title: "The burning bush",
    file: "The burning bush.m4a", duration: 374,
    words: ["fire", "flame", "burning", "ember", "blaze", "inferno", "heat", "molten", "smoulder", "sacred"],
  },
  {
    id: "joseph-worth-the-war", title: "Worth the war",
    file: "Worth the war.m4a", duration: 148,
    words: ["storm", "surge", "forge", "iron", "steel", "thunder", "lightning", "erupt", "fracture", "clash"],
  },
  {
    id: "joseph-closer-now", title: "Closer now",
    file: "Closer now.m4a", duration: 203,
    words: ["threshold", "doorway", "approach", "lantern", "warm", "glow", "nearer", "path", "gate"],
  },
  {
    id: "joseph-the-way", title: "The way",
    file: "The way.m4a", duration: 284,
    words: ["path", "road", "trail", "way", "lantern", "bridge", "stair", "pilgrim", "threshold", "journey", "corridor", "passage", "ascent"],
  },
  {
    id: "joseph-ill-be-your-home", title: "I'll be your home",
    file: "I'll be your home.m4a", duration: 297,
    words: ["hearth", "doorway", "window", "threshold", "warm", "shelter", "welcome", "lantern", "home"],
  },
  {
    id: "joseph-i-am", title: "I am",
    file: "I am.m4a", duration: 220,
    words: ["presence", "radiant", "core", "pillar", "sun", "luminous", "cosmos", "self", "source"],
  },
  {
    id: "joseph-sixteen-thousand-days", title: "Sixteen thousand days",
    file: "Sixteen thousand days.m4a", duration: 288,
    words: ["sunrise", "sunset", "season", "years", "days", "horizon", "dawn", "dusk", "orbit", "cycle"],
  },
  {
    id: "joseph-i-was-here", title: "I was here (Original)",
    file: "I was here (Original).m4a", duration: 240,
    words: ["stone", "trace", "carved", "ruin", "echo", "memory", "sand", "footprint", "ancient", "weathered"],
  },
  {
    id: "joseph-a-better-wish", title: "A better wish",
    file: "A better wish.m4a", duration: 270,
    words: ["wish", "star", "lantern", "candle", "constellation", "hope", "firefl", "glimmer", "night sky"],
  },
  {
    id: "joseph-time", title: "Time",
    file: "Time.m4a", duration: 243,
    words: ["orbit", "cycle", "spiral", "tide", "clock", "pendulum", "time", "rotation", "wheel"],
  },
  {
    id: "joseph-from-the-cradle", title: "From the cradle falls the mind that tries to fly",
    file: "From the cradle falls the mind that tries to fly.m4a", duration: 290,
    words: ["fall", "ascend", "rising", "drift", "float", "updraft", "sky", "weightless", "cradle", "aloft"],
  },
  {
    id: "joseph-road-less-traveled", title: "I took the road less traveled by (original 3)",
    file: "I took the road less traveled by (original 3).m4a", duration: 230,
    words: ["road", "path", "forest", "wood", "trail", "autumn", "meadow", "fork", "grass", "hill"],
  },
  {
    id: "joseph-closer-now-2", title: "Closer now (II)",
    file: "Closer now-2.m4a", duration: 270,
    words: ["dawn", "threshold", "approach", "glow", "warm", "lantern", "gate", "nearer", "sunrise"],
  },
  {
    id: "joseph-butterfly", title: "Maybe we're like the butterfly",
    file: "Maybe we’re like the butterfly.m4a", duration: 254,
    words: ["butterfly", "wing", "bloom", "flower", "garden", "petal", "chrysalis", "meadow", "blossom"],
  },
  {
    // file title "(THE BIG ENDING FUCKING FINAL)Inspired by FADED OUTLINES
    // EXPERIMENT" — Joseph: "The big fucking ending is actually (Faded Outlines)"
    id: "joseph-faded-outlines", title: "Faded Outlines",
    file: "(THE BIG ENDING FUCKING FINAL)Inspired by FADED OUTLINES EXPERIMENT.m4a", duration: 214,
    words: ["cosmos", "nebula", "galaxy", "radiant", "dissolve", "transcend", "vast", "spectral", "aurora", "peak"],
  },
  {
    id: "joseph-maybe", title: "Maybe",
    file: "Maybe.m4a", duration: 208,
    words: ["mist", "haze", "soft", "quiet", "drift", "still", "dawn", "veil", "pale"],
  },
];

const BY_ID = new Map(JOSEPH_TRACKS.map((t) => [t.id, t]));

/** The set in play order (unknown ids in the order are skipped). */
export function josephSet(order: string[] = JOSEPH_SET_ORDER): JosephTrack[] {
  return order.map((id) => BY_ID.get(id)).filter((t): t is JosephTrack => !!t);
}

/** Where the pack serves a Joseph track (gitignored local pack, static). */
export function josephTrackUrl(id: string): string {
  return `/tramokyo-pack/joseph/${id}.m4a`;
}

/** The analysis file scripts/import-joseph-set.ts writes. */
export const JOSEPH_ANALYSIS_URL = "/tramokyo-pack/joseph/joseph-set.json";
