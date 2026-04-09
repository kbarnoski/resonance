import type { AnalysisResult } from "./types";
export type Mood =
  | "melancholic"
  | "intense"
  | "dreamy"
  | "mystical"
  | "chaotic"
  | "hypnotic"
  | "flowing"
  | "transcendent";
export type VisualizerMode =
  // Original
  | "neon"
  | "astral"
  | "ember"
  | "tide"
  // 3D Worlds
  | "orb"
  // Elemental
  | "fog"
  | "dusk"
  | "snow"
  | "ocean"
  | "cascade"
  | "whirlpool"
  | "flux"
  | "monsoon"
  | "magma"
  | "typhoon"
  | "chinook"
  | "thermal"
  | "lightning"
  | "maelstrom"
  | "deluge"
  // Elemental (new)
  | "rime"
  | "cirrus"
  | "torrent"
  | "swell"
  | "aurora-borealis"
  | "estuary"
  // Dark
  | "umbra"
  | "inferno"
  | "plasma"
  | "vortex"
  | "hollow"
  // Dark (new)
  | "terminus"
  | "maelstrom-dark"
  | "obsidian-flow"
  | "furnace"
  // Cosmic
  | "pulsar"
  | "quasar"
  | "supernova"
  | "nebula"
  | "singularity"
  | "drift"
  | "expanse"
  | "protostar"
  | "redshift"
  | "nadir"
  | "parsec"
  | "nova"
  | "photon"
  | "selene"
  | "kepler"
  | "hubble"
  | "doppler"
  // Cosmic (new)
  | "aurora-wave"
  | "zenith"
  | "lightyear"
  | "event-horizon"
  // Visionary
  | "portal"
  | "revelation"
  | "threshold"
  | "rapture"
  | "mandorla"
  | "seraph"
  | "halo"
  // Visionary (new)
  | "dharma"
  | "gnosis"
  | "chakra"
  | "vestige"
  | "empyrean"
  | "stigmata"
  | "aureole"
  | "apophatic"
  | "yantra"
  | "satori"
  | "merkaba"
  | "soma"
  // Organic
  | "spore"
  | "chrysalis"
  | "plankton"
  | "lichen"
  | "enzyme"
  | "pollen"
  | "symbiosis"
  | "kelp"
  // Organic (new)
  | "flagella"
  | "mycelium"
  | "coral"
  | "synapse"
  | "biolume"
  | "diatom"
  | "biofilm"
  // Geometry
  | "spiral"
  | "geodesic"
  | "moire"
  | "catenary"
  | "astroid"
  | "cardioid"
  | "lissajous"
  | "cymatic"
  | "guilloche"
  | "trefoil"
  | "quatrefoil"
  | "involute"
  | "rosette"
  | "roulette"
  | "deltoid"
  | "nephroid"
  | "epicycle"
  // Nature (new)
  | "rain"
  | "ripple"
  | "flame"
  | "starfield"
  | "radiance"
  // 3D Worlds (new)
  | "galaxy"
  | "depths"
  | "crystal"
  | "swarm"
  | "cloud"
  | "wave"
  | "seabed"
  | "cage"
  // AI Imagery
  | "dreamscape"
  | "visions"
  | "morphic"
  | "liminal"
  | "cathedral"
  | "tundra"
  | "canyon"
  | "cavern"
  | "glacier"
  | "volcano"
  | "jungle"
  | "seafloor"
  | "summit"
  | "fjord"
  | "mesa"
  | "ruins"
  | "monastery"
  | "observatory"
  | "fortress"
  | "colosseum"
  | "catacombs"
  | "sanctuary"
  | "ziggurat"
  | "mirror"
  | "recursive"
  | "mobius"
  | "hypercube"
  | "chronos"
  | "parallax"
  | "olympus"
  | "valhalla"
  | "elysium"
  | "avalon"
  | "nirvana"
  | "purgatorio"
  | "solitude"
  | "ecstasy"
  | "wonder"
  | "serenity"
  | "fury"
  | "cenote"
  | "pantheon"
  | "bioluminescence"
  | "petrified"
  | "monochrome"
  | "constellation"
  // Geometry (new batch)
  | "helix"
  | "harmonograph"
  | "voronoi-flow"
  | "mobius-strip"
  | "fibonacci-spiral"
  | "interference"
  | "fractal-tree"
  | "weave"
  // Geometry (April 2026)
  | "parabola"
  | "cassegrain"
  | "cissoid"
  | "agnesi"
  | "strophoid"
  | "brachistochrone"
  | "chladni"
  | "caustic-pool"
  | "zoetrope"
  | "tangent-field"
  | "pedal-curve"
  | "ruled-surface"
  | "waveform"
  | "epicycloid"
  // Organic (April 2026)
  | "pelagic"
  | "zooid"
  | "laminar"
  | "whorl"
  | "stamen"
  | "meristem"
  // Dark (April 2026)
  | "eclipse-ring"
  | "smolder"
  | "crucible"
  // Dark (April 2026 — visible dark)
  | "ember-drift"
  | "deep-current"
  | "molten-vein"
  | "dark-aurora"
  | "shadow-fire"
  | "dark-tide"
  | "smoke-signal"
  | "iron-forge"
  | "abyss-light"
  | "catacomb-torch"
  | "blood-moon"
  | "witch-light"
  | "dark-crystal"
  | "night-rain"
  | "volcanic"
  | "dark-bloom"
  | "lightning-field"
  | "dark-nebula"
  | "onyx"
  | "night-forest"
  // Visionary (April 2026)
  | "kenosis"
  | "numinous"
  | "anima"
  | "covenant"
  | "agape"
  | "vespers"
  | "jubilee"
  | "pilgrimage"
  | "cataphatic"
  | "hesychasm"
  | "kairos"
  | "lectio"
  | "credo"
;
export const MOOD_REALM_MAP: Record<Mood, string[]> = {
  melancholic:  ["ocean", "winter", "pain"],
  intense:      ["hell", "storm", "machine"],
  dreamy:       ["heaven", "garden", "spring"],
  mystical:     ["temple", "cosmos", "labyrinth"],
  chaotic:      ["storm", "machine", "hell"],
  hypnotic:     ["labyrinth", "machine", "cosmos"],
  flowing:      ["ocean", "garden", "spring"],
  transcendent: ["heaven", "cosmos", "temple"],
};

const MOOD_SHADER_MAP: Record<Mood, VisualizerMode> = {
  melancholic: "nebula",
  intense: "inferno",
  dreamy: "drift",
  mystical: "nebula",
  chaotic: "plasma",
  hypnotic: "drift",
  flowing: "drift",
  transcendent: "astral",
};
interface VibeResult {
  mood: Mood;
  shader: VisualizerMode;
  scores: Record<Mood, number>;
}
function isMinorKey(key: string | null): boolean {
  if (!key) return false;
  return /minor|min|m$/i.test(key) && !/maj/i.test(key);
}
function isMajorKey(key: string | null): boolean {
  if (!key) return false;
  return /major|maj/i.test(key) || (!isMinorKey(key) && /^[A-G][#b]?$/.test(key.trim()));
}
function countExtensions(chords: { chord: string }[]): number {
  let count = 0;
  for (const { chord } of chords) {
    if (/7|9|11|13|dim|aug|alt|\+/.test(chord)) count++;
  }
  return count;
}
function uniqueChordCount(chords: { chord: string }[]): number {
  return new Set(chords.map((c) => c.chord)).size;
}
function averageChordDuration(chords: { duration: number }[]): number {
  if (chords.length === 0) return 0;
  return chords.reduce((sum, c) => sum + c.duration, 0) / chords.length;
}
function summaryKeywords(summary: string | undefined, keywords: string[]): number {
  if (!summary) return 0;
  const lower = summary.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits++;
  }
  return hits;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function detectVibe(analysis: AnalysisResult, summary?: any): VibeResult {
  const tempo = analysis.tempo ?? 100;
  const key = analysis.key_signature;
  const chords = analysis.chords ?? [];
  const unique = uniqueChordCount(chords);
  const extensions = countExtensions(chords);
  const avgDuration = averageChordDuration(chords);
  const minor = isMinorKey(key);
  const major = isMajorKey(key);
  const summaryText: string = summary?.overview ?? "";
  const scores: Record<Mood, number> = {
    melancholic: 0,
    intense: 0,
    dreamy: 0,
    mystical: 0,
    chaotic: 0,
    hypnotic: 0,
    flowing: 0,
    transcendent: 0,
  };
  // Melancholic: minor key + slow tempo
  if (minor) scores.melancholic += 3;
  if (tempo < 90) scores.melancholic += 2;
  if (tempo < 70) scores.melancholic += 1;
  if (avgDuration > 2) scores.melancholic += 1;
  scores.melancholic += summaryKeywords(summaryText, ["sad", "melanchol", "somber", "dark", "minor", "longing", "wistful"]);
  // Intense: fast tempo or chromatic chords
  if (tempo > 130) scores.intense += 3;
  if (tempo > 150) scores.intense += 1;
  if (extensions > chords.length * 0.3) scores.intense += 1;
  const chromaticChords = chords.filter((c) => /dim|aug|alt|\+|#|b/.test(c.chord)).length;
  if (chromaticChords > 3) scores.intense += 2;
  scores.intense += summaryKeywords(summaryText, ["intense", "energetic", "powerful", "driving", "aggressive", "fast"]);
  // Dreamy: major + moderate tempo + jazz extensions
  if (major) scores.dreamy += 2;
  if (tempo >= 80 && tempo <= 120) scores.dreamy += 2;
  if (extensions > chords.length * 0.4) scores.dreamy += 2;
  scores.dreamy += summaryKeywords(summaryText, ["dream", "gentle", "soft", "float", "ethereal", "warm", "lush"]);
  // Mystical: modal borrowing, unusual chords
  const unusualChords = chords.filter((c) => /dim|aug|alt|sus|#|b5/.test(c.chord)).length;
  if (unusualChords > 2) scores.mystical += 2;
  if (unusualChords > 5) scores.mystical += 1;
  if (unique > 8) scores.mystical += 1;
  if (minor) scores.mystical += 1;
  scores.mystical += summaryKeywords(summaryText, ["mystic", "mysterious", "modal", "unusual", "strange", "exotic", "ancient"]);
  // Chaotic: many unique chords + fast harmonic rhythm
  if (unique > 10) scores.chaotic += 2;
  if (unique > 15) scores.chaotic += 1;
  if (avgDuration < 1.5 && chords.length > 10) scores.chaotic += 2;
  if (tempo > 120) scores.chaotic += 1;
  scores.chaotic += summaryKeywords(summaryText, ["chaotic", "complex", "restless", "turbulent", "frantic", "unpredictable"]);
  // Hypnotic: repetitive progressions, few unique chords
  if (unique <= 4 && chords.length > 6) scores.hypnotic += 3;
  if (unique <= 6 && chords.length > 10) scores.hypnotic += 1;
  if (avgDuration > 1.5) scores.hypnotic += 1;
  if (tempo >= 80 && tempo <= 120) scores.hypnotic += 1;
  scores.hypnotic += summaryKeywords(summaryText, ["hypnotic", "repetit", "loop", "trance", "meditat", "droning"]);
  // Flowing: moderate tempo, smooth harmonic rhythm
  if (tempo >= 85 && tempo <= 115) scores.flowing += 2;
  if (avgDuration >= 1.5 && avgDuration <= 3) scores.flowing += 2;
  if (unique >= 4 && unique <= 10) scores.flowing += 1;
  scores.flowing += summaryKeywords(summaryText, ["flowing", "smooth", "fluid", "lyrical", "graceful", "natural"]);
  // Transcendent: slow + rich harmony + major key
  if (major) scores.transcendent += 2;
  if (tempo < 90) scores.transcendent += 2;
  if (extensions > chords.length * 0.3) scores.transcendent += 1;
  if (avgDuration > 2) scores.transcendent += 1;
  scores.transcendent += summaryKeywords(summaryText, ["transcend", "sublime", "beautiful", "majestic", "grand", "spiritual", "uplift"]);
  // Find top mood
  let topMood: Mood = "flowing";
  let topScore = -1;
  for (const [mood, score] of Object.entries(scores) as [Mood, number][]) {
    if (score > topScore) {
      topScore = score;
      topMood = mood;
    }
  }
  return {
    mood: topMood,
    shader: MOOD_SHADER_MAP[topMood],
    scores,
  };
}
