import type { AnalysisResult, AnalysisSummary } from "./types";
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
  | "crystal"
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
  // Review pack — under curation
  | "r-bokeh"
  | "r-mercury"
  | "r-tendrils"
  | "r-stardust"
  | "r-embers"
  | "r-kaleido"
  | "r-grid-pulse"
  | "r-blackhole"
  | "r-soap"
  | "r-bolt"
  | "r-frostgrow"
  | "r-molten"
  | "r-smokerings"
  | "r-circuit"
  | "r-petals"
  | "r-codefall"
  | "r-caustics"
  | "r-growth"
  | "r-shards"
  | "r-motes"
  | "r-seaglass"
  | "r-fireflies"
  | "r-silk"
  | "r-inkdrops"
  | "r-confetti"
  | "r-bioglow"
  | "r-stained"
  | "r-pollen"
  | "r-droplets"
  | "r-prism"
  // Review pack #2
  | "r2-curlswarm"
  | "r2-spiralgal"
  | "r2-marble"
  | "r2-interference"
  | "r2-constellation"
  | "r2-fibers"
  | "r2-kelvin"
  | "r2-darkmatter"
  | "r2-corona"
  | "r2-splatter"
  | "r2-crystalline"
  | "r2-thermal"
  | "r2-magnetic"
  | "r2-ribbon"
  | "r2-mitosis"
  | "r2-coral"
  | "r2-ferrofluid"
  | "r2-neonnoir"
  | "r2-starlitmist"
  | "r2-zerog"
  | "r2-nebula2"
  | "r2-fishschool"
  | "r2-reactdiff"
  | "r2-oilslick"
  | "r2-abyss"
  | "r2-fireworks"
  | "r2-chromatic"
  | "r2-glitch"
  | "r2-photon"
  | "r2-web"
  | "r2-tessellation"
  | "r2-holo"
  | "r2-oxidation"
  | "r2-velvet"
  | "r2-avalanche"
  | "r2-thunderhead"
  | "r2-golden"
  | "r2-paperfold"
  | "r2-pixie"
  | "r2-moss"
  | "r2-fjord"
  | "r2-heavysnow"
  | "r2-comet"
  | "r2-mutedglow"
  | "r2-infrared"
  | "r2-portalrim"
  | "r2-spore"
  | "r2-globe"
  | "r2-quantum"
  | "r2-sunsetcascade"
  // Review pack #3
  | "r3-veilflow" | "r3-mistspirals" | "r3-spirittrails" | "r3-ghostribbons" | "r3-ethercurrents"
  | "r3-silkwind" | "r3-plasmaveil" | "r3-auroramist" | "r3-dreamtendrils" | "r3-emberwisps"
  | "r3-shadowflow" | "r3-lightrivers" | "r3-biotrail" | "r3-aurorastreams" | "r3-waveveil"
  | "r3-mercurypool" | "r3-moltenglass" | "r3-liquidpearl" | "r3-honeydrip" | "r3-waxflow"
  | "r3-meltedgold" | "r3-lavacrust" | "r3-boilingcream" | "r3-inkpool" | "r3-tarbubbles"
  | "r3-galaxyfluid" | "r3-plasmaocean" | "r3-plasmastorm" | "r3-lightningveil" | "r3-coronastreams"
  | "r3-solarwind" | "r3-stellarribbon" | "r3-magneticwisps" | "r3-iontrails" | "r3-arcdischarge"
  | "r3-teslacoil" | "r3-balllightning" | "r3-myceliumpulse" | "r3-coralpulse" | "r3-fernunfurl"
  | "r3-neuronpulse" | "r3-capillary" | "r3-mossglow" | "r3-lichenpulse" | "r3-seaweedsway"
  | "r3-underwatervines" | "r3-sleepingbloom" | "r3-peelingbark" | "r3-rootspulse"
  | "r3-cosmicmist" | "r3-nebulaveil" | "r3-milkyveil" | "r3-stellarmist" | "r3-cosmicriver"
  | "r3-starlightveil" | "r3-darkcloud" | "r3-cosmictide" | "r3-interstellarflow" | "r3-voidshimmer"
  | "r3-quasarhaze" | "r3-galacticarms" | "r3-emberpool" | "r3-sunblush" | "r3-fireveil"
  | "r3-forgemist" | "r3-warmglowpool" | "r3-magmaveil" | "r3-coalpulse" | "r3-dawnfire"
  | "r3-sunsetveil" | "r3-goldenhaze" | "r3-fogriver" | "r3-heatshimmer" | "r3-mistcurtain"
  | "r3-dawnhaze" | "r3-monsoonveil" | "r3-deserthaze" | "r3-forestmist" | "r3-canyonhaze"
  | "r3-mountainmist" | "r3-cloudveil" | "r3-fairyglow" | "r3-stardust2" | "r3-moonglow"
  | "r3-spiritflame" | "r3-wishtrails" | "r3-dreamparticles" | "r3-lullaby" | "r3-memoryflow"
  | "r3-mirage" | "r3-auroradream" | "r3-waveflow" | "r3-ripplecascade" | "r3-pulseringssoft"
  | "r3-breathglow" | "r3-heartwarmth" | "r3-softorbit" | "r3-gentletide" | "r3-innerglow"
  | "r3-quietlight"
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
  // "nebula" was removed from the shader registry — remapped to
  // existing calm/cosmic shaders that fit each mood.
  melancholic: "dusk",
  intense: "inferno",
  dreamy: "drift",
  mystical: "expanse",
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
export function detectVibe(analysis: AnalysisResult, summary?: AnalysisSummary | null): VibeResult {
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
