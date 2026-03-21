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
  | "mandala"
  | "cosmos"
  | "neon"
  | "liquid"
  | "sacred"
  | "ethereal"
  | "fractal"
  | "warp"
  | "prismatic"
  | "mycelium"
  | "tesseract"
  | "dissolution"
  | "astral"
  | "horizon"
  | "abyss"
  | "temple"
  | "ember"
  | "meridian"
  | "tide"
  // 3D Worlds
  | "orb"
  | "field"
  | "rings"
  | "aurora"
  | "totem"
  | "wormhole"
  // Elemental
  | "fog"
  | "storm"
  | "dusk"
  | "snow"
  | "ocean"
  | "cascade"
  | "whirlpool"
  | "current"
  | "delta"
  | "flux"
  | "monsoon"
  | "haze"
  | "geyser"
  | "magma"
  | "permafrost"
  | "sandstorm"
  | "typhoon"
  | "vapor"
  | "chinook"
  | "caldera"
  | "thermal"
  | "tsunami"
  | "lightning"
  | "maelstrom"
  | "blizzard"
  | "avalanche"
  | "riptide"
  | "pyroclast"
  | "tempest"
  | "deluge"
  | "squall"
  | "erosion"
  | "fumarole"
  // Dark
  | "monolith"
  | "obsidian"
  | "crypt"
  | "phantom"
  | "wraith"
  | "umbra"
  | "chasm"
  | "inferno"
  | "plasma"
  | "torrent"
  | "entropy"
  | "vortex"
  | "glitch"
  | "corrosion"
  | "smother"
  | "fracture"
  | "aether"
  | "miasma"
  | "cinder"
  | "requiem"
  | "specter"
  | "blight"
  | "necrosis"
  | "pyre"
  | "dirge"
  | "revenant"
  | "banshee"
  | "omen"
  | "harbinger"
  | "dolmen"
  | "cairn"
  | "ossuary"
  | "oblivion"
  | "lament"
  | "hollow"
  | "perdition"
  // Cosmic
  | "pulsar"
  | "quasar"
  | "supernova"
  | "nebula"
  | "singularity"
  | "stardust"
  | "corona"
  | "solstice"
  | "drift"
  | "expanse"
  | "comet"
  | "magnetar"
  | "protostar"
  | "darkstar"
  | "redshift"
  | "accretion"
  | "perihelion"
  | "aphelion"
  | "nadir"
  | "equinox"
  | "parsec"
  | "solaris"
  | "lunar"
  | "nova"
  | "photon"
  | "helios"
  | "selene"
  | "ganymede"
  | "kepler"
  | "cassini"
  | "voyager"
  | "hubble"
  | "tycho"
  | "doppler"
  // Visionary
  | "sigil"
  | "portal"
  | "oracle"
  | "revelation"
  | "threshold"
  | "ascension"
  | "eclipse"
  | "rapture"
  | "prophecy"
  | "glyph"
  | "rune"
  | "mandorla"
  | "seraph"
  | "gnosis"
  | "yantra"
  | "ankh"
  | "alchemy"
  | "dharma"
  | "rosetta"
  | "ouroboros"
  | "merkaba"
  | "enneagram"
  | "caduceus"
  | "halo"
  | "sanctum"
  | "transfigure"
  | "invocation"
  | "nimbus"
  | "chalice"
  | "torii"
  | "aegis"
  | "vesper"
  | "avatar"
  | "covenant"
  // Organic
  | "moss"
  | "coral"
  | "bloom"
  | "spore"
  | "chrysalis"
  | "plankton"
  | "lichen"
  | "dendrite"
  | "membrane"
  | "growth"
  | "enzyme"
  | "synapse"
  | "mitosis"
  | "pollen"
  | "symbiosis"
  | "tendril"
  | "rhizome"
  | "chitin"
  | "cortex"
  | "axon"
  | "phylum"
  | "canopy"
  | "nectar"
  | "marrow"
  | "capillary"
  | "ventricle"
  | "alveoli"
  | "follicle"
  | "kelp"
  | "mangrove"
  | "cocoon"
  | "blossom"
  | "metamorph"
  | "peristalsis"
  // Geometry
  | "lattice"
  | "helix"
  | "weave"
  | "prism"
  | "spiral"
  | "torus"
  | "fibonacci"
  | "geodesic"
  | "penrose"
  | "moire"
  | "cells"
  | "quasicrystal"
  | "tensegrity"
  | "catenary"
  | "hyperbolic"
  | "interference"
  | "tessellation"
  | "origami"
  | "astroid"
  | "cardioid"
  | "lissajous"
  | "cymatic"
  | "chladni"
  | "guilloche"
  | "kolam"
  | "trefoil"
  | "quatrefoil"
  | "involute"
  | "caustic"
  | "frieze"
  | "rosette"
  | "roulette"
  | "deltoid"
  | "nephroid"
  | "epicycle"
  // Nature (new)
  | "river"
  | "rain"
  | "ripple"
  | "breeze"
  | "zephyr"
  | "flame"
  | "wildfire"
  | "amoeba"
  | "cytoplasm"
  | "firefly"
  | "reef"
  | "abyssal"
  | "starfield"
  | "shimmer"
  | "radiance"
  // 3D Worlds (new)
  | "galaxy"
  | "depths"
  | "bonfire"
  | "crystal"
  | "dna"
  | "swarm"
  | "lotus"
  | "cloud"
  | "waterfall"
  | "terrain"
  | "obelisk"
  | "wave"
  | "silk"
  | "orbit"
  | "pillar"
  | "seabed"
  | "molecule"
  | "blackhole"
  | "cage"
  | "pendulum"
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
  | "monochrome";

const MOOD_SHADER_MAP: Record<Mood, VisualizerMode> = {
  melancholic: "cosmos",
  intense: "prismatic",
  dreamy: "ethereal",
  mystical: "sacred",
  chaotic: "dissolution",
  hypnotic: "warp",
  flowing: "liquid",
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
