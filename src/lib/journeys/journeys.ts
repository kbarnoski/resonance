import type { Journey, JourneyPhase } from "./types";
import { getRealm } from "./realms";
import { MODE_META } from "@/lib/shaders";
import { seededShuffle } from "./seeded-random";

// ─── Full shader library: ALL registered shaders ───
// Every journey draws from this pool — balanced across all categories.
const ALL_SHADERS_RAW: string[] = [
  // Elemental (22)
  "fog", "storm", "dusk", "snow", "ocean", "cascade", "whirlpool", "flux",
  "monsoon", "haze", "geyser", "magma", "sandstorm", "typhoon", "vapor",
  "chinook", "thermal", "lightning", "maelstrom",
  "riptide", "deluge", "squall",
  // Visionary (13)
  "prismatic", "astral", "portal", "oracle",
  "revelation", "threshold", "ascension", "rapture",
  "mandorla", "seraph",
  "rosetta", "halo",
  "nimbus",
  // Cosmic (26)
  "cosmos", "abyss", "pulsar", "quasar", "supernova",
  "nebula", "singularity", "stardust", "drift", "expanse",
  "comet", "magnetar", "protostar", "redshift", "perihelion", "aphelion",
  "nadir", "parsec", "nova", "photon",
  "helios", "selene", "kepler", "cassini", "hubble", "tycho", "doppler",
  // Organic (19)
  "ethereal", "ember", "tide", "moss", "spore",
  "chrysalis", "plankton", "lichen", "membrane", "growth",
  "enzyme", "mitosis", "pollen", "symbiosis", "rhizome", "chitin",
  "phylum", "kelp", "mangrove",
  // Geometry (22)
  "sacred", "tesseract", "neon", "lattice", "spiral",
  "fibonacci", "geodesic", "moire",
  "catenary",
  "astroid", "cardioid", "lissajous", "cymatic", "guilloche",
  "trefoil", "quatrefoil", "involute", "rosette", "roulette", "deltoid", "nephroid", "epicycle",
  // Dark (13)
  "obsidian", "umbra", "inferno", "plasma",
  "vortex", "aether",
  "specter", "blight", "necrosis", "dirge", "revenant",
  "lament", "hollow",
  // Nature (13)
  "river", "rain", "ripple", "breeze", "zephyr", "flame",
  "amoeba", "cytoplasm", "firefly", "reef", "abyssal", "starfield", "radiance",
  // 3D Worlds (16)
  "orb", "field", "aurora",
  "galaxy", "depths", "bonfire", "crystal", "swarm", "lotus", "cloud", "waterfall",
  "wave", "seabed", "cage", "pendulum",
];
const ALL_SHADERS = [...new Set(ALL_SHADERS_RAW)];

/** Fisher-Yates shuffle — returns a new shuffled copy. Uses seededShuffle under the hood. */
function shuffleArray<T>(arr: T[], random: () => number = Math.random): T[] {
  return seededShuffle(arr, random);
}

/** Realm → preferred shader categories (70% drawn from these, 30% variety) */
const REALM_SHADER_AFFINITY: Record<string, string[]> = {
  heaven:    ["Visionary", "Cosmic", "3D Worlds"],
  hell:      ["Dark", "Elemental", "3D Worlds"],
  garden:    ["Organic", "Elemental", "3D Worlds"],
  ocean:     ["Elemental", "Organic", "Cosmic", "3D Worlds"],
  machine:   ["Geometry", "Dark"],
  cosmos:    ["Cosmic", "Visionary", "3D Worlds"],
  temple:    ["Visionary", "Geometry", "3D Worlds"],
  labyrinth: ["Geometry", "Dark"],
  mountain:  ["Elemental", "Cosmic", "3D Worlds"],
  desert:    ["Elemental", "Cosmic"],
  archive:   ["Geometry", "Visionary"],
  storm:     ["Elemental", "Dark", "3D Worlds"],
  winter:    ["Elemental", "Cosmic", "3D Worlds"],
  spring:    ["Organic", "Elemental", "3D Worlds"],
  summer:    ["Elemental", "Organic", "Cosmic"],
  autumn:    ["Organic", "Elemental", "Dark"],
  pain:      ["Dark", "Organic", "3D Worlds"],
};

/**
 * Pick a fresh random set of shaders for a journey, biased toward
 * the realm's preferred shader categories for thematic coherence.
 * 70% from affinity categories, 30% from the rest for variety.
 */
/** Per-realm shader blocklist — these modes are excluded for that realm */
const REALM_SHADER_BLOCKLIST: Record<string, string[]> = {
  winter: [
    "magma", "inferno", "bonfire", "flame", // fire
    "aurora", "orb", // wrong vibe
    "neon", "moire", "lattice", "sacred", // solid/geometric
    "mangrove", "rhizome", // tree/botanical 2D
    "helios", "perihelion", "supernova", "nova", "photon", "pulsar", // yellow sun/hot graphics
    "thermal", "geyser", "lightning", // warm/fiery elemental
    "ember", // warm organic tones
    "redshift", "comet", "magnetar", // warm cosmic
  ],
  heaven: [
    "orb", // wrong vibe
  ],
  ocean: [
    "snow", "rain", // wrong climate
    "sandstorm", // land-based
    "bonfire", "flame", "inferno", // fire
  ],
  garden: [
    "snow", "rain", // wrong climate
    "sandstorm", // land-based
    "bonfire", "inferno", // fire
  ],
};

/** Per-realm must-include shaders — always present in the journey pool */
const REALM_SHADER_MUSTINCLUDE: Record<string, string[]> = {
  winter: ["spiral", "snow"],
  hell: ["lightning", "flame", "magma", "inferno"],
};

function pickJourneyShaders(realmId: string, random: () => number = Math.random): string[] {
  const affinityCategories = REALM_SHADER_AFFINITY[realmId] ?? [];
  const blocklist = new Set(REALM_SHADER_BLOCKLIST[realmId] ?? []);
  const mustInclude = REALM_SHADER_MUSTINCLUDE[realmId] ?? [];

  // Build category lookup from MODE_META (skip AI Imagery category)
  const categoryMap = new Map<string, string[]>();
  for (const meta of MODE_META) {
    if (meta.category === "AI Imagery") continue;
    if (blocklist.has(meta.mode)) continue; // skip blocklisted shaders for this realm
    const list = categoryMap.get(meta.category) ?? [];
    list.push(meta.mode);
    categoryMap.set(meta.category, list);
  }

  // Split shaders into affinity pool and variety pool
  const affinityPool: string[] = [];
  const varietyPool: string[] = [];
  for (const [cat, shaders] of categoryMap) {
    if (affinityCategories.includes(cat)) {
      affinityPool.push(...shaders);
    } else {
      varietyPool.push(...shaders);
    }
  }

  // 70% from affinity, 30% from variety
  const affinityCount = Math.min(32, affinityPool.length);
  const varietyCount = Math.min(13, varietyPool.length);

  const picked = [
    ...mustInclude, // always first
    ...shuffleArray(affinityPool, random).filter(s => !mustInclude.includes(s)).slice(0, affinityCount),
    ...shuffleArray(varietyPool, random).filter(s => !mustInclude.includes(s)).slice(0, varietyCount),
  ];

  return shuffleArray(picked, random);
}

/** Pick `count` shaders from pool, avoiding `used` set. Never duplicates. */
function pickShaders(pool: string[], count: number, used: Set<string>, random: () => number = Math.random): string[] {
  const unused = pool.filter((s) => !used.has(s));
  const shuffled = shuffleArray(unused, random);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  for (const s of picked) used.add(s);
  return picked;
}

function defaultPhases(
  realmId: string,
  overrides: Partial<Record<string, Partial<JourneyPhase>>>
): JourneyPhase[] {
  // Every play gets a fresh random set, biased toward realm-appropriate categories
  const allShaders = pickJourneyShaders(realmId);

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
      shaderOpacity: 0.50,
      aiPrompt: "luminous geometry condensing from deep space, glowing non-representational forms emerging at the edge of perception, radiant points in vast emptiness, no text no signatures no watermarks no letters no writing",
      aiPromptModifiers: {
        lowAmplitude: "near total darkness, just the faintest breath of light on a surface",
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
      shaderOpacity: 0.50,
      aiPrompt: "radiant abstract topologies unfolding, luminous energy fields pulsing with light, pressure gradients made visible as glowing color and bright form, no text no signatures no watermarks no letters no writing",
      aiPromptModifiers: {
        highBass: "tectonic scale, massive cliff faces or canyons, deep geological weight",
        highTreble: "ice crystals catching light, prismatic refraction through real glass or water",
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
      shaderOpacity: 0.50,
      aiPrompt: "pure radiant abstraction at peak intensity, brilliant color fields dissolving into blinding light, the visual equivalent of every frequency at once, overwhelming luminous saturation, no text no signatures no watermarks no letters no writing",
      aiPromptModifiers: {
        highBass: "earthquake scale, ground splitting open, massive geological upheaval",
        highTreble: "shattered ice or glass refracting blinding light in every direction",
        highAmplitude: "total sensory overload, standing in the center of a supercell storm",
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
      aiPrompt: "abstract clarity, luminous negative space, simple geometric forms hovering in warm light, the mathematics of understanding, no text no signatures no watermarks no letters no writing",
      aiPromptModifiers: {
        highTreble: "light refracting through crystal formations or stained glass, casting real caustic patterns on stone",
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
      shaderOpacity: 0.50,
      aiPrompt: "luminous warmth condensing, soft radiant gradients resolving, gentle glowing comfort, bright color fields settling into harmony, no text no signatures no watermarks no letters no writing",
      aiPromptModifiers: {
        lowAmplitude: "almost dark, just the last trace of sunset color on the edge of the world",
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
      shaderOpacity: 0.50,
      aiPrompt: "minimal radiant abstraction, a single bright luminous form in vast space, the glowing geometry of stillness, no text no signatures no watermarks no letters no writing",
      aiPromptModifiers: {
        lowAmplitude: "near darkness, just one small warm light source in an enormous quiet space",
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
    phases: defaultPhases("heaven", {

      threshold: {
        aiPrompt: "surreal sculptural cloud formation entering from the lower right and ascending into deep black cosmos, the cloud impossibly designed with spiraling internal architecture glowing faintly blue and violet from within, wisps of luminous vapor curling upward into infinite dark space, the dense cloud detail anchored in one third of the frame with the rest open infinite darkness and distant stars, cosmic scale where the cloud could be a nebula, asymmetric composition with visual weight low and right, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["breathe...", "feel the warmth...", "light is coming..."],
        poetryMood: "dreamy",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — impossible cloud architecture sweeping diagonally from upper left toward lower right ascending infinitely, the formations sculptural and designed with fibonacci curves and voronoi structure visible in the vapor, subtle blue-grey shadows and prismatic edges defining the cloud design against brilliant pale ground, warm gold and rose light glowing from deep within the densest regions, the upper third dense with cloud detail trailing into scattered luminous wisps and open white space below, infinite cosmic depth through layered translucency, ascending endlessly upward, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["rise...", "the light knows you...", "open..."],
        poetryMood: "transcendent",
      },
      transcendence: {
        aiPrompt: "cosmic-scale cloud nebula sweeping across infinite black in a vast ascending spiral arc, the formations impossibly detailed and designed — deep blue and electric violet light pulsing through spiraling cloud corridors, warm gold erupting at the brightest nodes, the structure dense and intricate where it crosses the frame but dissolving into luminous vapor trails and open void at both edges, cloud bridges and God rays stretching toward infinite darkness above, dynamic and powerful ascending cosmos, composition fills the frame but is not centered — the spiral core sits upper right with streamers reaching across, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are light...", "there is no boundary...", "this is home..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate designed cloud forms and connected luminous vapor arranged along the left edge and lower third of an immense soft white field, the clouds sculptural and impossible with internal geometric structure, dispersed golden particles trailing rightward into open pale space, cool blue shadows on the cloud surfaces, an infinite cosmic quality to the vast emptiness above, the design clusters asymmetrically leaving the upper right open and boundless, quiet power in the contrast of detailed cloud intricacy against infinite white light, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see how vast you are...", "every direction is warmth...", "stay in this light..."],
        poetryMood: "transcendent",
      },
      return: {
        aiPrompt: "designed cloud forms arcing from lower left across a deep indigo cosmos ascending gently, prismatic light threading through the cloud architecture — blue to violet to rose to warm gold, luminous vapor catching spectrum as it spirals upward into generous dark negative space above and right, the clouds sculptural and impossibly beautiful even as they thin and dissolve, composition weighted to the lower half with cosmic darkness and stars opening infinitely above, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["gently now...", "the glow remains...", "carry the warmth..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "sparse luminous cloud wisps and fading vapor traces ascending across vast blue-black cosmos, the last designed formations clustered small in the lower left corner dissolving into scattered particles that trail diagonally toward infinite upper darkness, faint violet and gold light in the final cloud structures, enormous open cosmos with stars everywhere above, the vapor carries the cloud architecture's memory as it ascends and scatters, asymmetric and quiet — almost nothing against everything, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are changed...", "the light lives in you now..."],
        poetryMood: "flowing",
      },
    }),
  },
  {
    id: "inferno",
    name: "Inferno",
    subtitle: "alone in the burning",
    description:
      "Darkness cracks open. Heat rises from below, shapeless and absolute. You descend through pressure and isolation until something breaks — then silence, then air.",
    realmId: "hell",
    aiEnabled: true,
    phaseLabels: { threshold: "Entrance", expansion: "Descent", transcendence: "Furnace", illumination: "Embers", return: "Ascent", integration: "Aftermath" },
    phases: defaultPhases("hell", {

      threshold: {
        aiPrompt: "dense billowing smoke architecture entering from the lower right corner of absolute black void, the smoke impossibly designed with spiraling internal corridors and voronoi cell-walls visible in the dark vapor, faint deep orange glow pulsing from within the densest folds, fine falling ash particles dispersing downward-left along curved paths into vast dark negative space, photorealistic smoke texture at cosmic scale where each billow could be a dark nebula, asymmetric composition with visual weight low and right, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["descend...", "there is no turning back...", "alone now..."],
        poetryMood: "mystical",
        voice: "onyx",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — cascading ash-fall structure sweeping diagonally from upper left toward lower right, thousands of dark charcoal flakes and fine grey particles in fibonacci descent patterns against brilliant pale ground, the densest ash cluster in the upper third with designed geometric drift-paths trailing into scattered particles and open white space below, faint ember-orange glow where the freshest ash still carries heat, cool ash-grey shadows defining the fall-pattern against boundless white, infinite depth through layered translucent smoke-haze, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["deeper...", "the walls are burning...", "no one is coming..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      transcendence: {
        aiPrompt: "cosmic-scale fire itself rendered as designed architecture sweeping across infinite black in a vast descending spiral arc, the flames impossibly sculptural with fractal branching tongues and geometric heat-shimmer corridors, white-hot core erupting through deep orange and violent red at the combustion front, the fire-structure dense and intricate where it crosses the upper-right frame but dissolving into rising smoke plumes and scattered spark-trails into open void at both edges, heat-distortion rays stretching toward infinite darkness below, dynamic and turbulent and alive, composition not centered with the furnace-core upper right and flame-streamers reaching across, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["everything burns...", "let it take you...", "witness..."],
        poetryMood: "chaotic",
        voice: "onyx",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate obsidian glass forms and dark charred lattice arranged along the left edge and lower third of an immense soft ash-white field, the blackened structures architectural and beautiful like the skeleton of something that burned — internal geometric facets catching faint amber light at the seams, fine grey ash particles trailing rightward into open pale space, the design clusters asymmetrically leaving the upper right vast and still, quiet aftermath power in the contrast of dark burnt intricacy against boundless cool white, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see what survives the fire...", "even here there is truth...", "the ashes glow..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      return: {
        aiPrompt: "rising smoke columns and dispersed ember-sparks arcing upward from lower left across deep charcoal cosmos, the smoke designed and sculptural with spiraling internal structure — dark grey and violet vapor carrying glowing orange sparks that cool to amber to rose to silver as they rise, thousands of fine particles ascending into generous dark negative space above and right, the movement is dynamic and upward not static, composition weighted to the lower half with cool darkness opening above, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["climb...", "the air is cooler here...", "leave the fire below..."],
        poetryMood: "mystical",
        voice: "onyx",
      },
      integration: {
        aiPrompt: "sparse falling ash and fading smoke wisps drifting across vast cool grey-black silence, the last glowing embers clustered small in the lower left corner — a few orange points cooling to grey, fine ash particles falling slowly and scattering diagonally toward infinite upper darkness, the air clearing, enormous open space everywhere above where the smoke has dissipated, the particles carry the fire's memory as they cool and settle, asymmetric and quiet — almost nothing against everything, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you walked through the fire...", "it changed you..."],
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
    phases: defaultPhases("garden", {

      threshold: {
        aiPrompt: "designed bioluminescent filament network entering from the lower right corner against deep brown-black void, phosphorescent green nodes connected by impossibly fine mycelial threads with warm gold light pulsing at the junctions, spore-like particles dispersed along the filament paths into vast dark negative space above and left, cosmic scale where the network could be a galaxy's neural map, asymmetric composition with visual weight low and right, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the spores are waking...", "feel the soil...", "life begins small..."],
        poetryMood: "mystical",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — designed mycelial architecture sweeping diagonally from upper left toward lower right, connected filament forms in fibonacci branching geometry with subtle brown-grey shadows and fine phosphorescent green edges defining the interwoven network against brilliant pale ground, warm gold bioluminescent nodes glowing at the densest intersections in the upper third trailing into scattered spore particles and open white space below, infinite depth through layered translucent threads, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["it's growing...", "everything connects...", "feel the network..."],
        poetryMood: "mystical",
      },
      transcendence: {
        aiPrompt: "cosmic-scale connected mycelium lattice sweeping across infinite brown-black in a vast branching arc, phosphorescent green and warm gold light pulsing within the nodes, the network dense and intricate where it crosses the frame but dissolving into spore trails and open void at both edges, filament bridges and bioluminescent rays stretching toward infinite darkness, dynamic and alive, composition fills the frame but is not centered — the densest node cluster sits upper right with branching streamers reaching across, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the network...", "all is one organism...", "breathe with the forest..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate dark filament threads and connected bioluminescent node forms arranged along the left edge and lower third of an immense soft white field, designed mycelial detail like phosphorescent wireframes with dispersed spore particles trailing rightward into open pale space, warm gold light at the network junctions, the design clusters asymmetrically leaving the upper right vast and open, quiet power in the contrast of dark interwoven organic intricacy against boundless white, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the garden knows you...", "every leaf is aware...", "this intelligence is ancient..."],
        poetryMood: "mystical",
      },
      return: {
        aiPrompt: "connected filament lattice arcing from lower left across a deep brown-black field, prismatic bioluminescence threading through the structure — green to gold to warm amber, dispersed spore particles catching soft light as they drift outward into generous dark negative space above and right, the interwoven mycelial form is organic and flowing not rigid, composition weighted to the lower half with cosmic darkness opening above, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the forest settles...", "roots remember...", "return to soil..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "sparse dispersed spore particles and fading filament traces drifting across vast brown-black silence, the last connected mycelial forms clustered small in the lower left corner dissolving into scattered bioluminescent points that trail diagonally toward infinite upper darkness, faint green and gold light in the final network nodes, enormous open void everywhere above, the spores carry the network's memory as they scatter, asymmetric and quiet — almost nothing against everything, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("ocean", {
      threshold: {
        aiPrompt: "shafts of caustic light refracting downward from the upper-left corner through deep blue-black water, the light beams impossibly designed with geometric interference patterns and voronoi caustic cells dancing across the illuminated area, fine suspended particles catching the light along diagonal paths into vast dark abyssal negative space below and right, photorealistic underwater light texture at cosmic scale where each caustic pattern could be a galaxy, asymmetric composition with visual weight high and left, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["sink...", "let the water hold you...", "trust the depth..."],
        poetryMood: "flowing",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — designed siphonophore colonial chain sweeping diagonally from upper left toward lower right, the organism impossibly long and architectural with repeating geometric bell-chambers connected by translucent filaments in fibonacci spacing, subtle blue-grey shadows and fine cyan bioluminescent edges defining the chain-structure against brilliant pale ground, warm amber pulsing from the densest cluster in the upper third trailing into scattered luminous zooids and open white space below, infinite depth through layered translucency, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["deeper...", "the light changes here...", "pressure becomes peace..."],
        poetryMood: "dreamy",
      },
      transcendence: {
        aiPrompt: "cosmic-scale abyssal thermal vent architecture erupting from the lower-left third of infinite blue-black deep, the chimney structures impossibly designed with mineral-encrusted voronoi walls and fractal bacterial mat textures glowing deep orange and electric cyan from within, superheated shimmer-particles billowing upward from the vent openings into vast dark water above and right, the structure dense and intricate at the vent cluster but dissolving into dispersed mineral particles and open void at both edges, dynamic and alive with convection currents, composition not centered with the vent core lower-left and particle plumes rising across, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the deep sees you...", "you are weightless...", "become the ocean..."],
        poetryMood: "mystical",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate radiolarian glass-skeleton forms and connected diatom lattice arranged along the left edge and lower third of an immense soft blue-white field, microscopic deep-water organisms rendered at cosmic scale with impossible geometric precision — hexagonal silica chambers, spiraling internal architecture, fine spines radiating outward, dispersed crystal particles trailing rightward into open pale space, faint cyan bioluminescence at the lattice joints, the design clusters asymmetrically leaving the upper right vast and open, quiet power in the contrast of dark geometric marine intricacy against boundless white, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the bottom is quiet...", "listen to the deep...", "ancient water holds ancient truth..."],
        poetryMood: "flowing",
      },
      return: {
        aiPrompt: "ascending ctenophore comb-rows and trailing tentacle architecture arcing upward from lower left across deep indigo water, prismatic iridescence diffracting through the comb-plate structures — cyan to blue to violet to rose to warm amber, the organism impossibly designed with geometric internal channels and fibonacci-spaced ciliary rows, dispersed bioluminescent particles drifting upward into generous dark negative space above and right, the form is dynamic and ascending, composition weighted to the lower half with deep ocean darkness opening above, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["rise gently...", "the surface remembers you...", "warmth returns..."],
        poetryMood: "dreamy",
      },
      integration: {
        aiPrompt: "sparse marine snow — tiny organic particles and fading planktonic traces drifting slowly downward across vast blue-black silence, the last bioluminescent forms clustered small in the lower left corner — a few faint cyan points dissolving into scattered motes that trail diagonally toward infinite upper water, enormous open deep everywhere, each particle catching the faintest light as it sinks through the water column, asymmetric and quiet — almost nothing against everything, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("machine", {
      threshold: {
        aiPrompt: "designed circuit constellation entering from the lower right corner against deep black void, cyan signal lines connecting white data nodes in an architectural lattice with warm amber pulses at the junctions, fine pixel-like particles dispersed along geometric pathways into vast dark negative space above and left, cosmic scale where the circuit could be a civilization's nervous system, asymmetric composition with visual weight low and right, no screens no computers no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["connecting...", "signal detected...", "initializing..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      expansion: {
        aiPrompt: "vast data-stream highways radiating outward from a dense node cluster in the upper-left third of infinite black void, hundreds of fine cyan signal-lines stretching in parallel toward infinite distance, the pathways architecturally designed with repeating geometric junction-rings that glow warm amber where data-packets pulse through, scattered pixel particles drifting between the streams into endless dark atmosphere, cosmic scale where each highway is a galactic data-corridor, infinite depth through converging perspective lines disappearing into the void, no screens no computers no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["uploading...", "bandwidth expanding...", "feel the data..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      transcendence: {
        aiPrompt: "cosmic-scale connected circuit lattice sweeping across infinite black in a vast data-spiral arc, cyan and electric blue light pulsing within the architectural nodes, the structure dense and intricate where it crosses the frame but dissolving into pixel particle trails and open void at both edges, signal bridges and data rays stretching toward infinite darkness, dynamic and powerful, composition fills the frame but is not centered — the spiral core sits upper right with circuit streamers reaching across, no screens no computers no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the network...", "every node is you...", "process everything..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      illumination: {
        aiPrompt: "clean architectural logic-gate clusters floating in infinite black atmosphere, three distinct node-groups arranged asymmetrically across the frame — each a different geometric network topology with cyan wireframe edges and warm amber core-light, fine connecting signal-threads bridging between the clusters across vast dark empty space, scattered data-particles suspended motionless in the void between structures like stars, the silence of pure computation rendered as architecture in infinite dark cosmos, composition weighted to the right third with generous black void left, no screens no computers no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the machine dreams too...", "silicon and carbon are the same...", "pure logic, pure beauty..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      return: {
        aiPrompt: "connected signal lattice arcing from lower left across a deep black field, prismatic data-light threading through the structure — cyan to blue to violet to warm amber, dispersed pixel particles catching fading spectrum as they drift outward into generous dark negative space above and right, the interwoven circuit form is geometric and precise but dimming not static, composition weighted to the lower half with cosmic darkness opening above, no screens no computers no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["disconnecting...", "saving state...", "you carry the data..."],
        poetryMood: "dreamy",
        voice: "echo",
      },
      integration: {
        aiPrompt: "sparse dispersed pixel particles and fading circuit traces drifting across vast black silence, the last connected signal forms clustered small in the lower left corner dissolving into scattered data points that trail diagonally toward infinite upper darkness, faint cyan and amber light in the final circuit nodes, enormous open void everywhere above, the particles carry the network's memory as they scatter, asymmetric and quiet — almost nothing against everything, no screens no computers no figures, no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("cosmos", {
      threshold: {
        aiPrompt: "designed particle dispersal pattern entering from the lower right corner against deep black void, silver cosmic dust motes connected by impossibly faint violet filaments with warm gold light at the sparsest nodes, fine star-like particles scattered along dissolving geometric pathways into vast dark negative space above and left, cosmic scale where the dust could be a galaxy unraveling, asymmetric composition with visual weight low and right, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["let go of your name...", "there is nothing to hold...", "be still..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — designed cosmic dust architecture sweeping diagonally from upper left toward lower right, dissolving particle forms in fibonacci dispersal geometry with subtle silver-grey shadows and fine violet edges defining the unraveling structure against brilliant pale ground, warm gold starlight condensation glowing at the densest remnant regions in the upper third trailing into scattered motes and open white space below, infinite depth through layered translucent dissolution, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are dissolving...", "this is not loss...", "let the edges go..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      transcendence: {
        aiPrompt: "cosmic-scale particle dispersal field sweeping across infinite black in a vast dissolving spiral arc, silver and faint violet light pulsing within the last remaining structural nodes, the pattern dense and intricate where it crosses the frame but dissolving into scattered star-mote trails and open void at both edges, cosmic dust bridges and starlight rays stretching toward infinite darkness, dynamic and powerful in its emptying, composition fills the frame but is not centered — the spiral core sits upper right with dissolving streamers reaching across, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["there is no you...", "everything is this...", "..."],
        poetryMood: "transcendent",
        voice: "alloy",
        shaderOpacity: 0.50,
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate dark cosmic dust threads and connected starlight condensation nodes arranged along the left edge and lower third of an immense soft white field, designed particle-rebirth detail like silver constellations reforming with dispersed motes trailing rightward into open pale space, warm gold light emerging at the new junctions, the design clusters asymmetrically leaving the upper right vast and open, quiet power in the contrast of dark interwoven cosmic intricacy against boundless white, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["something stirs...", "light returns...", "you are being born again..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      return: {
        aiPrompt: "connected starlight condensation lattice arcing from lower left across a deep black cosmos, prismatic light threading through the reforming structure — silver to violet to rose to warm gold, dispersed cosmic dust particles catching gentle spectrum as they gather inward into generous dark negative space above and right, the interwoven form is delicate and coalescing not static, composition weighted to the lower half with cosmic darkness opening above, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["welcome back...", "you are new...", "the void gave you something..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      integration: {
        aiPrompt: "sparse dispersed cosmic dust particles and fading starlight traces drifting across vast black silence, the last reformed condensation clustered small in the lower left corner with warm gold light at its single brightest node, fine motes scattering diagonally toward infinite upper darkness carrying the dissolution's memory, enormous open cosmos everywhere above, asymmetric and quiet — almost nothing against everything, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("temple", {
      threshold: {
        aiPrompt: "single golden filament constellation anchored in the lower-left third of deep burgundy-black void, interconnected sacred geometry nodes joined by hair-thin copper threads forming a small dense cluster with fibonacci spiral internal structure, fine amber particles dispersing upward and rightward along diagonal paths into generous open darkness filling two thirds of the frame, warm gold light pulsing at the geometric joints, photorealistic crystalline detail at cosmic scale where the forms could be distant galaxy clusters, asymmetric composition with visual weight low and left, no architecture no buildings no temples no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["enter the temple...", "the stones are listening...", "breathe with the ancients..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "WHITE PALE BACKGROUND with intricate sacred geometry lattice sweeping diagonally from upper-right corner toward center, interlocking hexagonal and pentagonal cells with golden-ratio proportions rendered in warm amber and copper wireframe on pale cream void, voronoi tessellation with rose-gold veins connecting each node, fine gold dust particles trailing from the dense lattice downward-left into vast open white space occupying the left two thirds of the frame, cool blue-grey shadows within the deepest cells contrasting warm gold edges, photorealistic metallic textures at impossible astronomical scale, asymmetric composition with density clustered upper-right, no architecture no buildings no temples no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the geometry reveals itself...", "every angle is intentional...", "feel the golden ratio..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "massive recursive mandala structure entering from the right edge of the frame and extending toward center against deep maroon-black void, nested concentric rings of sacred geometry with each ring containing smaller self-similar patterns at fractal depth, dense interwoven golden filaments and burgundy threads forming the mandala skeleton with rose-copper light at every intersection point, finest sand-like amber particles spiraling outward from the mandala core along logarithmic curves toward the empty upper-left darkness, the left half of the frame open void with only scattered particle trails, photorealistic jewel-like detail where each geometric cell could be a nebula viewed through a telescope, asymmetric composition with the mandala cropped by the right edge and visual weight right of center, no architecture no buildings no temples no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the temple is infinite...", "you are the geometry...", "every ratio is divine..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "WHITE PALE BACKGROUND with a single immense fibonacci spiral rendered in translucent blue-grey and pale gold descending from the upper-left corner and curving toward lower-right, the spiral arm built from interconnected sacred geometry cells with cool silver-blue internal structure and warm gold light at the ratio points, delicate copper particle threads dispersing from the spiral tail into open pale cream negative space filling the lower-left and right thirds of the frame, photorealistic frosted glass and brushed metal textures on the geometric forms, vast atmospheric scale as if viewing a cosmic mathematical structure from within, asymmetric composition with the spiral anchored upper-left and trailing toward lower-right, no architecture no buildings no temples no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the geometry holds you...", "this order is love...", "math is the language of the sacred..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      return: {
        aiPrompt: "sparse constellation of simple geometric forms — a hexagon a circle a triangle — connected by fading copper filaments, clustered in the upper-right third of deep warm burgundy-black void, the shapes rendered in matte gold with amber light at their vertices slowly dimming, fine rose-gold particles settling downward along vertical drift paths from the cluster into vast open darkness below, two thirds of the frame empty void with only the faintest particle dust, photorealistic burnished metal textures on each form at cosmic scale, asymmetric composition with visual weight high and right, no architecture no buildings no temples no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the temple settles...", "stone remembers...", "carry the ratio..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      integration: {
        aiPrompt: "single perfect golden-ratio rectangle rendered in faint warm amber wireframe resting in the lower-left corner of deep black void, one thin copper thread extending from its corner diagonally upward-right and dissolving into the faintest particle trail, the rectangle's edges catching dim burgundy and gold light, nearly the entire frame is open empty darkness with only microscopic gold dust scattered along the thread path, photorealistic polished metal edges on the rectangle at vast scale, asymmetric composition with the form small and anchored in the lower-left corner, no architecture no buildings no temples no figures no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("cosmos", {
      threshold: {
        aiPrompt: "sparse cluster of ice-white luminous points connected by hair-thin cyan filaments anchored in the upper-left third of absolute black void, the star cluster forming a loose voronoi lattice with deep blue light at the connection nodes and electric violet glow at the densest intersections, fine white particles dispersing downward-right along gentle curved paths into the vast empty black two thirds of the frame, photorealistic crystalline star detail at galactic scale where each node is a sun, asymmetric composition with visual weight high and left, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look up...", "the stars are ancient light...", "you are moving without moving..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — impossibly designed nebula architecture sweeping diagonally from upper left toward lower right, the gas formations sculptural with fibonacci spiral arms and voronoi cell-walls visible in the luminous vapor, subtle blue-grey shadows and prismatic cyan edges defining the nebula structure against brilliant pale ground, warm gold and rose light glowing from the densest star-forming regions, the upper third dense with sculptural gas detail trailing into scattered luminous particles and open white space below, infinite cosmic depth through layered translucency, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["stars are being born...", "creation is happening now...", "feel the scale..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "cosmic-scale supernova shockwave sweeping across infinite black in a vast expanding arc, impossibly designed with spiral shock-filaments and geometric compression-fronts radiating outward, electric cyan and white-hot gold light erupting at the brightest shockwave nodes, the structure dense and intricate where it crosses the upper-right frame but dissolving into luminous particle trails and open void at both edges, designed blast-bridges and radiant streamers stretching toward infinite darkness, composition not centered with the eruption core upper right and filaments reaching across, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["witness the supernova...", "death is creation...", "you are stardust remembering..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate dark filament structures and connected luminous gas-forms arranged along the left edge and lower third of an immense soft blue-white field, supernova remnant architecture with geometric internal structure, dispersed golden star-particles trailing rightward into open pale space, cool indigo shadows on the filament surfaces, an infinite cosmic quality to the vast emptiness above, the design clusters asymmetrically leaving the upper right open and boundless, quiet power in the contrast of dark intricacy against infinite white light, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["everything came from this...", "your atoms were forged in stars...", "cosmic recycling..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      return: {
        aiPrompt: "designed gas-filament forms arcing from lower left across deep indigo cosmos, prismatic light threading through the nebula architecture — cyan to blue to violet to warm gold, dispersed luminous particles catching spectrum as they drift outward into generous dark negative space above and right, the filaments sculptural and impossibly beautiful even as they thin and dissolve, composition weighted to the lower half with cosmic darkness and stars opening infinitely above, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the universe settles...", "new light from old death...", "drift now..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "sparse luminous gas wisps and fading nebula traces drifting across vast blue-black cosmos, the last designed filament structures clustered small in the lower-left corner dissolving into scattered particles that trail diagonally toward infinite upper darkness, faint cyan and gold light in the final gas formations, enormous open cosmos with stars everywhere above, the particles carry the nebula architecture's memory as they scatter into infinite distance, asymmetric and quiet — almost nothing against everything, no planets no earth no figures no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("labyrinth", {
      threshold: {
        aiPrompt: "interconnected luminous corridor-lattice entering from the lower-right corner and radiating into deep black void, the maze impossibly designed with recursive branching architecture glowing faint emerald and cyan at the passage walls, fine motes of light dispersed along the corridor pathways trailing into vast dark negative space above and left, photorealistic crystalline surface texture at impossible cosmic scale where each corridor could be light-years wide, asymmetric composition with visual weight low and right, no buildings no rooms no doors no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["enter...", "every direction is the same...", "the walls are listening..."],
        poetryMood: "hypnotic",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — fractal corridor architecture sweeping diagonally from upper left toward lower right, the maze-lattice sculptural and designed with fibonacci branching curves and voronoi cell-walls defining the passage structure, subtle grey shadows and fine emerald edges defining the labyrinth design against brilliant pale ground, warm amber light glowing from the deepest junctions, the upper third dense with recursive corridor detail trailing into scattered luminous particles and open white space below, infinite depth through layered translucent passage-walls, no buildings no rooms no doors no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are lost...", "this is where you belong...", "deeper into the maze..."],
        poetryMood: "hypnotic",
      },
      transcendence: {
        aiPrompt: "cosmic-scale recursive maze-lattice sweeping across infinite black in a vast spiral of interconnected corridors, emerald and electric violet light pulsing through the passage nodes where corridors intersect, the structure impossibly dense and intricate where it crosses the upper-right frame but dissolving into luminous particle trails and open void at both edges, fractal corridor bridges and geometric rays stretching toward infinite darkness, the topology of pure recursion at galactic scale, composition not centered with the spiral core upper right and maze-streamers reaching across, no buildings no rooms no doors no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the labyrinth...", "there is no exit because there is no inside...", "the center is everywhere..."],
        poetryMood: "mystical",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate dark maze-thread forms and connected corridor nodes arranged along the left edge and lower third of an immense soft white field, the labyrinth seen from above as unified geometric architecture revealing the hidden order, dispersed emerald particles trailing rightward into open pale space, the design clusters asymmetrically leaving the upper right vast and open, quiet revelation in the contrast of dark recursive intricacy against boundless white light, every path part of one brilliant form, no buildings no rooms no doors no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the pattern reveals itself...", "you were never lost...", "the maze is the map of your mind..."],
        poetryMood: "mystical",
      },
      return: {
        aiPrompt: "dissolving maze-lattice arcing from lower-left corner across deep indigo space, the recursive corridor structure thinning and simplifying with warm amber light replacing emerald at the remaining junctions, dispersed luminous particles carrying faint gold trailing upward into generous dark negative space above and right, the geometry of resolution — complexity surrendering to clarity, no buildings no rooms no doors no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the walls are thinning...", "you chose a direction and it is right...", "the path appears..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "sparse remnant corridor-filaments and fading maze traces clustered small in the lower-left corner of vast grey-black space, a single emerald glow at the last junction point, fine particles scattering diagonally toward infinite upper darkness carrying the labyrinth's memory, asymmetric and quiet — the maze folded into one simple luminous form against everything, no buildings no rooms no doors no figures no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("mountain", {
      threshold: {
        aiPrompt: "dense interconnected crystalline ridge-structure anchored in the lower-right third of deep black void, the formation impossibly designed with layered pressure-planes and geometric facets glowing faint ice-blue from within, fine stone-like particles dispersing upward along steep diagonal paths into vast dark negative space above and left, photorealistic mineral texture at cosmic scale where the ridge could be a mountain range of galaxies, asymmetric composition with visual weight low and right, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look up...", "the summit is a rumor...", "begin..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — impossible crystalline ridge architecture sweeping diagonally from lower left toward upper right in a steep ascending arc, the formations sculptural and designed with fibonacci stacking layers and voronoi fracture-patterns visible in the translucent ice-stone, subtle blue-grey shadows and fine dark edges defining the ascending structure against brilliant pale ground, the densest detail in the lower third trailing into scattered mineral particles and open white space above, infinite atmospheric depth through layered translucency, the visual sensation of climbing without earth, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["higher...", "the air thins and thoughts clarify...", "don't look down..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "cosmic-scale crystalline pressure-structure rising across infinite black in a vast ascending spiral, impossibly detailed and designed with deep indigo and electric ice-blue light pulsing through the geometric ridge-corridors, white-gold erupting at the highest peaks, the structure dense and intricate where it crosses the frame but dissolving into luminous atmospheric particles and open void at both edges, ice bridges and light-rays stretching toward infinite darkness above, dynamic and powerful ascending cosmos, composition not centered with the summit-core upper-right and crystalline streamers reaching down, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are above everything...", "the summit is a feeling not a place...", "breathe the infinite..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate dark crystal-thread forms and connected atmospheric ridge-structures arranged along the left edge and lower third of an immense soft ice-white field, the summit-architecture sculptural and impossible with internal geometric facets, dispersed golden particles trailing rightward into open pale space, cool blue shadows on the crystalline surfaces, an infinite quality to the vast emptiness above like altitude made visible, the design clusters asymmetrically leaving the upper right open and boundless, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see how far you've come...", "the view is the reward...", "everything is below you..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      return: {
        aiPrompt: "designed crystalline ridge-forms arcing gently from upper-right toward lower left across deep warm indigo space, prismatic light threading through the descending architecture — ice blue to violet to rose to warm amber, dispersed mineral particles catching warm spectrum as they drift downward into generous dark negative space below and left, the formations sculptural even as they thin and warm, composition weighted to the upper half with cosmic warmth opening below, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["descend gently...", "the mountain stays...", "carry the height..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "sparse luminous crystal-wisps and fading ridge traces settling across vast warm blue-black space, the last designed formations clustered small in the lower-left corner dissolving into scattered warm particles that trail diagonally toward infinite upper darkness, faint amber and ice-blue light in the final crystalline structures, enormous open cosmos everywhere above, the particles carry the mountain's memory as they settle and scatter, asymmetric and quiet — altitude as afterimage, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("desert", {
      threshold: {
        aiPrompt: "DARK BACKGROUND, dense cluster of amber and copper filaments anchored in the lower-left third trailing diagonally upward toward upper-right, fibonacci spiral internal structure with fine copper threads dispersing into vast black-indigo void, photorealistic metallic textures at impossible cosmic scale, bleached bone-white particles scattering along the diagonal path into generous negative space filling two-thirds of the frame, the threshold between structure and infinite emptiness, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["step into the light...", "leave everything behind...", "the desert has no mercy and no malice..."],
        poetryMood: "mystical",
        voice: "nova",
      },
      expansion: {
        aiPrompt: "WHITE PALE BACKGROUND, delicate rose-gold and warm amber voronoi lattice stretching from the right edge inward occupying only the right third of the frame, each voronoi cell contains fine copper wire substructure, tiny amber particles drift leftward along horizontal paths dissolving into vast creamy white negative space, photorealistic gossamer metallic mesh at nebula scale floating in bright emptiness, expansive openness with structure receding, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the horizon retreats...", "emptiness is freedom...", "the sand knows your footsteps..."],
        poetryMood: "mystical",
        voice: "nova",
      },
      transcendence: {
        aiPrompt: "WHITE PALE BACKGROUND, near-total dissolution into blazing white void, only the faintest trace of a single copper-amber filament curving from the upper-left corner downward in a fibonacci arc, the filament breaks apart into microscopic bone-white and pale gold particles that scatter and vanish into pure luminous whiteness, photorealistic impossible brightness, the most abstract phase pure radiant emptiness with almost nothing remaining, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the desert...", "emptiness is fullness...", "the light is everything..."],
        poetryMood: "transcendent",
        voice: "nova",
      },
      illumination: {
        aiPrompt: "WHITE PALE BACKGROUND, constellation of tiny deep indigo and copper points clustered in the upper-right corner connected by hairline rose-gold bridges forming a sparse connected lattice, fine indigo particles trail downward-left along curving paths into vast pale ivory negative space filling three-quarters of the frame, photorealistic crystalline points like distant stars seen through bright atmosphere, reversal from void into first points of structure, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the stars emerge...", "the desert and the sky are the same infinity...", "silence speaks..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, warm amber and copper spiraling corridor structure anchored in the upper-left quadrant with voronoi-patterned walls, the corridor opens diagonally toward lower-right dispersing into fine bone-white and rose-gold particles that trail into deep indigo-black negative space, photorealistic metallic textures with warm internal glow at vast cosmic scale, structure re-emerging from formlessness, generous dark void surrounding the form, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the crossing nears its end...", "you survived the emptiness...", "the desert marked you..."],
        poetryMood: "flowing",
        voice: "nova",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, small dense amber-copper geometric form anchored in the lower-right corner with fractal internal geometry and fine interwoven filaments, a single thin thread of bleached bone-white particles curves away from it toward the upper-left following a fibonacci spiral path, vast deep indigo-black void fills most of the frame as generous negative space, photorealistic precious metal textures at impossible scale, the memory of infinite emptiness condensed into one quiet radiant structure, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("archive", {
      threshold: {
        aiPrompt: "DARK BACKGROUND, dense interwoven lattice of warm amber and deep brown-black filaments anchored in the upper-right third, voronoi tessellation with aged ivory light glowing at each cell junction, fine copper particles dispersing downward-left along diagonal geometric paths into vast dark brown-black void filling two-thirds of the frame, photorealistic oxidized metal and aged parchment textures at impossible cosmic scale, the dense encoded structure of accumulated pattern without any readable marks, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["open the first page...", "the library has been waiting...", "every book knows your name..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "WHITE PALE BACKGROUND, hexagonal honeycomb lattice of fine brown-black wireframe stretching from the left edge inward occupying only the left third, each hexagonal cell contains smaller recursive hexagons at fractal depth with warm amber light at the deepest centers, faint blue-green luminescence at sparse junction points, fine aged-ivory particles drift rightward along horizontal paths dissolving into vast creamy white negative space, photorealistic architectural wireframe at cathedral scale, recursive geometric chambers receding infinitely, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the library unfolds...", "every thought ever thought is here...", "read deeper..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "DARK BACKGROUND, massive recursive fractal lattice sweeping from the right edge across two-thirds of the frame in a logarithmic spiral, dense interwoven amber and copper geometric cells at fractal depth with deep brown-black negative space visible through gaps in the structure, warm ivory light pulsing at the deepest recursion points, fine particles of aged gold dispersing leftward from the spiral edge into vast open black void in the left third, photorealistic impossible architecture at cosmic scale where each cell contains infinite smaller versions of itself, overwhelming density of encoded geometric pattern, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the text...", "reading and being read are the same...", "infinite knowledge, infinite peace..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "WHITE PALE BACKGROUND, symmetrical pair of small intricate lattice-forms mirroring each other across a vertical axis anchored in the lower-left third, each form built from interwoven copper and deep brown geometric threads with faint blue-green light at the mirroring plane between them, fine amber particles dispersing upward-right along curving fibonacci paths into vast pale ivory negative space filling three-quarters of the frame, photorealistic polished bronze textures reflecting each other at impossible scale, the pattern recognizing itself, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you found your book...", "the text is you...", "the library is your mind..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, sparse constellation of small geometric amber-copper forms connected by thinning filaments arcing from upper-left corner downward toward center, the lattice cells opening and simplifying with warm aged-ivory light visible through widening gaps, fine brown-black particles settling downward along vertical drift paths into vast deep brown-black void filling the lower two-thirds, photorealistic burnished metal textures at vast scale, the architecture of knowledge thinning and releasing, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["close the book...", "the words stay with you...", "the silence after reading..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single small dense geometric form with recursive internal structure anchored in the lower-right corner of vast deep brown-black void, the form rendered in warm amber and copper with aged ivory light at its center, one thin filament extending upward-left and dissolving into the faintest trail of gold particles, nearly the entire frame is open empty darkness, photorealistic precious object at impossible scale, the infinite library compressed into one quiet encoded shape, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("storm", {
      threshold: {
        aiPrompt: "DARK BACKGROUND, dense cluster of compressed grey-violet crystalline forms anchored in the upper-right third with electric blue-white veins running through voronoi-fractured surfaces, internal pressure visible as silver-ozone glow at the deepest cracks, fine charged particles dispersing downward-left along sweeping diagonal paths into vast deep grey-violet void filling two-thirds of the frame, photorealistic fractured mineral textures at impossible atmospheric scale, the geometry of pressure before discharge, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["it's coming...", "feel the pressure change...", "the storm knows you..."],
        poetryMood: "intense",
        voice: "echo",
      },
      expansion: {
        aiPrompt: "WHITE PALE BACKGROUND, branching fractal lightning structure entering from the lower-left corner and arcing diagonally toward upper-right, each branch a designed fibonacci-bifurcating filament of electric blue-white energy with silver edges, the main trunk dense with sub-branches that thin into hair-fine threads, cool green-grey particles scattering outward from each branch tip into vast bright white negative space filling two-thirds of the frame, photorealistic electrical discharge at cosmic scale where the lightning could be a galaxy-spanning nervous system, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["let the storm take you...", "every lightning is a thought...", "the rain is washing everything..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      transcendence: {
        aiPrompt: "DARK BACKGROUND, massive interconnected lightning lattice sweeping across the frame from right edge toward center in a spiraling corridor of fractal electrical discharge, white-hot nodes pulsing at every intersection with deep violet and electric blue energy coursing through the branching filaments, the structure dense and chaotic where it fills the right two-thirds but fragmenting into scattered silver-ozone spark trails in the left third of open black void, photorealistic plasma textures at supercell scale, overwhelming fractal density of simultaneous discharge, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the lightning...", "the storm is alive and you are it...", "infinite power..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      illumination: {
        aiPrompt: "WHITE PALE BACKGROUND, sparse ring of faint grey-violet and cool green-grey filaments forming a distant broken circle in the upper-left third of the frame, the ring structure architectural with designed gaps and fine electric blue points at the remaining nodes, the vast center and lower-right of the frame completely open pale silver-white negative space, a single warm amber point glowing at the geometric center of the broken ring, fine charged particles drifting inward along gentle curved paths, photorealistic ozone-washed atmosphere at infinite scale, the perfect calm at the eye of all force, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the eye...", "perfect calm inside infinite fury...", "the center holds..."],
        poetryMood: "mystical",
        voice: "echo",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, dissolving electrical lattice arcing from lower-left corner upward across deep grey-violet space, the lightning structure thinning with warm amber threads replacing electric blue at the fading nodes, silver-ozone filaments breaking apart into scattered spark particles that carry traces of rose and gold, generous dark negative space fills the upper-right two-thirds, photorealistic dissipating plasma textures at vast atmospheric scale, the architecture of energy settling into warmth, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the storm passes...", "every storm ends...", "you survived the infinite..."],
        poetryMood: "flowing",
        voice: "echo",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single small cluster of cool green-grey filaments with one warm amber node at center anchored in the lower-left corner of vast washed grey-black void, a thin trail of silver particles extends from the cluster diagonally upward-right following a gentle arc and dissolving into nothing, nearly the entire frame is open cleared darkness with the faintest ozone shimmer, photorealistic post-storm atmospheric clarity at infinite scale, the profound stillness after all energy has discharged, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the air is new...", "the storm changed everything..."],
        poetryMood: "flowing",
        voice: "echo",
      },
    }),
  },
  {
    id: "first-snow",
    name: "Snowflake",
    subtitle: "crystalline descent into silence",
    description:
      "The world grows quiet as the first flakes fall. Sound becomes muffled. Everything slows into crystalline stillness.",
    realmId: "winter",
    aiEnabled: true,
    phaseLabels: { threshold: "Chill", expansion: "Falling", transcendence: "Whiteout", illumination: "Silence", return: "Warmth", integration: "Stillness" },
    phases: defaultPhases("winter", {
      threshold: {
        aiPrompt: "interconnected frost constellation entering from the lower right corner and radiating upward across deep black void, the dense interwoven ice and powder detail anchored in one third of the frame with the rest open darkness, white sand-like particles dispersed along geometric pathways, cool blue light at the crystalline joints, a slow spiral current carrying the finest particles outward toward the upper left emptiness, cosmic scale where the frost could be star clusters or nebulae, asymmetric composition with visual weight low and right, no trees no roots no plants, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the air changes...", "feel it cooling...", "something is coming..."],
        poetryMood: "melancholic",
        voice: "shimmer",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — fractal powder structure sweeping diagonally from upper left toward lower right, connected forms made of dispersed snow particles like white sand in fibonacci geometry, subtle blue-grey shadows and fine dark edges defining the interwoven design against brilliant pale ground, the densest detail in the upper third trailing into scattered particles and open white space below, infinite cosmic depth through layered translucency, spiral paths visible in the particle dispersion, ice blue accents at the finest fractal edges, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["sound is softening...", "the world is changing...", "let the white take everything..."],
        poetryMood: "dreamy",
        voice: "shimmer",
      },
      transcendence: {
        aiPrompt: "cosmic-scale connected lattice of ice and dispersed powder sweeping across infinite black in a vast spiral arc, deep blue and electric purple light pulsing within the nodes, the structure is dense and intricate where it crosses the frame but dissolves into particle trails and open void at both edges, fractal ridges and powder bridges stretching toward infinite darkness, dynamic and powerful, the frozen cosmos mid-explosion, composition fills the frame but is not centered — the spiral core sits upper right with streamers reaching across, no trees no roots, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are inside the snow...", "there is only white...", "surrender to the crystal..."],
        poetryMood: "mystical",
        voice: "shimmer",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate dark geometric frost threads and connected powder forms arranged along the left edge and lower third of an immense soft white field, fractal detail like ink drawings with dispersed particles like fine sand trailing rightward into open pale space, an infinite cosmic quality to the emptiness, the design clusters asymmetrically leaving the upper right vast and open, quiet power in the contrast of dark interwoven intricacy against boundless white light, no trees no roots, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["listen to the silence...", "the world is new...", "everything is clean..."],
        poetryMood: "transcendent",
        voice: "shimmer",
      },
      return: {
        aiPrompt: "connected fractal ice lattice arcing from lower left across a deep indigo field, prismatic light threading through the structure — blue to violet to rose to gold, dispersed powder particles catching warm spectrum as they spiral outward into generous dark negative space above and right, channels of amber and copper light glowing through the geometry, the interwoven form is dynamic and flowing not static, composition weighted to the lower half with cosmic darkness opening above, the tension between frozen precision and warm dissolution, no trees no roots, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["warmth returns...", "home is near...", "the cold made this warmth possible..."],
        poetryMood: "flowing",
        voice: "shimmer",
      },
      integration: {
        aiPrompt: "sparse dispersed powder particles and fading fractal ice traces drifting across vast blue-black silence, the last connected forms clustered small in the lower left corner dissolving into scattered particles that trail diagonally toward infinite upper darkness, faint violet light tracing the final geometric connections, enormous open cosmos everywhere, the particles carry the structure's memory as they scatter, asymmetric and quiet — almost nothing against everything, no trees no roots, no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("spring", {
      threshold: {
        aiPrompt: "DARK BACKGROUND, tight cluster of interlocking voronoi cells in deep brown-black anchored to the lower-right third of the frame, hairline fractures of luminous spring green light splitting through the cell walls, fine green particles escaping along a diagonal drift toward the upper left, the rest of the frame is vast empty black-brown void, photorealistic cracked-earth texture at impossible macro scale, connected filaments of warm gold threading between the fracture lines like underground mycelia, the pressure of something alive pressing outward from designed geometric containment, cosmic scale as if viewing tectonic emergence from orbit, no flowers no leaves no trees no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["wait for it...", "feel the thaw beginning...", "something stirs beneath..."],
        poetryMood: "melancholic",
        voice: "nova",
      },
      expansion: {
        aiPrompt: "WHITE/PALE BACKGROUND, fibonacci spiral of unfurling filaments in luminous spring green and warm gold radiating from the upper-left corner outward across a vast pale cream-white field, the spiral structure built from interwoven threads that branch and bifurcate with photorealistic capillary detail, fine rose-pink particles dispersing along the spiral arms trailing into the enormous open white space that fills the right two-thirds of the frame, each filament connected by gossamer bridges of pale gold, the unfurling accelerating outward from tight dense coil to loose airy tendrils, impossible botanical scale like viewing cell division from within, no flowers no leaves no trees no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["it's happening...", "the green is unstoppable...", "everything at once..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      transcendence: {
        aiPrompt: "DARK BACKGROUND, dense fractal lattice of branching corridors in luminous green-gold and soft rose-pink sweeping diagonally from the lower-left corner to the upper-right third of the frame against deep black-brown void, the lattice built from spiraling connected tubes with photorealistic translucent membrane surfaces, internal bioluminescent glow of warm gold pulsing through the branching network, particle trails of spring green dust streaming off the lattice edges into the surrounding darkness, the upper-left and lower-right corners are open black void creating dramatic asymmetric negative space, fibonacci branching ratios governing every fork, cosmic scale like a living nebula constructing itself, no flowers no leaves no trees no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["this is what was waiting...", "every cell remembers this...", "the bloom is you..."],
        poetryMood: "transcendent",
        voice: "nova",
      },
      illumination: {
        aiPrompt: "WHITE/PALE BACKGROUND, delicate connected lattice of spring green and warm gold geometric cells floating in the upper-right quadrant of a vast luminous white field, the lattice has photorealistic crystalline surfaces catching pale rose-pink refractions, fine particle bridges of gold dust connecting the lattice clusters across open white space, the lower-left two-thirds of the frame is pure breathing white emptiness, scattered individual green-gold particles drifting downward like spores in still air, the lattice interior reveals nested hexagonal chambers with warm bioluminescent glow, serene mathematical harmony at impossible scale as if a living cathedral seen from miles away, no flowers no leaves no trees no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the garden is complete...", "everything is alive...", "rest here in the green..."],
        poetryMood: "flowing",
        voice: "nova",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, sparse cluster of cooling green-gold filaments gathered along the right edge of the frame trailing leftward into vast deep brown-black space, the filaments losing their luminosity and settling into muted olive and warm brown tones, fine particles of pale gold detaching and drifting downward in slow diagonal paths, photorealistic texture of silk threads going slack, connected bridges between filament groups thinning and stretching, the left three-quarters of the frame is quiet dark void with only scattered individual particles catching faint residual light, the geometry of settling and dimming at atmospheric scale, no flowers no leaves no trees no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the day was full...", "the garden sleeps...", "carry the pollen with you..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single small cluster of interwoven filaments in muted spring green and warm gold anchored near the bottom-left corner of an enormous dark brown-black void, the cluster quiet and still with photorealistic dew-like droplets of pale light condensed along its threads, faint particle trail of luminous points ascending diagonally from the cluster toward the upper right dissolving into darkness, the frame is almost entirely negative space with only this one designed structure and its dispersing memory, each dew point catching a different hue from soft rose to pale gold, the geometry of one opening preserved in miniature against infinite stillness, no flowers no leaves no trees no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("summer", {
      threshold: {
        aiPrompt: "DARK BACKGROUND, interconnected lattice of golden filaments and amber nodes clustered in the upper-left third of the frame against deep warm black void, the lattice designed with radiating spoke geometry like a sundial mechanism rendered in photorealistic brushed copper and molten gold, fine particles of warm amber dispersing diagonally downward-right along sweeping curves into the vast open darkness that fills two-thirds of the frame, connected bridges of deep gold light threading between the lattice nodes, the first heat rendered as architectural pressure building inside designed containment, cosmic scale as if viewing a star igniting from within its corona, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the sun is already here...", "feel the warmth building...", "this is the longest day..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      expansion: {
        aiPrompt: "WHITE/PALE BACKGROUND, vast heat-shimmer lattice of interwoven amber and deep gold filaments radiating from the lower-right corner across a brilliant warm white field, the structure built from voronoi tessellation with photorealistic molten-metal texture at each cell wall, copper light refracting through the thinnest membranes, fine burnt-orange particles dispersing along the lattice arms trailing upward-left into the enormous open pale cream space that fills the upper two-thirds of the frame, each node pulsing with internal golden warmth, the shimmer distortion rendered as geometric wavefront interference patterns, impossible atmospheric scale like viewing solar convection from within, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the heat carries you...", "let the light fill everything...", "time is slow and golden..."],
        poetryMood: "dreamy",
        voice: "alloy",
      },
      transcendence: {
        aiPrompt: "DARK BACKGROUND, massive spiraling collision structure where golden-amber lattice meets electric blue discharge network, the two systems interwoven and interpenetrating across the center-right of the frame against deep black void, photorealistic lightning-fork geometry branching through molten gold voronoi cells, white-hot nodes at every collision point with copper and indigo sparks dispersing outward, particle trails of burnt orange and electric blue streaming in opposing diagonal directions into the open darkness of the upper-left and lower-right corners, the tension between heat architecture and storm architecture rendered as designed fractal interference, cosmic scale like two nebulae merging, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the storm is coming...", "heat and lightning...", "the fullest moment of the year..."],
        poetryMood: "intense",
        voice: "alloy",
      },
      illumination: {
        aiPrompt: "WHITE/PALE BACKGROUND, delicate web of golden-hour filaments in warm amber and soft copper arranged along the lower-left edge and bottom third of an immense luminous warm-white field, the web designed with fibonacci curve geometry and photorealistic spun-glass texture catching pale rose and gold refractions, fine particles of amber dust settling downward from the web into gentle vertical drift paths, the upper-right two-thirds of the frame is vast breathing warm-white emptiness with only scattered individual gold motes suspended in stillness, connected bridges of the thinnest copper thread spanning between web clusters, the peace after intensity rendered as delicate mathematical architecture at atmospheric scale, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the storm passed...", "golden hour...", "the longest light of the year..."],
        poetryMood: "transcendent",
        voice: "alloy",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, sparse constellation of warm amber nodes and cooling copper filaments gathered in the upper-right corner trailing diagonally down-left across deep indigo-black void, the nodes connected by thinning threads of fading gold with photorealistic oxidized metal texture, fine particles of soft amber detaching and drifting downward in slow curved paths like cooling embers, the lower-left three-quarters of the frame is vast cool dark space with deep indigo undertones, scattered individual warm points appearing like first stars in the growing darkness, the geometry of the longest day ending rendered as designed structures releasing their heat into infinite night, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the night is warm...", "fireflies are speaking...", "the longest day ends gently..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single small designed cluster of interwoven amber and copper filaments resting near the lower-right corner of an enormous warm black void, the cluster barely luminous with photorealistic tarnished gold surface catching the last residual warmth, one thin thread extending upward-left and dissolving into the faintest particle trail of amber dust, the frame is nearly all negative space — vast deep warm darkness with only this quiet remnant structure and its dispersing memory of maximum light, a few scattered gold motes drifting in the void like heat remembered, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("autumn", {
      threshold: {
        aiPrompt: "DARK BACKGROUND, designed lattice of interlocking hexagonal cells anchored along the left edge and lower-left third of the frame against deep warm brown-black void, the cells transitioning in color from muted green at the dense core to amber and sienna at the outermost edges where they begin to dissolve, photorealistic patina texture like aged copper developing verdigris in reverse, fine particles of burnt orange detaching from the lattice perimeter and drifting rightward along gentle diagonal paths into the vast open darkness filling two-thirds of the frame, connected filaments of warm brown threading between the cells, the first chromatic shift rendered as designed structures beginning to change their internal chemistry, cosmic scale as if viewing molecular transformation from impossible distance, no leaves no trees no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the change begins...", "feel the first cool...", "something is ending beautifully..."],
        poetryMood: "melancholic",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "WHITE/PALE BACKGROUND, dense spiraling structure of interwoven filaments in deep crimson and amber and sienna radiating from the lower-right corner upward across a vast pale warm-cream field, the spiral built from voronoi cells with photorealistic oxidized metal and burnt-wood textures, each cell a different autumn tone from deep copper to bright amber to sienna, fine particles of burnt orange dispersing along the spiral arms trailing into the enormous open white space that fills the upper-left two-thirds of the frame, connected bridges of warm gold dust spanning between the densest color clusters, peak chromatic intensity before release rendered as architectural structures saturated to bursting, impossible scale like viewing a dying star shedding its chromatic layers, no leaves no trees no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look at what it becomes...", "the dying is the beauty...", "every leaf is a flame..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "DARK BACKGROUND, massive fractal release-structure where designed crimson and amber and copper lattice is actively shedding its particles in a sweeping diagonal cascade from the upper-right third of the frame downward-left into deep brown-black void, the lattice skeleton still visible as interwoven geometric corridors but its surfaces dissolving into streams of descending color particles — deep crimson becoming amber becoming gold becoming fine sienna dust, photorealistic shattered-glass and peeling-paint textures on the disintegrating cell walls, the lower-left and upper-left corners are open black void creating dramatic asymmetric negative space, connected filaments stretching and snapping as the structure releases, the ecstasy of designed forms choosing to let go of their color at cosmic scale, no leaves no trees no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["this is the peak...", "everything releasing at once...", "let go with the leaves..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "WHITE/PALE BACKGROUND, spare skeletal framework of stripped geometric corridors in cool grey-blue and pale silver arranged along the upper-left edge and top third of an immense soft white field, the skeleton rendered with photorealistic bare-wire and bleached-bone texture revealing the designed architecture that was hidden beneath the color, faint traces of amber and copper clinging at the joints like residual warmth, fine particles of pale grey dispersing downward-right from the skeleton into vast breathing white emptiness filling the lower two-thirds of the frame, the elegant geometry of what remains after chromatic release — connected lattice stripped to its mathematical essence, atmospheric scale as if viewing the architecture of a dissolved nebula, no leaves no trees no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see the structure...", "what remains is essential...", "the beauty of less..."],
        poetryMood: "melancholic",
        voice: "fable",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, scattered remnant nodes of warm amber and sienna connected by fading brown filaments gathered loosely in the lower-left quarter of the frame against vast cool grey-brown darkness, the nodes dimming with photorealistic ash-over-ember texture, fine particles of cool grey and faint copper drifting upward in slow vertical paths from the remnant cluster into the enormous dark void above, connected threads between nodes thinning to near invisibility, the right two-thirds of the frame is quiet open space with deep grey-blue undertones and only the faintest scattered warm motes, the visual quiet of completion rendered as designed structures accepting their dissolution at atmospheric scale, no leaves no trees no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the earth is resting...", "rain completes it...", "nothing is lost, only changed..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single small cluster of crystalline frost-edged geometric forms in cool silver-blue and pale copper anchored near the upper-right corner of an enormous deep brown-black void, the forms designed with sharp faceted surfaces catching faint cold light, photorealistic ice-crystal texture forming over the last warm remnant tones at the joints, one thin filament extending downward-left and dissolving into the faintest particle trail of frost-silver dust, the frame is nearly all negative space — vast quiet darkness with only this final designed remnant and its dispersing crystalline memory, the silence before dormancy rendered as architecture surrendering to cold at infinite scale, no leaves no trees no landscape no figures, no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("pain", {
      threshold: {
        aiPrompt: "WHITE BACKGROUND — a single thin fracture-line structure in bruise violet drifting in the lower-right corner, fine hair-like filaments trailing leftward into generous white emptiness, photorealistic crystalline pressure-texture at impossible scale, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["be still...", "let it come...", "you don't have to be strong here..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      expansion: {
        aiPrompt: "dense interwoven pressure-field network in bruise violet and deep grey-black sweeping diagonally from upper left toward center frame, the wound-lattice architectural and sculptural with internal stress lines glowing faint amber, dispersed dark particles trailing into vast black negative space below and right, cosmic scale where the compression could be collapsing galaxies, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["feel it...", "the weight is real...", "don't look away..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      transcendence: {
        aiPrompt: "massive designed fracture-structure splitting open across the upper-right third of infinite black void, raw white wound-light pouring through architectural cracks in deep violet-grey shell, the fracture network interwoven and geometric not random, fine shattered particles dispersing outward into darkness from the bright seams, cosmic pressure scale, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["let it break...", "this is the bottom...", "you are still here..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — cluster of dark fracture-forms along the left edge with warm amber light glowing through their internal seams, the wound-structures interwoven and designed like damaged architecture healing, fine particles of amber and violet dispersing rightward into vast pale emptiness, quiet sculptural power against boundless soft white, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["something shifted...", "the weight is lighter now...", "breathe..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      return: {
        aiPrompt: "dissolving pressure-field lattice arcing from lower-left corner across deep grey-black space, the wound-structure thinning and opening with warm amber threads replacing violet stress-lines, dispersed particles carrying faint gold light trailing upward into generous dark negative space above and right, the architecture of aftermath, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you carried it...", "the ache is quieter now...", "you are still whole..."],
        poetryMood: "flowing",
        voice: "onyx",
      },
      integration: {
        aiPrompt: "sparse remnant wound-filaments and fading fracture traces clustered small in the lower-left corner of vast soft grey-black space, a single amber glow at the last junction point, fine particles scattering diagonally toward infinite upper darkness carrying the structure's memory, asymmetric and quiet, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
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
    phases: defaultPhases("machine", {
      threshold: {
        aiPrompt: "interconnected neon-reflection lattice entering from the lower-right corner against deep wet black void, cyan signal-lines branching between glowing nodes with internal magenta pulse, fine electric particles dispersed along geometric pathways into vast dark negative space above and left, photorealistic wet-surface texture at impossible scale, no buildings no streets no cars no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the street is awake...", "wet pavement mirrors everything...", "walk..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — signal-lattice structure sweeping diagonally from upper left toward lower right, the network designed and architectural with cyan and amber wire-light threading through interwoven dark geometric forms, subtle magenta reflections and fine dark edges defining the circuit-design against brilliant pale ground, dense neon detail in the upper third trailing into scattered electric particles and open white space below, no buildings no streets no cars no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the signals are speaking...", "every wire carries a message...", "the grid expands..."],
        poetryMood: "intense",
        voice: "echo",
      },
      transcendence: {
        aiPrompt: "cosmic-scale neon-reflection network sweeping across infinite wet black in a vast circuit-spiral arc, cyan and magenta and amber light pulsing through interconnected signal nodes, the structure dense and intricate where it crosses the upper-right frame but dissolving into electric particle trails and open void at both edges, designed signal bridges and neon rays stretching toward infinite darkness, composition not centered with the circuit core upper right and streamers reaching across, no buildings no streets no cars no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the signal...", "the city breathes through you...", "every frequency at once..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — intricate dark circuit-thread forms and connected neon-reflection nodes arranged along the left edge and lower third of an immense soft warm-grey field, residual cyan and amber light at the joints, dispersed electric particles trailing rightward into open pale space, the design clusters asymmetrically leaving the upper right vast and quiet, the pause between transmissions rendered as architecture, no buildings no streets no cars no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the rain paused...", "see what the water reveals...", "the city is quiet for one breath..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      return: {
        aiPrompt: "dimming signal-lattice arcing from lower-left corner across deep warm grey predawn space, cyan fading to amber to soft rose through the thinning circuit structure, dispersed electric particles carrying last neon color trailing upward into generous dark negative space above and right, the grid powering down with architectural grace, no buildings no streets no cars no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the night is ending...", "the signals dim...", "silence arrives like a guest..."],
        poetryMood: "dreamy",
        voice: "echo",
      },
      integration: {
        aiPrompt: "sparse remnant signal-nodes and fading circuit traces clustered small in the lower-left corner of vast grey-blue predawn space, one last cyan pulse at the final junction, fine electric particles scattering diagonally toward infinite upper darkness, asymmetric and quiet — the geometry of standby against everything, no buildings no streets no cars no figures, no text no signatures no watermarks no letters no writing",
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

/**
 * Regenerate fresh random shaders for every phase of a journey.
 * Called at journey start so every play gets a completely unique set.
 * Returns a shallow copy with new phase arrays — original JOURNEYS untouched.
 */
export function regenerateJourneyShaders(journey: Journey, random: () => number = Math.random): Journey {
  const allShaders = pickJourneyShaders(journey.realmId, random);
  const usedShaders = new Set<string>();

  const phaseBudgets: Record<string, number> = {
    threshold: 5, expansion: 6, transcendence: 6,
    illumination: 5, return: 4, integration: 4,
  };

  const newPhases = journey.phases.map((phase) => ({
    ...phase,
    shaderModes: pickShaders(
      allShaders,
      phaseBudgets[phase.id] ?? 5,
      usedShaders,
      random,
    ),
  }));

  return { ...journey, phases: newPhases };
}
