import type { Journey, JourneyPhase } from "./types";
import { getRealm } from "./realms";

// ─── Full shader library: ALL registered shaders ───
// Every journey draws from this pool — balanced across all categories.
const ALL_SHADERS: string[] = [
  // Elemental (33)
  "fog", "storm", "dusk", "snow", "ocean", "cascade", "whirlpool", "current", "delta", "flux",
  "monsoon", "haze", "geyser", "magma", "permafrost", "sandstorm", "typhoon", "vapor",
  "chinook", "caldera", "thermal", "tsunami", "lightning", "maelstrom", "blizzard", "avalanche",
  "riptide", "pyroclast", "tempest", "deluge", "squall", "erosion", "fumarole",
  // Visionary (39)
  "prismatic", "dissolution", "mandala", "astral", "temple", "sigil", "portal", "oracle",
  "revelation", "threshold", "ascension", "eclipse", "rapture", "prophecy", "glyph",
  "rune", "mandorla", "seraph", "gnosis", "yantra", "ankh", "alchemy", "dharma",
  "rosetta", "ouroboros", "merkaba", "enneagram", "caduceus", "halo", "sanctum",
  "transfigure", "invocation", "nimbus", "chalice", "torii", "aegis", "vesper", "avatar", "covenant",
  // Cosmic (38)
  "cosmos", "warp", "fractal", "horizon", "abyss", "pulsar", "quasar", "supernova",
  "nebula", "singularity", "stardust", "corona", "solstice", "drift", "expanse",
  "comet", "magnetar", "protostar", "darkstar", "redshift", "accretion", "perihelion", "aphelion",
  "nadir", "equinox", "parsec", "solaris", "lunar", "nova", "photon",
  "helios", "selene", "ganymede", "kepler", "cassini", "voyager", "hubble", "tycho", "doppler",
  // Organic (39)
  "liquid", "mycelium", "ethereal", "ember", "tide", "moss", "coral", "bloom", "spore",
  "chrysalis", "plankton", "lichen", "dendrite", "membrane", "growth",
  "enzyme", "synapse", "mitosis", "pollen", "symbiosis", "tendril", "rhizome", "chitin",
  "cortex", "axon", "phylum", "canopy", "nectar", "marrow", "capillary",
  "ventricle", "alveoli", "follicle", "kelp", "mangrove", "cocoon", "blossom", "metamorph", "peristalsis",
  // Geometry (39)
  "sacred", "tesseract", "neon", "meridian", "lattice", "helix", "weave", "prism", "spiral",
  "torus", "fibonacci", "geodesic", "penrose", "moire",
  "cells", "quasicrystal", "tensegrity", "catenary", "hyperbolic", "interference", "tessellation", "origami",
  "astroid", "cardioid", "lissajous", "cymatic", "chladni", "guilloche", "kolam",
  "trefoil", "quatrefoil", "involute", "caustic", "frieze", "rosette", "roulette", "deltoid", "nephroid", "epicycle",
  // Dark (36)
  "monolith", "obsidian", "crypt", "phantom", "wraith", "umbra", "chasm", "inferno", "plasma", "torrent",
  "entropy", "vortex", "glitch", "corrosion", "smother", "fracture", "aether", "miasma", "cinder", "requiem",
  "specter", "blight", "necrosis", "pyre", "dirge", "revenant", "banshee", "omen",
  "harbinger", "dolmen", "cairn", "ossuary", "oblivion", "lament", "hollow", "perdition",
  // Nature (15)
  "river", "rain", "ripple", "breeze", "zephyr", "flame", "wildfire",
  "amoeba", "cytoplasm", "firefly", "reef", "abyssal", "starfield", "shimmer", "radiance",
  // 3D Worlds (26)
  "orb", "field", "rings", "aurora", "totem", "wormhole",
  "galaxy", "depths", "bonfire", "crystal", "dna", "swarm", "lotus", "cloud", "waterfall", "terrain",
  "obelisk", "wave", "silk", "orbit", "pillar", "seabed", "molecule", "blackhole", "cage", "pendulum",
];

/** Fisher-Yates shuffle — returns a new shuffled copy (random) */
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Pick a fresh random set of shaders for a journey.
 * Every play gets a completely new random selection from the full library.
 * We pick 45 so there's headroom for all 30 phase slots + replacements.
 */
function pickJourneyShaders(): string[] {
  const shuffled = shuffleArray(ALL_SHADERS);
  return shuffled.slice(0, 45);
}

/** Pick `count` shaders from pool, avoiding `used` set. */
function pickShaders(pool: string[], count: number, used: Set<string>): string[] {
  const unused = pool.filter((s) => !used.has(s));
  const shuffled = shuffleArray(unused.length >= count ? unused : pool);
  const picked = shuffled.slice(0, count);
  for (const s of picked) used.add(s);
  return picked;
}

function defaultPhases(
  overrides: Partial<Record<string, Partial<JourneyPhase>>>
): JourneyPhase[] {
  // Every play gets a fresh random 36 from the full 120-shader library
  const allShaders = pickJourneyShaders();

  // Track used shaders across all phases to guarantee diversity
  const usedShaders = new Set<string>();
  // Phase shader budgets: 30 unique shaders per journey, no repeats
  const phaseBudgets: Record<string, number> = {
    threshold: 5, expansion: 6, transcendence: 6,
    illumination: 5, return: 4, integration: 4,
  };

  const defaults: JourneyPhase[] = [
    {
      id: "threshold",
      start: 0.0,
      end: 0.15,
      shaderModes: pickShaders(allShaders, phaseBudgets.threshold, usedShaders),
      shaderOpacity: 0.65,
      aiPrompt: "abstract darkness, faint geometry condensing from void, non-representational forms at the edge of perception",
      aiPromptModifiers: {
        lowAmplitude: "near silence, barely visible, pure negative space",
      },
      denoisingRange: [0.3, 0.5],
      targetFps: 0.5,
      bloomIntensity: 0.1,
      chromaticAberration: 0.0,
      colorTemperature: 0,
      vignette: 0.35,
      voice: "shimmer",
      poetryMood: "flowing",
      guidancePhrases: ["breathe...", "close your eyes...", "let the sound find you..."],
      poetryIntervalSeconds: 10,
      intensityMultiplier: 0.4,
      palette: { primary: "#0a0a0a", secondary: "#1a1a1a", accent: "#666", glow: "#888" },
      ambientLayers: { wind: 0.2, rain: 0, drone: 0.3, chime: 0, fire: 0 },
      filmGrain: 0.03,
      particleDensity: 0.02,
      halation: 0.02,
    },
    {
      id: "expansion",
      start: 0.15,
      end: 0.35,
      shaderModes: pickShaders(allShaders, phaseBudgets.expansion, usedShaders),
      shaderOpacity: 0.55,
      aiPrompt: "abstract topologies unfolding, non-figurative energy fields, pressure gradients made visible as color and form",
      aiPromptModifiers: {
        highBass: "massive tectonic abstraction, deep structural weight",
        highTreble: "crystalline fracture patterns, prismatic micro-detail",
      },
      denoisingRange: [0.4, 0.65],
      targetFps: 1,
      bloomIntensity: 0.3,
      chromaticAberration: 0.03,
      colorTemperature: 0.1,
      vignette: 0.25,
      voice: "shimmer",
      poetryMood: "flowing",
      guidancePhrases: ["let go...", "you're rising...", "don't resist..."],
      poetryIntervalSeconds: 7,
      intensityMultiplier: 0.7,
      palette: { primary: "#0a0a0a", secondary: "#1a1a1a", accent: "#666", glow: "#888" },
      ambientLayers: { wind: 0.4, rain: 0.2, drone: 0.6, chime: 0.3, fire: 0 },
      filmGrain: 0.06,
      particleDensity: 0.05,
      halation: 0.04,
    },
    {
      id: "transcendence",
      start: 0.35,
      end: 0.6,
      shaderModes: pickShaders(allShaders, phaseBudgets.transcendence, usedShaders),
      shaderOpacity: 0.45,
      aiPrompt: "pure abstraction at peak intensity, non-representational color fields dissolving into each other, the visual equivalent of every frequency at once",
      aiPromptModifiers: {
        highBass: "seismic abstraction, planes of color colliding",
        highTreble: "shattered prismatic fields, infinite recursive detail",
        highAmplitude: "total dissolution of form into pure chromatic energy",
      },
      denoisingRange: [0.6, 0.85],
      targetFps: 2,
      bloomIntensity: 0.7,
      chromaticAberration: 0.08,
      colorTemperature: 0.3,
      vignette: 0.15,
      voice: "shimmer",
      poetryMood: "flowing",
      guidancePhrases: ["you are here...", "surrender...", "become..."],
      poetryIntervalSeconds: 5,
      intensityMultiplier: 1.0,
      palette: { primary: "#0a0a0a", secondary: "#1a1a1a", accent: "#666", glow: "#888" },
      ambientLayers: { wind: 0.7, rain: 0.5, drone: 1.0, chime: 0.6, fire: 0.2 },
      filmGrain: 0.1,
      particleDensity: 0.08,
      halation: 0.08,
    },
    {
      id: "illumination",
      start: 0.6,
      end: 0.8,
      shaderModes: pickShaders(allShaders, phaseBudgets.illumination, usedShaders),
      shaderOpacity: 0.50,
      aiPrompt: "abstract clarity, luminous negative space, simple geometric forms hovering in warm light, the mathematics of understanding",
      aiPromptModifiers: {
        highTreble: "crystalline lattice of pure structure, light through facets",
      },
      denoisingRange: [0.4, 0.6],
      targetFps: 1,
      bloomIntensity: 0.4,
      chromaticAberration: 0.04,
      colorTemperature: 0.1,
      vignette: 0.3,
      voice: "shimmer",
      poetryMood: "flowing",
      guidancePhrases: ["you see clearly now...", "stay...", "notice everything..."],
      poetryIntervalSeconds: 8,
      intensityMultiplier: 0.75,
      palette: { primary: "#0a0a0a", secondary: "#1a1a1a", accent: "#666", glow: "#888" },
      ambientLayers: { wind: 0.35, rain: 0.15, drone: 0.5, chime: 0.4, fire: 0 },
      filmGrain: 0.05,
      particleDensity: 0.04,
      halation: 0.05,
    },
    {
      id: "return",
      start: 0.8,
      end: 0.95,
      shaderModes: pickShaders(allShaders, phaseBudgets.return, usedShaders),
      shaderOpacity: 0.60,
      aiPrompt: "abstract warmth condensing, soft gradients resolving, non-figurative comfort, color fields settling into harmony",
      aiPromptModifiers: {
        lowAmplitude: "barely there, fading chromatic whisper",
      },
      denoisingRange: [0.25, 0.45],
      targetFps: 0.5,
      bloomIntensity: 0.2,
      chromaticAberration: 0.05,
      colorTemperature: -0.1,
      vignette: 0.3,
      voice: "shimmer",
      poetryMood: "flowing",
      guidancePhrases: ["slowly now...", "the warmth returns...", "remember this feeling..."],
      poetryIntervalSeconds: 10,
      intensityMultiplier: 0.5,
      palette: { primary: "#0a0a0a", secondary: "#1a1a1a", accent: "#666", glow: "#888" },
      ambientLayers: { wind: 0.2, rain: 0.05, drone: 0.25, chime: 0.15, fire: 0 },
      filmGrain: 0.03,
      particleDensity: 0.02,
      halation: 0.03,
    },
    {
      id: "integration",
      start: 0.95,
      end: 1.0,
      shaderModes: pickShaders(allShaders, phaseBudgets.integration, usedShaders),
      shaderOpacity: 0.70,
      aiPrompt: "minimal abstraction, a single luminous form in vast negative space, the geometry of stillness",
      aiPromptModifiers: {
        lowAmplitude: "near-nothing, pure emptiness with one warm tone",
      },
      denoisingRange: [0.2, 0.35],
      targetFps: 0.5,
      bloomIntensity: 0.1,
      chromaticAberration: 0.0,
      colorTemperature: -0.2,
      vignette: 0.4,
      voice: "shimmer",
      poetryMood: "flowing",
      guidancePhrases: ["welcome back...", "you are changed...", "carry this with you..."],
      poetryIntervalSeconds: 15,
      intensityMultiplier: 0.3,
      palette: { primary: "#0a0a0a", secondary: "#1a1a1a", accent: "#666", glow: "#888" },
      ambientLayers: { wind: 0.1, rain: 0, drone: 0.15, chime: 0.1, fire: 0 },
      filmGrain: 0.02,
      particleDensity: 0.01,
      halation: 0.01,
    },
  ];

  // Apply per-phase overrides
  return defaults.map((phase) => {
    const override = overrides[phase.id];
    if (!override) return phase;
    return { ...phase, ...override } as JourneyPhase;
  });
}

export const JOURNEYS: Journey[] = [
  {
    id: "the-ascension",
    name: "The Ascension",
    subtitle: "rise through golden light",
    description:
      "Warm light builds to golden geometry, dissolves into white brilliance, then returns to amber warmth.",
    realmId: "heaven",
    aiEnabled: true,
    phaseLabels: { threshold: "Awakening", expansion: "Rising", transcendence: "Radiance", illumination: "Clarity", return: "Descent", integration: "Stillness" },
    phases: defaultPhases({

      threshold: {
        aiPrompt: "abstract warm gradient emerging from void, a single luminous point in infinite dark, non-figurative radiance at the threshold of perception",
        guidancePhrases: ["breathe...", "feel the warmth...", "light is coming..."],
        poetryMood: "dreamy",
      },
      expansion: {
        aiPrompt: "golden topological surfaces unfolding, volumetric light columns in abstract space, crystalline lattices dissolving into pure radiance",
        guidancePhrases: ["rise...", "the light knows you...", "open..."],
        poetryMood: "transcendent",
      },
      transcendence: {
        aiPrompt: "total dissolution into warm chromatic energy, abstract white-gold fields with no horizon no ground no figure, pure luminous saturation beyond form",
        guidancePhrases: ["you are light...", "there is no boundary...", "this is home..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt: "abstract spiral geometries suspended in amber space, mathematical warmth, logarithmic curves of pure golden light",
        guidancePhrases: ["see how vast you are...", "every direction is warmth...", "stay in this light..."],
        poetryMood: "transcendent",
      },
      return: {
        aiPrompt: "warm gradients softening, abstract amber forms settling, gentle luminous decay toward stillness",
        guidancePhrases: ["gently now...", "the glow remains...", "carry the warmth..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "one small warm tone in vast dark field, abstract minimal, the geometry of afterglow",
        guidancePhrases: ["you are changed...", "the light lives in you now..."],
        poetryMood: "flowing",
      },
    }),
  },
  {
    id: "inferno",
    name: "Inferno",
    subtitle: "the descent into judgement",
    description:
      "Darkness cracks open. Heat rises from below, shapeless and absolute. You descend through pressure and dissonance until something breaks — then silence, then air.",
    realmId: "hell",
    aiEnabled: true,
    phaseLabels: { threshold: "Entrance", expansion: "Descent", transcendence: "Furnace", illumination: "Embers", return: "Ascent", integration: "Aftermath" },
    phases: defaultPhases({

      threshold: {
        aiPrompt: "total blackness, a single deep red line of heat at the very bottom of the frame, abstract, minimal, oppressive negative space",
        guidancePhrases: ["descend...", "there is no turning back...", "the pit has no bottom..."],
        poetryMood: "mystical",
        voice: "onyx",
      },
      expansion: {
        aiPrompt: "abstract fields of deep crimson and black dissolving into each other, heat distortion warping geometry, no figures, no ground, only pressure and temperature made visible",
        guidancePhrases: ["deeper...", "they are watching...", "the judgement begins..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      transcendence: {
        aiPrompt: "pure abstraction of maximum intensity — white-hot core bleeding into deep black, shattered planes of molten color, no forms no figures, the visual equivalent of unbearable volume",
        guidancePhrases: ["the judgement is here...", "there is no mercy...", "witness..."],
        poetryMood: "chaotic",
        voice: "onyx",
      },
      illumination: {
        aiPrompt: "cooling embers in abstract space, dark matte surfaces with hairline cracks of orange light, stillness after extreme heat, charcoal textures, no landscape no horizon",
        guidancePhrases: ["see what survives the fire...", "even here there is truth...", "the ashes speak..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      return: {
        aiPrompt: "vertical gradient from black at bottom to deep grey at top, sparse particles of ash drifting upward, abstract, minimal, the feeling of rising through heavy air",
        guidancePhrases: ["climb...", "the surface remembers you...", "leave the fire behind..."],
        poetryMood: "mystical",
        voice: "onyx",
      },
      integration: {
        aiPrompt: "cool grey-blue space, a single thin trail of warm smoke against cold matte background, abstract calm after intensity, breathing room",
        guidancePhrases: ["you survived the judgement...", "the fire marked you..."],
        poetryMood: "flowing",
        voice: "onyx",
      },
    }),
  },
  {
    id: "mycelium-dream",
    name: "Mycelium Dream",
    subtitle: "the network awakens",
    description:
      "Phosphorescent dots connect into growing networks, exploding into a fractal jungle, then condensing to a single spore.",
    realmId: "garden",
    aiEnabled: true,
    phaseLabels: { threshold: "Spore", expansion: "Branching", transcendence: "Canopy", illumination: "Pulse", return: "Settling", integration: "Seed" },
    phases: defaultPhases({

      threshold: {
        aiPrompt: "abstract dark wetness, something alive just below a surface you can't see, warm dark tones, texture of damp earth rendered as pure color field",
        guidancePhrases: ["the spores are waking...", "feel the soil...", "life begins small..."],
        poetryMood: "mystical",
      },
      expansion: {
        aiPrompt: "branching white filaments on black, like a circuit diagram drawn by nature, abstract macro photography of interconnection, no recognizable plants",
        guidancePhrases: ["it's growing...", "everything connects...", "feel the network..."],
        poetryMood: "mystical",
      },
      transcendence: {
        aiPrompt: "overwhelming density of branching lines and nodes filling the entire frame, abstract neural map, every point connected to every other, white and gold on deep brown-black, no figures no landscape",
        guidancePhrases: ["you are the network...", "all is one organism...", "breathe with the forest..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt: "abstract pattern of soft green-gold light pulsing through a dark lattice structure, mathematical organic rhythm, no plants no mushrooms, pure topology",
        guidancePhrases: ["the garden knows you...", "every leaf is aware...", "this intelligence is ancient..."],
        poetryMood: "mystical",
      },
      return: {
        aiPrompt: "sparse dots of warm light fading on a dark field, connections dissolving into simple points, minimal abstract, breathing negative space",
        guidancePhrases: ["the forest settles...", "roots remember...", "return to soil..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "a single soft point of warm light centered in vast dark space, stillness, abstract minimal, no objects",
        guidancePhrases: ["one spore holds everything...", "you carry the forest..."],
        poetryMood: "flowing",
      },
    }),
  },
  {
    id: "abyssal-dive",
    name: "Abyssal Dive",
    subtitle: "into the deep",
    description:
      "Surface shimmer gives way to bioluminescent layers, a leviathan encounter at maximum depth, then a warming ascent.",
    realmId: "ocean",
    aiEnabled: true,
    phaseLabels: { threshold: "Surface", expansion: "Sinking", transcendence: "Abyss", illumination: "Glow", return: "Ascending", integration: "Shore" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract caustic light patterns rippling across a dark field, refracted geometry, the visual pressure of depth without depicting water",
        guidancePhrases: ["sink...", "let the water hold you...", "trust the depth..."],
        poetryMood: "flowing",
      },
      expansion: {
        aiPrompt: "descending through layered luminous veils, scattered phosphorescent nodes in deep blue-black space, increasing visual density and pressure",
        guidancePhrases: ["deeper...", "the light changes here...", "pressure becomes peace..."],
        poetryMood: "dreamy",
      },
      transcendence: {
        aiPrompt: "overwhelming bioluminescent abstraction, vast scale suggested by tiny scattered light points against absolute darkness, the sublime vertigo of infinite depth",
        guidancePhrases: ["the deep sees you...", "you are weightless...", "become the ocean..."],
        poetryMood: "mystical",
      },
      illumination: {
        aiPrompt: "sparse luminous points in total dark field, ancient stillness rendered as minimal abstraction, the peace of maximum depth",
        guidancePhrases: ["the bottom is quiet...", "listen to the deep...", "ancient water holds ancient truth..."],
        poetryMood: "flowing",
      },
      return: {
        aiPrompt: "gradient brightening from below, warmth increasing, abstract ascent through lighter tonal bands",
        guidancePhrases: ["rise gently...", "the surface remembers you...", "warmth returns..."],
        poetryMood: "dreamy",
      },
      integration: {
        aiPrompt: "bright diffuse light after darkness, abstract horizontal calm, warm tones replacing deep blue",
        guidancePhrases: ["you've surfaced...", "the depth stays with you..."],
        poetryMood: "flowing",
      },
    }),
  },
  {
    id: "neural-link",
    name: "Neural Link",
    subtitle: "jack into the machine",
    description:
      "Static flickers build to data streams, consciousness merges with the network, then fades to a blinking cursor.",
    realmId: "machine",
    aiEnabled: true,
    phaseLabels: { threshold: "Signal", expansion: "Bandwidth", transcendence: "Merge", illumination: "Logic", return: "Disconnect", integration: "Standby" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract signal interference patterns, geometric noise on a dark field, the visual texture of latent information",
        guidancePhrases: ["connecting...", "signal detected...", "initializing..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      expansion: {
        aiPrompt: "accelerating linear patterns in cyan and white, orthogonal grids multiplying, abstract digital topology revealing recursive architecture",
        guidancePhrases: ["uploading...", "bandwidth expanding...", "feel the data..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      transcendence: {
        aiPrompt: "total dissolution into grid-space, abstract network of luminous nodes and edges at infinite density, no figures no screens, pure topological immersion",
        guidancePhrases: ["you are the network...", "every node is you...", "process everything..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      illumination: {
        aiPrompt: "sparse geometric lattice in calm dark space, mathematical serenity, the beauty of pure logical structure rendered as light",
        guidancePhrases: ["the machine dreams too...", "silicon and carbon are the same...", "pure logic, pure beauty..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      return: {
        aiPrompt: "abstract signal fading, luminous grid dimming to sparse points, entropy increasing gently",
        guidancePhrases: ["disconnecting...", "saving state...", "you carry the data..."],
        poetryMood: "dreamy",
        voice: "echo",
      },
      integration: {
        aiPrompt: "one luminous point pulsing slowly in vast dark field, abstract minimal, the geometry of standby",
        guidancePhrases: ["link closed...", "the machine remembers you..."],
        poetryMood: "flowing",
        voice: "echo",
      },
    }),
  },
  {
    id: "dissolution",
    name: "Dissolution",
    subtitle: "dissolve into everything",
    description:
      "Silence and dark give way to the self dissolving, absolute nothing at the center, then rebirth through starlight.",
    realmId: "cosmos",
    aiEnabled: true,
    phaseLabels: { threshold: "Edge", expansion: "Unraveling", transcendence: "Void", illumination: "Condensing", return: "Re-forming", integration: "Stillness" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "almost nothing, abstract near-void, the faintest suggestion of form at the threshold of perception, pure darkness with micro-structure",
        guidancePhrases: ["let go of your name...", "there is nothing to hold...", "be still..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      expansion: {
        aiPrompt: "abstract form fragmenting into dispersed particles, coherent shape dissolving into scattered luminous points, boundaries becoming transparent gradients",
        guidancePhrases: ["you are dissolving...", "this is not loss...", "let the edges go..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      transcendence: {
        aiPrompt: "absolute abstract void, formless awareness rendered as pure negative space, no color no form no edge, the visual equivalent of potential energy",
        guidancePhrases: ["there is no you...", "everything is this...", "..."],
        poetryMood: "transcendent",
        voice: "alloy",
        shaderOpacity: 0.6,
      },
      illumination: {
        aiPrompt: "first abstract forms condensing from void, luminous points emerging in dark field, the gentle mathematics of re-emergence",
        guidancePhrases: ["something stirs...", "light returns...", "you are being born again..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      return: {
        aiPrompt: "luminous points forming gentle abstract canopy, coherent form softly re-assembling from scattered particles, peace after total dispersal",
        guidancePhrases: ["welcome back...", "you are new...", "the void gave you something..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      integration: {
        aiPrompt: "single luminous point in vast peaceful dark field, abstract minimal, the quiet geometry of renewal",
        guidancePhrases: ["reborn...", "carry the void gently..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
    }),
  },
  {
    id: "sacred-resonance",
    name: "Sacred Resonance",
    subtitle: "geometry reveals itself",
    description:
      "A candle flicker grows to reveal hidden geometry, expanding into infinite mandalas, returning to warm stone silence.",
    realmId: "temple",
    aiEnabled: true,
    phaseLabels: { threshold: "Candle", expansion: "Geometry", transcendence: "Mandala", illumination: "Golden Ratio", return: "Stone", integration: "Silence" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "single warm point of light in structured darkness, faint geometric order barely visible, abstract sacred negative space",
        guidancePhrases: ["enter the temple...", "the stones are listening...", "breathe with the ancients..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "geometric patterns materializing from warmth, interlocking circles and polygons in golden proportions, abstract mathematical revelation",
        guidancePhrases: ["the geometry reveals itself...", "every angle is intentional...", "feel the golden ratio..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "infinite recursive geometric abstraction, nested symmetries at every scale, pure mathematical beauty as overwhelming visual experience, no architecture no figures",
        guidancePhrases: ["the temple is infinite...", "you are the geometry...", "every ratio is divine..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "golden-ratio spirals and Fibonacci sequences rendered as abstract luminous geometry, mathematical harmony as pure visual form",
        guidancePhrases: ["the geometry holds you...", "this order is love...", "math is the language of the sacred..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      return: {
        aiPrompt: "geometry simplifying to essential forms, warm abstract fields, spiraling lines settling into stillness",
        guidancePhrases: ["the temple settles...", "stone remembers...", "carry the ratio..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      integration: {
        aiPrompt: "minimal geometric form centered in warm dark field, one perfect ratio, abstract mathematical peace",
        guidancePhrases: ["the temple is always here...", "the geometry lives in you..."],
        poetryMood: "flowing",
        voice: "fable",
      },
    }),
  },
  {
    id: "cosmic-drift",
    name: "Cosmic Drift",
    subtitle: "between the stars",
    description:
      "A star field expands to nebulae forming, builds to a supernova, then settles into quiet interstellar drift.",
    realmId: "cosmos",
    aiEnabled: true,
    phaseLabels: { threshold: "Starfield", expansion: "Nebula", transcendence: "Supernova", illumination: "Aftermath", return: "Drift", integration: "Distance" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "scattered luminous points on absolute black, vast scale implied by sparse distribution, abstract field of distant light",
        guidancePhrases: ["look up...", "the stars are ancient light...", "you are moving without moving..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "abstract chromatic gas formations, billowing color fields without edges, luminous density increasing, non-figurative emergence at cosmic scale",
        guidancePhrases: ["stars are being born...", "creation is happening now...", "feel the scale..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "abstract explosion of light from central point, concentric shockwaves of color expanding outward, overwhelming radiance without any recognizable form",
        guidancePhrases: ["witness the supernova...", "death is creation...", "you are stardust remembering..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "expanding abstract wavefronts of muted color, the aftermath of intensity, new structures forming from dispersed energy",
        guidancePhrases: ["everything came from this...", "your atoms were forged in stars...", "cosmic recycling..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      return: {
        aiPrompt: "gentle luminous points condensing from dispersed color fields, abstract warmth reorganizing, quiet celestial gradients",
        guidancePhrases: ["the universe settles...", "new light from old death...", "drift now..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "sparse abstract light field, vast negative space, the visual silence of infinite distance",
        guidancePhrases: ["you are the cosmos looking at itself...", "drift home..."],
        poetryMood: "flowing",
        voice: "fable",
      },
    }),
  },
  {
    id: "the-maze",
    name: "The Maze",
    subtitle: "lost in infinite corridors",
    description:
      "Identical corridors multiply endlessly. You become beautifully lost, find the center that is also the edge, and accept that the path IS the destination.",
    realmId: "labyrinth",
    aiEnabled: true,
    phaseLabels: { threshold: "Entry", expansion: "Branching", transcendence: "Infinite", illumination: "Pattern", return: "Simplifying", integration: "Exit" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract parallel lines receding to vanishing point, geometric recursion in warm darkness, infinite perspective without walls or floor",
        guidancePhrases: ["enter...", "every direction is the same...", "the walls are listening..."],
        poetryMood: "hypnotic",
      },
      expansion: {
        aiPrompt: "branching orthogonal paths multiplying fractally, recursive architectural abstraction, mirrored symmetries creating infinite depth without depicting any building",
        guidancePhrases: ["you are lost...", "this is where you belong...", "deeper into the maze..."],
        poetryMood: "hypnotic",
      },
      transcendence: {
        aiPrompt: "infinite recursive self-similarity, every scale revealing the same pattern, abstract topology of pure lostness, overwhelming fractal identity",
        guidancePhrases: ["you are the labyrinth...", "there is no exit because there is no inside...", "the center is everywhere..."],
        poetryMood: "mystical",
      },
      illumination: {
        aiPrompt: "the fractal pattern seen from above as unified geometry, abstract aerial view of infinite order within apparent chaos, every path part of one form",
        guidancePhrases: ["the pattern reveals itself...", "you were never lost...", "the maze is the map of your mind..."],
        poetryMood: "mystical",
      },
      return: {
        aiPrompt: "recursive complexity reducing to simpler forms, branching structures consolidating, abstract clarity increasing",
        guidancePhrases: ["the walls are thinning...", "you chose a direction and it is right...", "the path appears..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "single geometric opening in a dark field, the infinite recursion folded into one simple form, abstract resolution",
        guidancePhrases: ["you carry the maze...", "the labyrinth lives in you..."],
        poetryMood: "flowing",
      },
    }),
  },
  {
    id: "the-ascent",
    name: "The Ascent",
    subtitle: "climbing into thin air",
    description:
      "The infinite ridge rises through cloud layers. You climb past the last trees, past the snow line, past the atmosphere itself, and return with the view.",
    realmId: "mountain",
    aiEnabled: true,
    phaseLabels: { threshold: "Foothills", expansion: "Climb", transcendence: "Summit", illumination: "Vista", return: "Descent", integration: "Valley" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract vertical gradient, dark dense forms at bottom thinning toward infinite light above, the visual weight of altitude as pure abstraction",
        guidancePhrases: ["look up...", "the summit is a rumor...", "begin..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "layers of white translucent planes passing downward, abstract ascent through stacked horizontal veils, thinning visual density as altitude increases",
        guidancePhrases: ["higher...", "the air thins and thoughts clarify...", "don't look down..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "abstract infinite vista, horizon curving, dark gradient above meeting white below, the sublime vertigo of extreme height rendered without landscape",
        guidancePhrases: ["you are above everything...", "the summit is a feeling not a place...", "breathe the infinite..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "panoramic abstract clarity, luminous points emerging against dark gradient, the visual purity of thin air, crystalline negative space",
        guidancePhrases: ["see how far you've come...", "the view is the reward...", "everything is below you..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      return: {
        aiPrompt: "warming tonal gradients, density increasing gently, abstract descent through richer color bands",
        guidancePhrases: ["descend gently...", "the mountain stays...", "carry the height..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "warm dense abstraction after clarity, the memory of vast negative space held in a small warm field",
        guidancePhrases: ["you climbed...", "the summit lives in you now..."],
        poetryMood: "flowing",
        voice: "fable",
      },
    }),
  },
  {
    id: "the-crossing",
    name: "The Crossing",
    subtitle: "walking into infinite light",
    description:
      "The desert stretches forever. You walk toward a horizon that never arrives, dissolve into heat and light, and emerge changed by the emptiness.",
    realmId: "desert",
    aiEnabled: true,
    phaseLabels: { threshold: "Border", expansion: "Emptiness", transcendence: "White", illumination: "Reversal", return: "Return", integration: "Boundary" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract warm gradient fading to white at horizon, heat distortion as pure visual effect, the geometry of emptiness beginning",
        guidancePhrases: ["step into the light...", "leave everything behind...", "the desert has no mercy and no malice..."],
        poetryMood: "mystical",
        voice: "nova",
      },
      expansion: {
        aiPrompt: "abstract empty space stretching to unreachable vanishing point, shimmering interference patterns from heat, all landmarks dissolved into pure distance",
        guidancePhrases: ["the horizon retreats...", "emptiness is freedom...", "the sand knows your footsteps..."],
        poetryMood: "mystical",
        voice: "nova",
      },
      transcendence: {
        aiPrompt: "total dissolution into blinding white light, abstract emptiness at maximum saturation, no forms no ground no horizon, pure luminous void",
        guidancePhrases: ["you are the desert...", "emptiness is fullness...", "the light is everything..."],
        poetryMood: "transcendent",
        voice: "nova",
      },
      illumination: {
        aiPrompt: "warm-to-cool gradient inversion, luminous points appearing against deep blue-black, abstract reversal from maximum light to celestial darkness",
        guidancePhrases: ["the stars emerge...", "the desert and the sky are the same infinity...", "silence speaks..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      return: {
        aiPrompt: "warm tones returning, soft abstract gradients, first structure re-emerging from formless light",
        guidancePhrases: ["the crossing nears its end...", "you survived the emptiness...", "the desert marked you..."],
        poetryMood: "flowing",
        voice: "nova",
      },
      integration: {
        aiPrompt: "abstract boundary between warm light and structured space, the memory of infinite emptiness condensed into quiet chromatic fields",
        guidancePhrases: ["you crossed the infinite...", "the emptiness lives in you now..."],
        poetryMood: "flowing",
        voice: "nova",
      },
    }),
  },
  {
    id: "the-reading",
    name: "The Reading",
    subtitle: "lost among infinite pages",
    description:
      "You enter the infinite library and begin reading. The books contain everything ever thought. You find the book that contains you, and close it gently.",
    realmId: "archive",
    aiEnabled: true,
    phaseLabels: { threshold: "Page", expansion: "Chapter", transcendence: "Library", illumination: "Mirror", return: "Closing", integration: "Memory" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract warm pool of light in structured darkness, dense ordered patterns receding into shadow, the texture of accumulated knowledge as pure form",
        guidancePhrases: ["open the first page...", "the library has been waiting...", "every book knows your name..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "hexagonal tessellations multiplying infinitely, recursive chambers of ordered information, abstract topology of infinite catalogued knowledge",
        guidancePhrases: ["the library unfolds...", "every thought ever thought is here...", "read deeper..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "total immersion in dense abstract pattern fields, text-like linear marks dissolving into pure recursive information, overwhelming fractal density of encoded meaning",
        guidancePhrases: ["you are the text...", "reading and being read are the same...", "infinite knowledge, infinite peace..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "the recursive pattern resolving into a mirror — abstract self-reference, the information field reflecting back at itself",
        guidancePhrases: ["you found your book...", "the text is you...", "the library is your mind..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      return: {
        aiPrompt: "pattern density decreasing, abstract fields simplifying, warm negative space expanding between ordered structures",
        guidancePhrases: ["close the book...", "the words stay with you...", "the silence after reading..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "single small ordered form in warm dark field, abstract minimal, the infinite compressed into one quiet shape",
        guidancePhrases: ["the library is always open...", "you carry every book..."],
        poetryMood: "flowing",
        voice: "fable",
      },
    }),
  },
  {
    id: "the-tempest",
    name: "The Tempest",
    subtitle: "inside the infinite storm",
    description:
      "The storm builds from a distant rumble to infinite electrical fury, you find the eye of absolute calm, then emerge transformed by the lightning.",
    realmId: "storm",
    aiEnabled: true,
    phaseLabels: { threshold: "Pressure", expansion: "Lightning", transcendence: "Fury", illumination: "Eye", return: "Clearing", integration: "Calm" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract pressure gradient, dark turbulent fields compressing, the visual tension of energy about to discharge, electric potential as color",
        guidancePhrases: ["it's coming...", "feel the pressure change...", "the storm knows you..."],
        poetryMood: "intense",
        voice: "echo",
      },
      expansion: {
        aiPrompt: "abstract electrical discharge patterns branching across dark fields, chaotic energy lines illuminating turbulent abstract forms, overwhelming visual force",
        guidancePhrases: ["let the storm take you...", "every lightning is a thought...", "the rain is washing everything..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      transcendence: {
        aiPrompt: "maximum abstract chaos, branching energy fractals at infinite density, the visual equivalent of unlimited power discharging in every direction simultaneously",
        guidancePhrases: ["you are the lightning...", "the storm is alive and you are it...", "infinite power..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      illumination: {
        aiPrompt: "perfect calm center surrounded by rotating abstract chaos, a still void inside infinite kinetic energy, the mathematics of the eye",
        guidancePhrases: ["the eye...", "perfect calm inside infinite fury...", "the center holds..."],
        poetryMood: "mystical",
        voice: "echo",
      },
      return: {
        aiPrompt: "abstract energy dissipating, chaotic fields calming to gentle turbulence, distant fading sparks in settling dark",
        guidancePhrases: ["the storm passes...", "every storm ends...", "you survived the infinite..."],
        poetryMood: "flowing",
        voice: "echo",
      },
      integration: {
        aiPrompt: "cleared abstract space, washed clean, one distant luminous point, the stillness after maximum energy",
        guidancePhrases: ["the air is new...", "the storm changed everything..."],
        poetryMood: "flowing",
        voice: "echo",
      },
    }),
  },
  {
    id: "first-snow",
    name: "First Snow",
    subtitle: "crystalline descent into silence",
    description:
      "The world grows quiet as the first flakes fall. Sound becomes muffled. Everything slows into crystalline stillness.",
    realmId: "winter",
    aiEnabled: true,
    phaseLabels: { threshold: "Chill", expansion: "Falling", transcendence: "Whiteout", illumination: "Silence", return: "Warmth", integration: "Stillness" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract cool grey gradient, a single white particle descending through still space, the visual temperature dropping",
        guidancePhrases: ["the air changes...", "feel it cooling...", "something is coming..."],
        poetryMood: "melancholic",
        voice: "shimmer",
      },
      expansion: {
        aiPrompt: "increasing density of descending white particles, abstract muffling — soft forms losing definition, white accumulating on abstract surfaces",
        guidancePhrases: ["sound is softening...", "the world is changing...", "let the white take everything..."],
        poetryMood: "dreamy",
        voice: "shimmer",
      },
      transcendence: {
        aiPrompt: "total abstract whiteout, all form dissolved into swirling white particles, no orientation no horizon, pure crystalline chaos consuming all structure",
        guidancePhrases: ["you are inside the snow...", "there is only white...", "surrender to the crystal..."],
        poetryMood: "mystical",
        voice: "shimmer",
      },
      illumination: {
        aiPrompt: "pure white field with subtle blue shadows, absolute abstract stillness, pristine negative space, the visual equivalent of perfect silence",
        guidancePhrases: ["listen to the silence...", "the world is new...", "everything is clean..."],
        poetryMood: "transcendent",
        voice: "shimmer",
      },
      return: {
        aiPrompt: "warm amber tones bleeding into cool white field, abstract temperature gradient, comfort as chromatic warmth against crystalline cold",
        guidancePhrases: ["warmth returns...", "home is near...", "the cold made this warmth possible..."],
        poetryMood: "flowing",
        voice: "shimmer",
      },
      integration: {
        aiPrompt: "luminous points on white field, abstract peace, transformed stillness, one warm trace in crystalline space",
        guidancePhrases: ["the snow remembers...", "carry this stillness..."],
        poetryMood: "melancholic",
        voice: "shimmer",
      },
    }),
  },
  {
    id: "the-bloom",
    name: "The Bloom",
    subtitle: "when the earth remembers warmth",
    description:
      "After the long winter, the first warmth arrives. Seeds crack open. Green returns. The world exhales.",
    realmId: "spring",
    aiEnabled: true,
    phaseLabels: { threshold: "Crack", expansion: "Unfurling", transcendence: "Canopy", illumination: "Garden", return: "Settling", integration: "Dew" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract surface with hairline fissures of warm green light in cool brown field, the visual pressure of emergence, dormancy cracking open",
        guidancePhrases: ["wait for it...", "feel the thaw beginning...", "something stirs beneath..."],
        poetryMood: "melancholic",
        voice: "nova",
      },
      expansion: {
        aiPrompt: "abstract green energy erupting from dark field, curving organic forms unfurling at accelerating speed, warm chromatic explosion of verdant tones",
        guidancePhrases: ["it's happening...", "the green is unstoppable...", "everything at once..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      transcendence: {
        aiPrompt: "overwhelming abstract fertility — fractal branching green-gold-pink energy filling the entire field, organic mathematics at maximum density, pure growth as visual force",
        guidancePhrases: ["this is what was waiting...", "every cell remembers this...", "the bloom is you..."],
        poetryMood: "transcendent",
        voice: "nova",
      },
      illumination: {
        aiPrompt: "mature abstract organic field in full chromatic saturation, warm green-gold patterns pulsing gently, mathematical harmony of living systems",
        guidancePhrases: ["the garden is complete...", "everything is alive...", "rest here in the green..."],
        poetryMood: "flowing",
        voice: "nova",
      },
      return: {
        aiPrompt: "abstract organic forms settling, warm tones cooling gently, green fields dimming to quiet luminous pulses",
        guidancePhrases: ["the day was full...", "the garden sleeps...", "carry the pollen with you..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      integration: {
        aiPrompt: "single abstract organic form in warm light, luminous dew-like points on a gentle field, the geometry of one opening",
        guidancePhrases: ["you bloomed...", "the spring is in you now..."],
        poetryMood: "flowing",
        voice: "nova",
      },
    }),
  },
  {
    id: "the-solstice",
    name: "The Solstice",
    subtitle: "the longest day, the shortest night",
    description:
      "Midsummer. The sun barely sets. Heat and light fill every hour. Then the electric night arrives.",
    realmId: "summer",
    aiEnabled: true,
    phaseLabels: { threshold: "Dawn", expansion: "Heat", transcendence: "Storm", illumination: "Golden Hour", return: "Dusk", integration: "Warmth" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract warm golden field, saturated amber light filling the frame, the visual temperature of maximum warmth beginning",
        guidancePhrases: ["the sun is already here...", "feel the warmth building...", "this is the longest day..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      expansion: {
        aiPrompt: "blazing abstract saturation, heat shimmer distorting all edges, pure golden chromatic overload, the visual weight of maximum light",
        guidancePhrases: ["the heat carries you...", "let the light fill everything...", "time is slow and golden..."],
        poetryMood: "dreamy",
        voice: "alloy",
      },
      transcendence: {
        aiPrompt: "peak chromatic intensity — golden field colliding with dark turbulent energy, abstract tension between maximum warmth and electrical discharge, the visual paradox of heat and storm",
        guidancePhrases: ["the storm is coming...", "heat and lightning...", "the fullest moment of the year..."],
        poetryMood: "intense",
        voice: "alloy",
      },
      illumination: {
        aiPrompt: "amber-gold abstraction washed clean, luminous warm gradients, abstract aftermath of intensity, pure golden-hour chromatic peace",
        guidancePhrases: ["the storm passed...", "golden hour...", "the longest light of the year..."],
        poetryMood: "transcendent",
        voice: "alloy",
      },
      return: {
        aiPrompt: "warm dark field with scattered luminous points appearing, abstract warmth radiating from below, gentle cooling gradient",
        guidancePhrases: ["the night is warm...", "fireflies are speaking...", "the longest day ends gently..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      integration: {
        aiPrompt: "deep warm darkness with celestial luminous field above, abstract peace in residual warmth, the memory of maximum light",
        guidancePhrases: ["summer lives in you...", "the warmth stays..."],
        poetryMood: "dreamy",
        voice: "alloy",
      },
    }),
  },
  {
    id: "the-harvest",
    name: "The Harvest",
    subtitle: "the beautiful letting go",
    description:
      "The trees release their colors. Everything that grew now lets go with grace. Beauty in the falling.",
    realmId: "autumn",
    aiEnabled: true,
    phaseLabels: { threshold: "Turning", expansion: "Color", transcendence: "Release", illumination: "Skeleton", return: "Quiet", integration: "Frost" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract gradient shifting from warm to cool, the first chromatic change — green fields developing amber edges, the visual weight of seasonal turning",
        guidancePhrases: ["the change begins...", "feel the first cool...", "something is ending beautifully..."],
        poetryMood: "melancholic",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "abstract warm chromatic fields intensifying — amber, sienna, burnt orange as pure color planes, no landscape no leaves, the visual experience of peak warmth before release",
        guidancePhrases: ["look at what it becomes...", "the dying is the beauty...", "every leaf is a flame..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "overwhelming abstract warm-palette saturation, crimson and gold and amber color fields at maximum intensity, particles descending through chromatic space, the visual ecstasy of letting go",
        guidancePhrases: ["this is the peak...", "everything releasing at once...", "let go with the leaves..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "abstract skeletal structures revealed after chromatic stripping, sparse linear forms against clear cool gradient, the elegant geometry of what remains",
        guidancePhrases: ["see the structure...", "what remains is essential...", "the beauty of less..."],
        poetryMood: "melancholic",
        voice: "fable",
      },
      return: {
        aiPrompt: "cool abstract fields with scattered warm remnants, soft gradients settling toward grey-brown, the visual quiet of completion",
        guidancePhrases: ["the earth is resting...", "rain completes it...", "nothing is lost, only changed..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "crystalline abstract cold on warm remnant tones, sharp luminous points in deep quiet dark field, the visual silence before dormancy",
        guidancePhrases: ["winter is near...", "you carry the harvest..."],
        poetryMood: "melancholic",
        voice: "fable",
      },
    }),
  },
  // ─── The Wound — Pain realm, works with any track ───
  {
    id: "the-wound",
    name: "The Wound",
    subtitle: "below everything, the ache that shapes you",
    description:
      "A descent into the grief and hurt that lives beneath the surface. Not to escape it — to sit with it, let it move through you, and emerge changed.",
    realmId: "pain",
    aiEnabled: true,
    phaseLabels: { threshold: "Numbness", expansion: "Weight", transcendence: "Fracture", illumination: "Thaw", return: "Aftermath", integration: "Scar" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract cold emptiness, a single dim form isolated in vast dark negative space, the visual weight of loneliness as pressure",
        guidancePhrases: ["be still...", "let it come...", "you don't have to be strong here..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      expansion: {
        aiPrompt: "abstract pressure fields crushing inward, dark weight made visible as dense chromatic compression, bruise-colored gradients folding over themselves",
        guidancePhrases: ["feel it...", "the weight is real...", "don't look away..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      transcendence: {
        aiPrompt: "abstract fracture — dark fields splitting open to reveal raw wounded light beneath, not beautiful but honest, the visual equivalent of a cry that finally escapes",
        guidancePhrases: ["let it break...", "this is the bottom...", "you are still here..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      illumination: {
        aiPrompt: "abstract warmth entering from a crack in the darkness, not hope but survival, dim amber light touching cold surfaces for the first time",
        guidancePhrases: ["something shifted...", "the weight is lighter now...", "breathe..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      return: {
        aiPrompt: "abstract dark forms receding, cool grey space opening, the geometry of aftermath, emptied but not empty",
        guidancePhrases: ["you carried it...", "the ache is quieter now...", "you are still whole..."],
        poetryMood: "flowing",
        voice: "onyx",
      },
      integration: {
        aiPrompt: "abstract stillness after grief, a single warm tone in vast grey space, the visual silence of having survived",
        guidancePhrases: ["you are changed...", "carry this gently..."],
        poetryMood: "flowing",
        voice: "onyx",
      },
    }),
  },
  {
    id: "folsom-street",
    name: "Folsom Street",
    subtitle: "neon reflections on wet pavement",
    description:
      "Rain-slicked asphalt mirrors a city that never sleeps. Signals pulse through wires overhead. You walk the circuit until the predawn silence arrives.",
    realmId: "machine",
    aiEnabled: true,
    phaseLabels: { threshold: "Signal", expansion: "Grid", transcendence: "Circuit", illumination: "Pause", return: "Dimming", integration: "Standby" },
    phases: defaultPhases({
      threshold: {
        aiPrompt: "abstract dark reflective surface, a single cyan point of light mirrored in wet blackness, the visual hum of latent electrical infrastructure",
        guidancePhrases: ["the street is awake...", "wet pavement mirrors everything...", "walk..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      expansion: {
        aiPrompt: "abstract color signals bleeding across wet dark planes, cyan and amber and magenta light sources smearing through reflective surfaces, grid topology revealing itself",
        guidancePhrases: ["the signals are speaking...", "every wire carries a message...", "the grid expands..."],
        poetryMood: "intense",
        voice: "echo",
      },
      transcendence: {
        aiPrompt: "total abstract signal immersion — pure electrical color at maximum density, every surface reflective, light and reflection indistinguishable, the visual topology of a living circuit",
        guidancePhrases: ["you are the signal...", "the city breathes through you...", "every frequency at once..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      illumination: {
        aiPrompt: "abstract wet surfaces holding residual color, soft reflections in dark planes, a pause in the signal flow, clarity between transmissions",
        guidancePhrases: ["the rain paused...", "see what the water reveals...", "the city is quiet for one breath..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      return: {
        aiPrompt: "abstract color signals fading, warm grey replacing electric hues, the grid powering down to sparse nodes of light",
        guidancePhrases: ["the night is ending...", "the signals dim...", "silence arrives like a guest..."],
        poetryMood: "dreamy",
        voice: "echo",
      },
      integration: {
        aiPrompt: "one abstract signal pulsing in grey-blue predawn field, absolute stillness in the grid, the geometry of standby",
        guidancePhrases: ["the street remembers you...", "carry the signal..."],
        poetryMood: "flowing",
        voice: "echo",
      },
    }),
  },
];

export function getJourney(id: string): Journey | undefined {
  return JOURNEYS.find((j) => j.id === id);
}

export function getJourneysByRealm(realmId: string): Journey[] {
  return JOURNEYS.filter((j) => j.realmId === realmId);
}
