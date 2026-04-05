import type { Journey, JourneyPhase } from "./types";
import { getRealm } from "./realms";
import { MODE_META } from "@/lib/shaders";
import { seededShuffle } from "./seeded-random";
import { applyShaderPreferences } from "./adaptive-engine";

// ─── Full shader library: ALL registered shaders ───
// Every journey draws from this pool — balanced across all categories.
const ALL_SHADERS_RAW: string[] = [
  // Elemental (16)
  "fog", "dusk", "snow", "ocean", "cascade", "whirlpool", "flux",
  "monsoon", "geyser", "magma", "typhoon",
  "chinook", "thermal", "lightning", "maelstrom",
  "deluge", "squall",
  // Visionary (11)
  "astral", "portal", "oracle",
  "revelation", "threshold", "rapture",
  "mandorla", "seraph",
  "halo",
  "nimbus",
  // Cosmic (22)
  "cosmos", "pulsar", "quasar", "supernova",
  "nebula", "singularity", "stardust", "drift", "expanse",
  "comet", "magnetar", "protostar", "redshift", "aphelion",
  "nadir", "parsec", "nova", "photon",
  "selene", "kepler", "cassini", "hubble", "doppler",
  // Organic (15)
  "ethereal", "ember", "tide", "spore",
  "chrysalis", "plankton", "lichen", "growth",
  "enzyme", "pollen", "symbiosis", "chitin",
  "phylum", "kelp", "mangrove",
  // Geometry (21)
  "sacred", "tesseract", "neon", "lattice", "spiral",
  "geodesic", "moire",
  "catenary",
  "astroid", "cardioid", "lissajous", "cymatic", "guilloche",
  "trefoil", "quatrefoil", "involute", "rosette", "roulette", "deltoid", "nephroid", "epicycle",
  // Dark (6)
  "umbra", "inferno", "plasma",
  "vortex",
  "lament", "hollow",
  // Nature (4)
  "river", "rain", "ripple", "flame",
  "starfield", "radiance",
  // 3D Worlds (15)
  "orb", "aurora",
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
/** Shaders blocked from ALL realms except those in REALM_SHADER_ALLOW */
const GLOBAL_SHADER_BLOCKLIST: string[] = [
  "snow", // only appropriate for winter/snowflake or user-created journeys
  "rain", // only appropriate for water-related realms (ocean, storm)
  "lattice", // grid-lined look — not suited for journeys
];

/** Realms that ARE allowed to use globally-blocked shaders */
const REALM_SHADER_ALLOW: Record<string, string[]> = {
  winter: ["snow"], // snow is core to the winter realm
  ocean: ["rain"],  // rain fits underwater/water themes
  storm: ["rain"],  // rain is core to storm imagery
};

const REALM_SHADER_BLOCKLIST: Record<string, string[]> = {
  winter: [
    "magma", "inferno", "bonfire", "flame", // fire
    "aurora", "orb", // wrong vibe
    "neon", "moire", "lattice", "sacred", // solid/geometric
    "mangrove", // tree/botanical 2D
    "tesseract", "cage", // geometric/cube — wrong vibe
    "supernova", "nova", "photon", "pulsar", // yellow sun/hot graphics
    "thermal", "geyser", "lightning", // warm/fiery elemental
    "ember", // warm organic tones
    "redshift", "comet", "magnetar", // warm cosmic
  ],
  hell: [
    "ocean", "cascade", "whirlpool", "tide", "ripple", // water elemental
    "waterfall", "wave", "seabed", // water 3D worlds
    "plankton", "kelp", "mangrove", "coral", // aquatic/botanical organic
    "snow", "aurora", // cold/winter
    "lotus", "cloud", // serene — wrong vibe
  ],
  heaven: [
    "orb", // wrong vibe
  ],
  cosmos: [
  ],
  ocean: [
    "bonfire", "flame", "inferno", // fire
  ],
  garden: [
    "bonfire", "inferno", // fire
  ],
  temple: [
  ],
};

/** Per-realm must-include shaders — always present in the journey pool */
const REALM_SHADER_MUSTINCLUDE: Record<string, string[]> = {
  winter: ["spiral", "snow"],
  hell: ["lightning", "flame", "magma", "inferno", "vortex"],
};

function pickJourneyShaders(realmId: string, random: () => number = Math.random): string[] {
  const affinityCategories = REALM_SHADER_AFFINITY[realmId] ?? [];
  const allowedGlobals = new Set(REALM_SHADER_ALLOW[realmId] ?? []);
  const globalBlocked = GLOBAL_SHADER_BLOCKLIST.filter(s => !allowedGlobals.has(s));
  const blocklist = new Set([...globalBlocked, ...(REALM_SHADER_BLOCKLIST[realmId] ?? [])]);
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

  // 65% from affinity, 35% from variety — broader palette, more surprise
  const affinityCount = Math.min(30, affinityPool.length);
  const varietyCount = Math.min(20, varietyPool.length);

  const picked = [
    ...mustInclude, // always first
    ...shuffleArray(affinityPool, random).filter(s => !mustInclude.includes(s)).slice(0, affinityCount),
    ...shuffleArray(varietyPool, random).filter(s => !mustInclude.includes(s)).slice(0, varietyCount),
  ];

  // Apply adaptive preferences — gently promotes loved shaders, preserves variation
  return applyShaderPreferences(shuffleArray(picked, random), realmId);
}

/** Pick `count` shaders from pool, avoiding `used` set. Never duplicates. */
function pickShaders(pool: string[], count: number, used: Set<string>, random: () => number = Math.random): string[] {
  const unused = pool.filter((s) => !used.has(s));
  const shuffled = shuffleArray(unused, random);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  for (const s of picked) used.add(s);
  return picked;
}

export function defaultPhases(
  realmId: string,
  overrides: Partial<Record<string, Partial<JourneyPhase>>> = {}
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
        aiPrompt: "dark cosmic void with clusters of crystalline mineral formations emerging from the lower right — raw quartz and obsidian facets catching faint blue and violet bioluminescence from within, thousands of fine luminous particles dispersing upward from the crystal surfaces into infinite black space like spores or stardust, the mineral detail anchored in one third of the frame with the rest vast open darkness and distant stars, macro texture on the crystal surfaces visible at cosmic scale, asymmetric composition with visual weight low and right, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["breathe...", "feel the warmth...", "light is coming..."],
        poetryMood: "dreamy",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — sculptural golden metallic forms and translucent glass-like structures sweeping diagonally from upper left, fibonacci curves visible in the architecture, warm light refracting through prismatic crystal edges casting rainbow caustics against brilliant pale ground, thousands of fine golden particles streaming from the structures trailing into scattered luminous dust and open white space below, surfaces shift between polished metal and organic coral-like growth, infinite depth through layered translucency, ascending and expanding, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["rise...", "the light knows you...", "open..."],
        poetryMood: "transcendent",
      },
      transcendence: {
        aiPrompt: "cosmic nebula at impossible scale with embedded material textures — vast swirling gas and particle fields in deep blue and electric violet pierced by veins of molten gold, within the nebula dense clusters of bioluminescent coral-like organic structures glow from within, millions of particles streaming between the organic nodes and the cosmic gas creating bridges of light, the macro nebula contains micro biological detail visible at every scale, composition fills the frame off-center with the densest structure upper right and particle streams reaching across, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are light...", "there is no boundary...", "this is home..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt: "PALE BACKGROUND — weathered stone and ancient marble architectural fragments arranged along the left edge and lower third of an immense soft white field, the stone surfaces impossibly detailed with veins of gold and embedded crystalline deposits catching warm light, luminous particles rising from the stone like heat shimmer or ascending fireflies, cool blue shadows on the carved surfaces, an infinite cosmic quality to the vast emptiness above, the grounded weight of stone against the weightlessness of light and particles, asymmetric leaving the upper right open and boundless, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see how vast you are...", "every direction is warmth...", "stay in this light..."],
        poetryMood: "transcendent",
      },
      return: {
        aiPrompt: "organic botanical forms — impossible flowers and seed pods with translucent petals — arcing from lower left across a deep indigo cosmos, prismatic light refracting through the petal surfaces in spectrum from blue to violet to rose to warm gold, fine pollen particles and luminous spores dispersing from the botanical structures into generous dark negative space above and right, the organic forms impossibly beautiful and detailed even as they thin and dissolve into pure particle at the edges, composition weighted to the lower half with cosmic darkness and stars opening above, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["gently now...", "the glow remains...", "carry the warmth..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "sparse scattered particles — some crystalline some organic — drifting across vast blue-black cosmos, one small sculptural form in the lower left corner that could be a mineral growth or a seed catching faint violet and gold light, thousands of fine luminous particles trailing diagonally upward from it toward infinite upper darkness like a slow dissolution, the particles carry the memory of every material — stone metal glass petal — as they scatter and thin, enormous open cosmos with stars everywhere above, asymmetric and quiet — almost nothing against everything, no ground no horizon, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP CHARCOAL-BLACK BACKGROUND — cascading ash-fall structure sweeping diagonally from upper left toward lower right, thousands of dark charcoal flakes and fine grey particles in fibonacci descent patterns against deep smoke-black void, the densest ash cluster in the upper third with designed geometric drift-paths trailing into scattered particles and open darkness below, faint ember-orange glow where the freshest ash still carries heat, cool ash-grey shadows defining the fall-pattern against boundless dark, infinite depth through layered translucent smoke-haze, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP EMBER-BLACK BACKGROUND — intricate obsidian glass forms and dark charred lattice arranged along the left edge and lower third of an immense deep charcoal-black void, the blackened structures architectural and beautiful like the skeleton of something that burned — internal geometric facets catching faint amber light at the seams, fine grey ash particles trailing rightward into open dark space, the design clusters asymmetrically leaving the upper right vast and still, quiet aftermath power in the contrast of glowing burnt intricacy against boundless deep darkness, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "dark cosmic void with clusters of translucent seed-pod structures emerging from the lower right — each pod a designed geometric capsule with bioluminescent green-gold veins glowing along fibonacci spiral seams, fine luminous spore particles dispersing upward from the pod surfaces into infinite brown-black space, the organic capsule detail anchored in one third of the frame with vast darkness and faint scattered points above and left, macro cellular texture visible on the pod surfaces at cosmic scale, asymmetric composition with visual weight low and right, no mushrooms no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the spores are waking...", "feel the soil...", "life begins small..."],
        poetryMood: "mystical",
      },
      expansion: {
        aiPrompt: "DEEP BROWN-BLACK BACKGROUND — capillary network architecture sweeping diagonally from upper left, glass-like tubular channels carrying warm gold and phosphorescent green fluid in fibonacci branching patterns, the channel walls translucent revealing internal flow geometry, mineral crystal deposits forming at the branching nodes like geological accretion on organic scaffold, scattered luminous particles streaming from the channel tips into open dark void below, surfaces shift between organic membrane and crystalline mineral growth, infinite depth through layered translucency, no mushrooms no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["it's growing...", "everything connects...", "feel the network..."],
        poetryMood: "mystical",
      },
      transcendence: {
        aiPrompt: "cosmic-scale neural lattice sweeping across infinite brown-black void in a vast branching arc — not biological but abstract: copper and glass filament pathways carrying pulses of electric green and warm gold light between crystalline junction nodes, within the lattice dense clusters of geometric membrane structures glow from within, millions of particles streaming between nodes creating luminous bridges across the void, the macro network contains micro crystalline detail at every magnification, composition fills the frame off-center with densest structure upper right and filament streams reaching across, no mushrooms no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the network...", "all is one organism...", "breathe with the forest..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt: "DEEP SOIL-BLACK BACKGROUND — polished obsidian-like organic surfaces with embedded veins of bioluminescent gold arranged along the left edge and lower third of vast dark void, the surfaces impossibly smooth and mineral yet clearly grown not carved, internal geometric structure visible through translucent areas like stained glass in dark stone, luminous particle dust rising from the surfaces like heat shimmer, cool blue-green shadows on the carved faces, asymmetric leaving the upper right vast and open, quiet power in the contrast of organic mineral intricacy against boundless darkness, no mushrooms no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the garden knows you...", "every leaf is aware...", "this intelligence is ancient..."],
        poetryMood: "mystical",
      },
      return: {
        aiPrompt: "spiral unfurling forms — half mineral half membrane — arcing from lower left across deep brown-black cosmos, prismatic bioluminescence refracting through the translucent surfaces in spectrum from green to gold to warm amber, fine particles dispersing from the forms as they thin and open like geological flowers releasing their crystalline pollen into generous dark negative space above and right, the forms organic yet abstract never literal, composition weighted to the lower half with cosmic darkness opening above, no mushrooms no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the forest settles...", "roots remember...", "return to soil..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "sparse scattered particles — some crystalline some organic membrane fragments — drifting across vast brown-black silence, one small geometric seed-form in the lower left corner catching faint green and gold light with designed internal lattice visible through its translucent shell, thousands of fine luminous particles trailing diagonally upward from it toward infinite upper darkness like a slow dissolution of structure into pure light, enormous open void everywhere above, asymmetric and quiet — almost nothing against everything, no mushrooms no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP OCEAN-BLACK BACKGROUND — designed siphonophore colonial chain sweeping diagonally from upper left toward lower right, the organism impossibly long and architectural with repeating geometric bell-chambers connected by translucent filaments in fibonacci spacing, subtle blue-grey shadows and fine cyan bioluminescent edges defining the chain-structure against deep abyssal darkness, warm amber pulsing from the densest cluster in the upper third trailing into scattered luminous zooids and open dark void below, infinite depth through layered translucency, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["deeper...", "the light changes here...", "pressure becomes peace..."],
        poetryMood: "dreamy",
      },
      transcendence: {
        aiPrompt: "cosmic-scale abyssal thermal vent architecture erupting from the lower-left third of infinite blue-black deep, the chimney structures impossibly designed with mineral-encrusted voronoi walls and fractal bacterial mat textures glowing deep orange and electric cyan from within, superheated shimmer-particles billowing upward from the vent openings into vast dark water above and right, the structure dense and intricate at the vent cluster but dissolving into dispersed mineral particles and open void at both edges, dynamic and alive with convection currents, composition not centered with the vent core lower-left and particle plumes rising across, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the deep sees you...", "you are weightless...", "become the ocean..."],
        poetryMood: "mystical",
      },
      illumination: {
        aiPrompt: "DEEP ABYSSAL-BLACK BACKGROUND — intricate radiolarian glass-skeleton forms and connected diatom lattice arranged along the left edge and lower third of an immense deep ocean-black void, microscopic deep-water organisms rendered at cosmic scale with impossible geometric precision — hexagonal silica chambers, spiraling internal architecture, fine spines radiating outward, dispersed crystal particles trailing rightward into open dark space, faint cyan bioluminescence at the lattice joints, the design clusters asymmetrically leaving the upper right vast and open, quiet power in the contrast of glowing geometric marine intricacy against boundless deep water darkness, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "massive silicon crystal lattice growing from the lower-right corner into deep black void, the crystalline structure photorealistic with embedded veins of raw copper and quartz running through translucent wafer planes, fibonacci-curved growth edges where the lattice dissolves into fine metallic particles drifting upper-left across two thirds generous negative space, warm amber light refracting through the crystal facets casting prismatic cyan and gold caustics into the surrounding darkness, asymmetric composition grounded low-right with cosmic emptiness above, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["connecting...", "signal detected...", "initializing..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      expansion: {
        aiPrompt: "electromagnetic field visualization at cosmic scale sweeping diagonally from upper-left third into deep black infinite space, the field lines rendered as thousands of hair-thin metallic filaments in electric blue and chromium silver curving through toroidal geometry, between the field lines pools of ferrofluid-like liquid metal catching cyan and warm amber reflections in photorealistic detail, fine charged particles spiraling along the field lines dispersing into vast dark void below-right, the metallic fluid forming voronoi cell patterns where field strength is greatest, asymmetric composition weighted upper-left with two thirds open darkness stretching below, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["uploading...", "bandwidth expanding...", "feel the data..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      transcendence: {
        aiPrompt: "fiber-optic galaxy — thousands of luminous glass threads converging into massive obsidian junction nodes that float in infinite black void, each glass fiber photorealistic with internal total-reflection light in electric cyan and deep violet, the junction nodes polished volcanic glass with fractal internal structure visible through translucent surfaces, the network sweeps from upper-right into the frame with the densest node cluster offset right and glass filament bridges arcing across toward lower-left darkness, fine luminous particles shedding from the fiber tips into vast open void on all edges, cosmic scale where each fiber carries a civilization's worth of light, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the network...", "every node is you...", "process everything..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND — circuit-board topography reimagined as geological strata, layered cross-sections of motherboard architecture rendered as sedimentary rock with copper trace fossils and silicon crystal veins exposed in clean photorealistic detail, the strata formations floating in white void arranged asymmetrically in the left third and lower edge, each layer a different geological epoch of machine evolution with warm amber oxidation on the copper traces and cool teal patina on exposed circuit paths, fine metallic particles and silicon dust dispersing rightward into generous white negative space, three-dimensional depth through layered translucent mineral planes, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the machine dreams too...", "silicon and carbon are the same...", "pure logic, pure beauty..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      return: {
        aiPrompt: "dissolving holographic architecture in deep black void — translucent geometric structures like projected blueprints of impossible machines fading and fragmenting, the holograms rendered as thin membrane surfaces in cyan and pale violet with wireframe edges flickering, large membrane fragments peeling away and curling like glass shards drifting from lower-left toward upper-right, fine prismatic particles trailing behind each fragment catching spectrum from cyan through rose to warm amber, the largest holographic form anchored lower-left half-dissolved with generous dark void filling the upper two thirds, photorealistic glass and light-projection textures at cosmic scale, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["disconnecting...", "saving state...", "you carry the data..."],
        poetryMood: "dreamy",
        voice: "echo",
      },
      integration: {
        aiPrompt: "sparse magnetic field remnants in vast black silence — a single dense crystal of synthetic sapphire with internal circuit-like inclusions resting small in the lower-left corner, from it the faintest residual field lines arc outward as gossamer chromium threads dissolving into scattered metallic motes that trail diagonally toward infinite upper darkness, warm amber light trapped inside the crystal casting a tiny halo against the void, enormous open emptiness everywhere above and right, the last engineered artifact returning to raw mineral stillness, asymmetric and quiet — almost nothing against everything, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "obsidian crystal sphere with hairline fracture veins entering from the lower-right corner against deep black void, the sphere photorealistic polished volcanic glass with internal golden light bleeding through a fibonacci spiral of cracks across its surface, each fracture vein filled with faint violet luminescence as if the interior is dissolving outward, fine obsidian shards and glass dust particles dispersing upper-left along the crack trajectories into vast dark negative space, the sphere grounded and dense but already breaking — cosmic scale where the fractures are canyon-sized, asymmetric composition weighted low-right with two thirds generous darkness above and left, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["let go of your name...", "there is nothing to hold...", "be still..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      expansion: {
        aiPrompt: "vast woven metal mesh unraveling into individual filaments across deep black void — the mesh a photorealistic lattice of interlocking platinum and dark iron threads with voronoi cell geometry, the weave intact and dense in the upper-left third but progressively loosening toward lower-right where individual metallic strands curl and separate into open darkness, warm gold light catching the polished thread surfaces where they still interlock while violet shadow fills the gaps between separating strands, fine metallic particles shedding from the fraying edges trailing into generous negative space below, the unraveling rendered at cosmic scale where each thread is a river of metal, asymmetric composition weighted upper-left with the dissolution expanding toward lower-right emptiness, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are dissolving...", "this is not loss...", "let the edges go..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      transcendence: {
        aiPrompt: "vast nebula with embedded mineral forms dissolving into particles across infinite black — enormous translucent agate and amethyst crystal structures caught within swirling silver-violet gas clouds, the minerals crumbling at their edges into fine luminous dust that merges with the nebular vapor, the densest crystal-nebula formation sweeps from upper-right across the frame with dissolving mineral streamers reaching toward lower-left void, warm gold light refracting through the remaining crystal cores while the gas glows faint silver and deep violet, particles of mineral dust and nebular matter indistinguishable as they scatter into vast open darkness on all edges, dynamic and powerful in its dissolution, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["there is no you...", "everything is this...", "..."],
        poetryMood: "transcendent",
        voice: "alloy",
        shaderOpacity: 0.50,
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND — liquid mercury droplets of varying sizes suspended in white void, the largest droplets in the left third showing photorealistic metallic reflection with distorted views of surrounding smaller droplets, some droplets mid-collision and merging with visible surface tension bridges between them, others splitting apart with fine silver filaments stretching and snapping, warm gold light reflected in the curved mercury surfaces with cool violet shadows in the crevices between merging forms, microscopic metallic particles scattered sparsely rightward into generous white negative space, three-dimensional depth through size variation and reflective distortion, the re-condensing of matter after total dissolution, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["something stirs...", "light returns...", "you are being born again..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      return: {
        aiPrompt: "coral-like mineral structure reforming from scattered particles in deep black void — branching calcium and quartz formations growing upward from the lower-left corner with fractal bifurcation patterns, the mineral branches photorealistic with translucent rose and warm gold crystalline surfaces, fine particles streaming inward from the surrounding darkness converging on the growing tips as if matter is remembering its structure, violet bioluminescent veins running through the coral architecture pulsing with gathered energy, the formation occupies the lower-left third with particle trails arcing in from vast dark negative space above and right, asymmetric composition weighted low-left with cosmic emptiness opening above, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["welcome back...", "you are new...", "the void gave you something..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      integration: {
        aiPrompt: "single crystal fragment suspended in vast black silence — a small irregular shard of clear quartz with internal rainbow inclusions resting in the lower-left region, from it a faint particle trail of the finest luminous motes arcs gently upward-right and dissolves into infinite darkness, warm gold light trapped in the crystal core casting the smallest halo, the trail so sparse it is almost imagined — silver and violet dust motes scattered across enormous open void everywhere above, the last remnant of everything that dissolved and reformed now quiet and still, asymmetric and minimal — almost nothing against everything, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
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
    phaseLabels: { threshold: "Candle", expansion: "Awakening", transcendence: "Communion", illumination: "Revelation", return: "Descent", integration: "Silence" },
    phases: defaultPhases("temple", {
      threshold: {
        aiPrompt: "abstract temple interior dissolving into infinite dark atmosphere, three massive weathered stone columns with subtle carved spiral grooves anchored along the lower-right edge of the frame, the columns fading upward into deep amber-black void as if the ceiling is the cosmos itself, warm candlelight glow emanating from between the column bases casting long golden light-shafts diagonally upward-left across the darkness, fine dust motes suspended in the light beams drifting slowly upward, the stone surfaces photorealistic with ancient patina but the space itself impossibly vast and borderless, two thirds of the frame open warm darkness above the columns, asymmetric composition grounded low-right, no specific religion no crosses no symbols no statues no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["enter the temple...", "the stones are listening...", "breathe with the ancients..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "cluster of five platonic solids — tetrahedron icosahedron dodecahedron octahedron cube — rendered as translucent wire-frame structures in warm rose-gold and pale copper floating in deep indigo-black infinite space, each polyhedron a different scale nested and overlapping but not concentric, the largest dodecahedron anchored upper-left with the smallest tetrahedron drifting lower-right, hair-thin luminous threads connecting corresponding vertices between the solids forming a web of geometric relationships across the void, fine amber particles trailing from each vertex along the connecting threads into vast open darkness, photorealistic polished metal wireframes with soft inner glow at impossible cosmic scale, asymmetric composition with the cluster offset upper-left and generous dark space lower-right, no religion no symbols no figures no temples no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the geometry reveals itself...", "every angle is intentional...", "the forms were always here..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "vast cymatics pattern — concentric interference rings like sound made visible — expanding from a point in the lower-left third of deep maroon-black void, the standing wave pattern rendered as thousands of luminous particles frozen in a complex nodal geometry with bright nodes where waves constructively interfere glowing white-hot and dark valleys between, the pattern not circular but distorted by harmonic overtones creating petal-like lobes and asymmetric ripple fronts, warm gold and deep rose light concentrated at the densest interference nodes with violet-blue undertones in the wave troughs, fine particle spray dispersing from the outermost wavefronts rightward and upward into infinite dark atmosphere, photorealistic crystalline detail as if photographing sound at cosmic scale, asymmetric composition with the source point low-left and the pattern blooming toward upper-right, no religion no symbols no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the vibration...", "sound becomes form...", "every frequency is prayer..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "immense toroidal energy field hovering in deep violet-black infinite space, the torus rendered as thousands of flowing luminous filament-lines tracing the magnetic field topology from the center axis outward and looping back through, the filaments dense and brilliant white-gold where they pass through the central axis and cooling to deep blue and soft violet as they arc outward to the torus edges, the entire structure tilted and entering from the upper-right edge of the frame at three-quarter angle revealing its hollow core, scattered photon-like particles orbiting the torus in spiraling paths throwing off faint amber trails into the surrounding void, photorealistic plasma and light textures at galactic scale where the torus could be a cosmic electromagnetic phenomenon, two thirds dark void below and left, asymmetric composition with the torus cropped by the upper-right corner, no religion no symbols no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the field holds everything...", "this order is love...", "you are inside the geometry..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      return: {
        aiPrompt: "thin luminous orbital paths — elliptical arcs of different eccentricities and tilts — intersecting and overlapping across deep blue-black cosmic void like celestial mechanics made visible, seven or eight distinct orbital lines rendered in fading warm gold and cool silver with bright nodes at their periapsis points, the orbital centers offset from each other creating a complex asymmetric web of gravitational geometry anchored in the right third of the frame, finest stardust particles scattered along the orbital planes catching faint light, the paths themselves hair-thin but photorealistic with lens-flare at the brightest nodes, vast open dark cosmos filling the left two thirds with only the most distant orbital arcs reaching into it, asymmetric composition weighted right with generous cosmic silence left, no planets no earth no religion no symbols no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the temple settles...", "gravity remembers...", "carry the orbits gently..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      integration: {
        aiPrompt: "single dimensionless point of warm golden-white light suspended in the lower-left region of absolute black infinite void, from the point a barely visible halo of the faintest concentric ripples expanding outward like the memory of all geometry returning to its origin, the ripples so subtle they are almost imagined — gossamer rings of amber and rose fading to nothing within a short radius, the rest of the frame vast empty silent darkness with only microscopic luminous motes scattered sparsely across the void like the last breath of form dissolving into formlessness, photorealistic light physics on the central point with subtle lens characteristics, asymmetric composition with the point small and anchored lower-left and nearly the entire frame open darkness, no religion no symbols no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the temple is always here...", "silence is the deepest geometry..."],
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
        aiPrompt: "crystalline ice structures catching starlight in deep void — massive hexagonal ice formations with photorealistic frost-crystal surfaces anchored in the upper-left third of absolute black space, each crystal facet refracting faint blue and silver starlight from within with prismatic internal fractures following fibonacci geometry, fine ice particles and frozen vapor dispersing downward-right along gentle curved paths into vast empty black two thirds of the frame, connected by gossamer frost-bridges between the largest formations, cosmic scale where each crystal is a frozen moon, asymmetric composition with visual weight high and left, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look up...", "the stars are ancient light...", "you are moving without moving..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "DEEP COSMIC-BLACK BACKGROUND — nebula gas formations with embedded metallic mineral clusters sweeping diagonally from upper left toward lower right, within the luminous violet and cyan vapor float photorealistic chunks of raw iron and nickel meteorite with crystalline olivine inclusions catching warm gold light, the minerals tumbling slowly through sculptural gas with fibonacci spiral arms, connected by dark metallic filaments threading between the densest mineral nodes, fine particles of both nebular gas and metallic dust dispersing into open dark void below, the upper third dense with mineral-embedded gas detail trailing into scattered luminous particles, infinite cosmic depth through layered translucency of gas around solid forms, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["stars are being born...", "creation is happening now...", "feel the scale..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "supernova shockwave as glass-like pressure architecture sweeping across infinite black — the expanding wavefront rendered as massive curved panels of transparent blast-glass with visible stress fractures and compression ridges in photorealistic detail, white-hot gold light erupting through the fracture networks while electric cyan refracts through the intact glass planes, behind the wavefront trails of shattered glass-shard particles dispersing into void, the architecture dense and intricate where it crosses the upper-right frame but dissolving into prismatic splinter trails at both edges, designed pressure-bridges connecting the largest glass panels across the expansion front, composition offset with the blast core upper-right and glass streamers reaching across, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["witness the supernova...", "death is creation...", "you are stardust remembering..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "DEEP COSMIC-BLACK BACKGROUND — dark matter web visible as gossamer organic membrane stretched between bioluminescent nodes in deep indigo-black void, the membrane photorealistic translucent tissue with visible cellular structure and fibonacci-curved tension lines, each node a warm gold sphere pulsing with accumulated light, the web arranged asymmetrically along the left edge and lower third with the largest membrane spans catching faint prismatic reflections, fine particles of luminous matter condensing along the membrane surfaces and dripping from the lowest points into vast dark space, the design clusters leaving the upper right open and boundless, quiet power in the contrast of living gossamer architecture against infinite deep darkness, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["everything came from this...", "your atoms were forged in stars...", "cosmic recycling..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      return: {
        aiPrompt: "cooling metallic slag sculptures with prismatic surface drifting from lower left across deep indigo cosmos — irregular masses of dark iron and bronze with iridescent oxidation films catching spectrum from cyan to violet to warm gold across their curved surfaces, the slag forms photorealistic with bubble-pocked textures and crystalline mineral deposits forming in the cooling crevices, fine metallic particles and prismatic flakes shedding from the sculpture surfaces as they cool and drift apart into generous dark negative space above and right, the forms sculptural and beautiful even as they thin toward dissolution, composition weighted to the lower half with cosmic darkness opening infinitely above, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the universe settles...", "new light from old death...", "drift now..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "single small dense cosmic seed with internal crystal structure resting in the lower-left corner of vast blue-black cosmos — a dark metallic sphere no larger than a fist at cosmic scale with photorealistic surface of compressed stardust and tiny visible crystal facets of olivine and diamond catching faint cyan and warm gold light from within, from the seed a single gossamer particle trail extends diagonally upward-right dissolving into infinite darkness, the internal crystal lattice faintly visible through translucent patches in the shell like a universe compressed to a point, enormous open cosmos with scattered stars everywhere above, asymmetric and quiet — almost nothing against everything, no planets no earth no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "recursive impossible stone architecture floating in deep black void — massive weathered granite blocks stacked in Escher-like geometry where staircases fold back into themselves and vertical becomes horizontal, the structure anchored in the lower-right third of the frame with emerald light leaking through gaps between the paradoxical stone layers, fine mineral dust dispersing upward-left from eroding edges into vast dark negative space filling two-thirds of the frame, photorealistic ancient stone texture at cosmic scale where each block spans light-years, fibonacci proportions in the stacking rhythm, asymmetric composition weighted low-right with generous void upper-left, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["enter...", "every direction is the same...", "the walls are listening..."],
        poetryMood: "hypnotic",
      },
      expansion: {
        aiPrompt: "vast moire interference pattern at cosmic scale formed by two overlapping translucent glass lattice planes rotating slowly through each other in deep charcoal-black void, the planes entering from the left third at different angles creating shimmering emerald and cyan interference fringes where they intersect, the lattice edges dissolving into fine glass-shard particles that stream rightward into generous dark negative space, each plane photorealistic blown glass with voronoi cell structure visible at macro scale, the moire zones pulsing with trapped light between the layers, asymmetric composition with the overlapping planes offset left trailing scattered luminous particles into open darkness right, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are lost...", "this is where you belong...", "deeper..."],
        poetryMood: "hypnotic",
      },
      transcendence: {
        aiPrompt: "Penrose tiling rendered as three-dimensional crystalline landscape suspended in deep indigo-black cosmos — impossible aperiodic geometry of interlocking rhombus forms in obsidian and dark emerald glass extending from the upper-right corner downward in a cascading shelf, each tile a different depth and translucency with faint golden light trapped in the non-repeating pattern, fine crystalline particles breaking free from the tiling edge and drifting into vast open void filling the lower-left two-thirds, photorealistic mineral and glass surfaces at nebula scale where each tile spans galaxies, asymmetric composition with the tiling cropped upper-right cascading toward center, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the labyrinth...", "there is no exit because there is no inside...", "the center is everywhere..."],
        poetryMood: "mystical",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND — nested material shells floating in clean white void, the outermost shell rough black obsidian cracked open to reveal a second shell of translucent smoky glass which encases a third shell of polished rose-gold metal which holds at its core a sphere of pure warm light, the nested forms anchored in the left third of the frame with obsidian fragments dispersing rightward as dark particles against the white space, fine golden threads connecting the separated shell layers like memory of their enclosure, photorealistic mineral and metal textures at impossible scale, generous white negative space filling two-thirds of the frame, asymmetric composition weighted left with luminous core slightly off-center, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the pattern reveals itself...", "you were never lost...", "the maze is the map of your mind..."],
        poetryMood: "mystical",
      },
      return: {
        aiPrompt: "topological surface — a massive polished chrome Klein bottle form twisting through itself in deep blue-black void, the impossible surface reflecting faint emerald and violet light from unseen sources, the metal skin beginning to dissolve at its edges into fine mercurial droplets that trail downward-left into vast dark negative space, the form anchored in the right third of the frame with its self-intersecting geometry creating paradoxical interior-exterior surfaces, photorealistic liquid metal texture at cosmic scale, scattered chrome particles carrying distorted reflections as they disperse, generous dark void filling the left two-thirds, asymmetric composition weighted right with the dissolving edge bleeding toward center, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the walls are thinning...", "you chose a direction and it is right...", "the path appears..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "single geometric trefoil knot form in dark weathered bronze floating small in the lower-left region of absolute black infinite void, the knot impossibly smooth where it passes through itself with faint emerald light caught in the crossings, a gossamer trail of bronze particles curving away from the knot upward-right in a fibonacci spiral dissolving into vast cosmic darkness, the form quiet and self-contained — a path with no beginning and no end condensed into one small object, photorealistic patinated metal texture against infinite dark, nearly the entire frame generous empty void with scattered luminous motes, asymmetric composition with the knot small and anchored lower-left, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "geological strata cross-section floating in deep black void — layered sedimentary bands of slate and basalt split apart to reveal embedded veins of raw amethyst crystal and seams of iron pyrite catching faint ice-blue light from within, the formation anchored in the lower-right third of the frame with each stratum a different geological epoch rendered in photorealistic mineral texture, fine stone particles and crystal dust dispersing upward-left along steep diagonal paths into vast dark negative space filling two-thirds of the frame, connected quartz filaments bridging the gaps between separated layers, asymmetric composition with visual weight low and right, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look up...", "the summit is a rumor...", "begin..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "DEEP MIDNIGHT-BLACK BACKGROUND — granite pressure-architecture sweeping diagonally from lower-left toward upper-right, massive interlocking stone blocks compressed into impossible configurations with internal fracture geometry glowing faint blue-white at the stress lines, voronoi crack patterns spreading across the photorealistic rock faces where the pressure is greatest, fine pulverized stone dust and quartz shards dispersing upward from the fracture zones into vast dark alpine void above, the densest compression in the lower third with fibonacci-proportioned block stacking, connected stress-filaments of luminous blue threading between the pressure points, asymmetric composition ascending steeply with generous darkness above, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["higher...", "the air thins and thoughts clarify...", "don't look down..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "atmospheric pressure gradient rendered as translucent membrane layers stacked vertically across infinite black void — dozens of gossamer-thin curved planes of different densities from thick clouded glass at the bottom to nearly invisible film at the top, each membrane a different hue shifting from deep indigo through ice-blue to electric white-gold at the highest layers, the membranes entering from the upper-right third and curving across the frame with light refracting between them creating prismatic halos at the layer boundaries, fine condensation particles streaming upward between the membrane gaps into vast open darkness above, photorealistic glass and atmospheric textures at cosmic scale, composition not centered with the densest layers upper-right and translucent streamers reaching across, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are above everything...", "the summit is a feeling not a place...", "breathe the infinite..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND — wind-carved obsidian sculptures with prismatic interior cavities floating in vast bright white void, three or four aerodynamic forms shaped by invisible force anchored in the left third of the frame, each sculpture polished smooth on the windward side but rough fractured on the lee revealing internal crystal chambers refracting rainbow caustics into the surrounding white space, fine dark obsidian particles and prismatic light-motes dispersing rightward into generous pure white negative space filling two-thirds of the frame, connected glass-thread filaments trailing between the sculptures, photorealistic volcanic glass texture with three-dimensional depth and color at impossible scale, asymmetric composition weighted left with boundless white above and right, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see how far you've come...", "the view is the reward...", "everything is below you..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      return: {
        aiPrompt: "erosion architecture — mineral forms being shaped by invisible force in deep warm indigo void, sandstone and limestone surfaces carved into impossible organic curves with photorealistic wind-worn texture revealing layered geological color from ice-blue to violet to rose to warm amber in the exposed strata, the eroding forms arcing gently from upper-right toward lower-left with fine sand particles streaming downward in curved descent paths into generous dark negative space below and left, connected threads of dissolved calcium trailing between the separating erosion-forms, composition weighted to the upper half with cosmic warmth opening below, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["descend gently...", "the mountain stays...", "carry the height..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "single small dense stone with a polished obsidian surface floating in the lower-left region of vast warm blue-black void, the stone impossibly smooth on one face revealing a cosmic panorama reflected in its dark mirror — galaxies and nebulae visible in the polished surface as if it contains the entire view from the summit, a gossamer trail of fine warm amber and ice-blue particles curving away from the stone upward-right in a fibonacci arc and dissolving into infinite darkness, the rest of the frame enormous open cosmos with scattered motes, asymmetric and quiet — the entire mountain compressed into one quiet mineral memory, photorealistic polished volcanic glass texture at impossible scale, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, single sand grain crystal magnified to cosmic scale anchored in the lower-left third of deep black-indigo void — the grain revealed as a translucent quartz polyhedron with internal fracture geometry glowing warm amber and copper at the stress lines, fibonacci-spiral growth rings visible through the photorealistic mineral surface, fine silicate particles and bleached bone-white dust dispersing diagonally upward-right from micro-fractures into vast generous negative space filling two-thirds of the frame, the impossible inner world of a single grain rendered at galactic scale, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["step into the light...", "leave everything behind...", "the desert has no mercy and no malice..."],
        poetryMood: "mystical",
        voice: "nova",
      },
      expansion: {
        aiPrompt: "DEEP WARM DARK VOID BACKGROUND, heat-shimmer rendered as geometric wavefront architecture — stacked translucent membrane planes of warm amber and rose-gold refracting light at slightly different angles creating rippling interference patterns, the wavefronts entering from the right third of the frame at shallow angles like visible thermal distortion solidified into glass, fine particles of vaporized silica dispersing leftward along horizontal shimmer-paths into vast deep warm dark negative space filling two-thirds of the frame, photorealistic heat-distortion textures at impossible atmospheric scale, the architecture of mirages made tangible, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the horizon retreats...", "emptiness is freedom...", "the sand knows your footsteps..."],
        poetryMood: "mystical",
        voice: "nova",
      },
      transcendence: {
        aiPrompt: "PURE WHITE BACKGROUND — salt crystal lattice dissolving into pure light, a cluster of translucent halite crystals with perfect cubic geometry in the upper-right third of vast bright white void, each crystal face photorealistic with internal inclusions of trapped amber brine and microscopic air bubbles refracting warm gold, the crystal edges dissolving into fine white mineral particles that drift downward-left along gentle paths into generous pure white negative space filling two-thirds of the frame, connected gossamer threads of crystalline residue trailing between the separating cubes, the geometry of evaporation at cosmic scale where each salt crystal spans galaxies, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the desert...", "emptiness is fullness...", "the light is everything..."],
        poetryMood: "transcendent",
        voice: "nova",
      },
      illumination: {
        aiPrompt: "DEEP WARM DARK VOID BACKGROUND, erosion-sculpted bone-like mineral forms in deep warm void — three or four weathered calcium-white structures with photorealistic wind-carved surfaces revealing internal honeycomb geometry and warm amber marrow-light glowing through the porous lattice, the forms anchored along the left edge and lower third at different scales, fine calcium dust and warm ochre particles dispersing rightward into vast deep warm dark negative space filling three-quarters of the frame, connected filaments of mineral residue threading between the eroded forms like desert-varnish traces, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the stars emerge...", "the desert and the sky are the same infinity...", "silence speaks..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, mirage as layered refractive glass planes at different depths — five or six translucent amber and rose-gold sheets of impossibly thin glass floating at slightly different angles in the upper-left quadrant, each plane warping the view through it creating stacked distortion like heat rising from baked earth, the planes photorealistic blown glass with subtle imperfections and warm internal light, fine glass-dust particles and prismatic refractions dispersing diagonally toward lower-right into deep indigo-black negative space, connected threads of warm light bending between the refractive layers, generous dark void surrounding the form, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the crossing nears its end...", "you survived the emptiness...", "the desert marked you..."],
        poetryMood: "flowing",
        voice: "nova",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single polished fulgurite form — desert lightning glass — anchored small in the lower-right corner of vast deep indigo-black void, the fulgurite a tubular branching structure of fused sand in translucent amber-green glass with photorealistic surface texture showing the frozen moment of lightning striking earth, warm copper light trapped inside the hollow glass channels, a single thin thread of fine silica particles curving away toward the upper-left following a fibonacci spiral path and dissolving into darkness, vast void fills most of the frame as generous negative space, the memory of infinite heat and emptiness frozen into one quiet glass fossil, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, a brass and blackened-steel optical lens assembly floating in the upper-right third of deep sepia-black void, stacked concentric rings with photorealistic machined-metal texture and hairline fibonacci engravings, a narrow beam of warm ivory light refracting through the central aperture and dispersing into a fan of fine amber particles trailing diagonally downward-left, the particles dissolving into vast open darkness filling two-thirds of the frame, connected filaments of tarnished copper threading between the outermost rings like spokes of a sextant, asymmetric composition with generous negative space, cosmic scale as if peering through an instrument the size of a galaxy, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["open the first page...", "the library has been waiting...", "every book knows your name..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "DEEP DARK INDIGO-BLACK BACKGROUND, recursive crystalline data-structure at cosmic scale anchored in the left third of the frame, translucent quartz columns branching in voronoi patterns with embedded veins of raw amethyst and iron pyrite visible through photorealistic mineral surfaces, faint warm light refracting inside the deepest crystal chambers, fine silicate particles dispersing rightward along fibonacci spiral paths into vast deep indigo-black negative space filling two-thirds of the frame, connected lattice bridges of thin obsidian filaments spanning between crystal clusters, asymmetric composition entering from the left edge, the geometry of accumulated knowledge rendered as geological formation, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the library unfolds...", "every thought ever thought is here...", "read deeper..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "DARK BACKGROUND, vast impossible library-like lattice of smoke-black glass and polished obsidian shelving units receding in recursive depth from the center-right across two-thirds of the frame, each shelf-cell contains smaller versions of itself at fractal scale with faint warm amber light glowing from the deepest recesses, photorealistic blown-glass surfaces with internal air-bubble imperfections catching light, fine particles of powdered graphite and gold leaf dispersing leftward into open black void in the left third, connected threads of dark copper wire spanning between shelf-structures like catalogue filaments, the architecture of infinite indexing at cosmic scale, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the text...", "reading and being read are the same...", "infinite knowledge, infinite peace..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND, two mirrored metallic forms facing each other across a narrow vertical gap in the lower-left third of vast bright white void, the left form rendered in polished dark bronze and the right in pale silver-nickel, both with photorealistic hammered-metal surface texture and internal voronoi cavity structure, a thin prismatic light spectrum refracting between them where they almost touch, fine particles of iridescent metal dust dispersing upward-right along curving paths into generous pure white negative space filling three-quarters of the frame, connected gossamer threads of platinum bridging the gap between the two forms, the moment of self-recognition rendered as material dialogue at cosmic scale, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you found your book...", "the text is you...", "the library is your mind..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, dissolving calligraphic sculpture of dark wrought iron and aged bronze arcing from the upper-left corner downward toward center of deep sepia-black void, the metal forms curving in gestural strokes with photorealistic forge-scale texture and geometric internal lattice visible where the surface has eroded away, fine rust-colored and ivory particles detaching and settling downward along vertical drift paths into vast brown-black negative space filling the lower two-thirds, connected remnant threads of oxidized copper trailing behind the dissolving forms like fading ink, asymmetric composition with the structure releasing its geometry back into emptiness, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["close the book...", "the words stay with you...", "the silence after reading..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single dense encoded crystal of smoky topaz and dark amber anchored in the lower-right corner of vast deep brown-black void, the crystal faceted with precise geometric cuts revealing photorealistic internal lattice structure where faint golden light pulses at the core like trapped knowledge, one thin filament of gold-leaf particles extending upward-left along a fibonacci curve and dissolving into darkness, nearly the entire frame is open empty negative space, the surface etched with microscopic voronoi patterns visible at impossible magnification, all memory compressed into one quiet mineral form, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP STORM-DARK CHARCOAL-BLACK BACKGROUND, branching fractal lightning structure entering from the lower-left corner and arcing diagonally toward upper-right, each branch a designed fibonacci-bifurcating filament of electric blue-white energy with silver edges, the main trunk dense with sub-branches that thin into hair-fine threads, cool green-grey particles scattering outward from each branch tip into vast deep storm-dark negative space filling two-thirds of the frame, photorealistic electrical discharge at cosmic scale where the lightning could be a galaxy-spanning nervous system, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP STORM-DARK CHARCOAL-BLACK BACKGROUND, sparse ring of faint grey-violet and cool green-grey filaments forming a distant broken circle in the upper-left third of the frame, the ring structure architectural with designed gaps and fine electric blue points at the remaining nodes, the vast center and lower-right of the frame completely open deep charcoal-black negative space, a single warm amber point glowing at the geometric center of the broken ring, fine charged particles drifting inward along gentle curved paths, photorealistic ozone-washed atmosphere at infinite scale, the perfect calm at the eye of all force, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "PURE WHITE BACKGROUND — three-dimensional fractal ice architecture sweeping diagonally from upper left toward lower right against brilliant white void, the structure has real depth and volume with ice-blue shadows cast behind translucent crystalline forms, connected branches made of dispersed powder particles in fibonacci spirals with deep cobalt blue and electric violet glowing at the fractal joints and fissures, the densest sculptural detail in the upper third trailing into scattered particles and open white below, layered translucency creating genuine depth where rear structures show through front ones in different focus planes, cool steel-blue and deep indigo color concentrated in the thickest ice sections fading to pale silver at the thinnest edges, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "vast field of crystalline micro-structures suspended in deep blue-black void like frozen starlight, thousands of tiny interconnected ice forms at different depths creating a sense of infinite three-dimensional space, the densest cluster anchored along the left edge and lower third with the finest particles scattered rightward into open cosmic darkness, each micro-crystal catching pale silver and ice-blue light at different angles revealing internal geometric facets, faint aurora-like veils of cold green and violet light threading between the crystal clusters, the silence of absolute zero rendered as still architecture at galactic scale, asymmetric composition leaving the upper right vast and open, no trees no roots, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "massive seed pod splitting open in the lower-right third of deep brown-black void, the pod designed with intricate geometric chambers visible through the widening fracture — internal honeycomb nursery cells glowing luminous spring green from within, the outer shell rendered in photorealistic dark bark-like texture cracked along fibonacci spiral lines, bright chartreuse light spilling from the fracture into the surrounding darkness, fine spores and seed particles ejecting from the opening along diagonal paths upward-left into vast dark space, the pod architecture impossibly detailed with spiraling internal corridors and nested growth-chambers like a designed incubator at cosmic scale, two thirds of the frame open dark void above and left, asymmetric composition with the pod anchored low-right, no landscape no ground no soil no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["wait for it...", "feel the thaw beginning...", "something stirs beneath..."],
        poetryMood: "melancholic",
        voice: "nova",
      },
      expansion: {
        aiPrompt: "enormous fiddlehead fern spiral unfurling from a tight coil in the upper-left corner of deep verdant black-green void, the frond rendered with photorealistic detail — hundreds of tiny curled pinnae along the main rachis each at a different stage of unfurling from tight scroll to open fan, the spiral structure following a perfect golden ratio with luminous spring green at the newest growth and deeper emerald at the mature sections, delicate translucent hairs along the stem catching warm gold backlight, fine pollen-like particles of pale rose and chartreuse dispersing from the unfurling tips rightward and downward into the vast dark void filling the right two thirds of the frame, the frond architecture impossibly detailed as if viewing a fern the size of a galaxy, asymmetric composition with the coil anchored upper-left and the unfurling reaching toward center, no landscape no ground no soil no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["it's happening...", "the green is unstoppable...", "everything at once..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      transcendence: {
        aiPrompt: "vast cross-section of a plant stem rendered at impossible microscopic scale against deep black-green void — the vascular bundles visible as dozens of luminous circular xylem vessels and phloem tubes arranged in a designed ring pattern, each vessel a different size with photorealistic cell-wall detail and internal green-gold bioluminescent fluid flowing through them, the vascular ring sweeping diagonally from the lower-left third toward upper-right with the largest vessels closest and the smallest receding into depth, between the vessels a matrix of parenchyma cells glowing soft rose-pink and warm gold, fine particles of luminous sap streaming from severed vessel-ends into the surrounding darkness like green-gold blood, the living architecture of a plant's circulatory system at cosmic scale where each vessel could be a tunnel through a galaxy, asymmetric composition with the cross-section offset lower-left and generous dark void upper-right, no landscape no ground no soil no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["this is what was waiting...", "every cell remembers this...", "the bloom is you..."],
        poetryMood: "transcendent",
        voice: "nova",
      },
      illumination: {
        aiPrompt: "single immense pollen grain floating in deep black-green infinite space, the grain rendered as a designed sphere with impossibly detailed surface architecture — geometric spines and ridges and apertures arranged in precise mathematical patterns across its surface, each spine tipped with a luminous droplet of warm gold, the surface texture photorealistic with sculpted echinate ornamentation in spring green and rose-pink and pale amber, the grain anchored in the right third of the frame at a slight tilt revealing its three-dimensional surface complexity, fine particles of pollen dust shedding from the spines and drifting leftward into vast dark void filling two thirds of the frame, warm bioluminescent glow from the aperture openings where the grain's interior is visible — nested chambers of golden light, atmospheric scale where this single pollen grain is the size of a planet, asymmetric composition weighted right with generous dark space left, no landscape no ground no soil no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the garden is complete...", "everything is alive...", "rest here in the green..."],
        poetryMood: "flowing",
        voice: "nova",
      },
      return: {
        aiPrompt: "cluster of seed-parachute structures — dandelion-clock-like forms — drifting apart across deep brown-black void, each parachute a designed radial structure of impossibly fine silver-white filaments radiating from a central seed in a perfect sphere, seven or eight parachutes at different distances and scales scattered across the right half of the frame, the nearest one large and detailed showing individual filament barbs catching faint spring green and warm gold light, the farthest ones tiny luminous points dissolving into the darkness, fine individual filaments detaching and floating free as the structures slowly disintegrate, photorealistic silk-thread texture on each filament, the left half of the frame vast quiet dark void with only scattered drifting filament-motes, the beautiful dispersal of everything the bloom created, asymmetric composition weighted right with generous darkness left, no landscape no ground no soil no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the day was full...", "the garden sleeps...", "carry the pollen with you..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      integration: {
        aiPrompt: "single thin plant stem with one closed bud at its tip rising from the lower-left corner of absolute black void, the stem rendered in muted olive-green with photorealistic cellular texture, the bud a small tight spiral of pale green and faint rose holding everything the bloom was inside its folded layers, a single dewdrop of luminous warm gold light clinging to the bud tip refracting the faintest prismatic spectrum, one gossamer spider-silk thread extending from the bud diagonally upward-right and dissolving into nothing, nearly the entire frame vast dark silence with only this single living form and its single drop of light, the quiet promise that what bloomed will bloom again at infinite scale, asymmetric composition with the stem small and anchored lower-left, no landscape no ground no soil no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, solar corona structure at cosmic scale anchored in the upper-left third of deep warm black void, concentric rings of photorealistic liquid-metal plasma in molten gold and deep orange with radial tendrils of brushed titanium extending outward, the corona surface textured with magnetic-field line engravings and fibonacci-spiral filaments, fine particles of superheated copper dust dispersing diagonally downward-right along sweeping arcs into vast open darkness filling two-thirds of the frame, connected bridges of white-hot plasma threading between the outermost tendrils, the first heat of the longest day rendered as stellar architecture igniting, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the sun is already here...", "feel the warmth building...", "this is the longest day..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      expansion: {
        aiPrompt: "DEEP WARM AMBER-BLACK VOID BACKGROUND, thermal convection architecture rendered as vast honeycomb cells of blown amber glass radiating from the lower-right corner, each hexagonal cell wall built from photorealistic heat-warped borosilicate glass with internal bubble imperfections refracting deep gold and burnt sienna light, the cell membranes thinning at their centers to translucent sheets of molten amber, fine particles of vaporized copper dispersing upward-left along rising thermal-column paths into enormous open deep amber-dark space filling the upper two-thirds of the frame, connected filaments of dark bronze threading between cell junctions in voronoi patterns, impossible atmospheric scale like viewing convection currents from within, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the heat carries you...", "let the light fill everything...", "time is slow and golden..."],
        poetryMood: "dreamy",
        voice: "alloy",
      },
      transcendence: {
        aiPrompt: "DARK BACKGROUND, electromagnetic storm collision anchored in the center-right of deep black void, a dense gold-and-copper lattice of geometric heat-architecture interpenetrated by jagged electric-discharge veins of cobalt blue and white phosphor, the two systems fused at impact points where photorealistic fractured quartz nodes glow white-hot, particle trails of burnt orange sparks streaming diagonally upward-left and electric blue shards dispersing downward-right into open darkness at the frame corners, connected fractal branches of lightning-fork geometry threading through molten voronoi cells, the tension of maximum energy rendered as designed interference pattern at cosmic scale, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the storm is coming...", "heat and lightning...", "the fullest moment of the year..."],
        poetryMood: "intense",
        voice: "alloy",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND, a molten amber glass sculpture with internal fibonacci-spiral structure floating in the lower-left third of vast bright white void, the form shaped like an impossible seed-pod with photorealistic hand-blown glass texture in deep honey and warm apricot tones, internal golden veins following logarithmic curves visible through translucent amber walls, fine particles of warm gold dust dispersing upward-right along gentle curving paths into generous pure white negative space filling two-thirds of the frame, connected gossamer threads of pale copper trailing from the sculpture edges, the golden hour captured as a single radiant mineral form at cosmic scale, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the storm passed...", "golden hour...", "the longest light of the year..."],
        poetryMood: "transcendent",
        voice: "alloy",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, oxidized copper and verdigris mineral forms clustered in the upper-right corner of deep indigo-black void, the forms built from photorealistic weathered bronze plates with blue-green patina spreading across their surfaces and fading warm amber still glowing in the cracks between corroded layers, fine particles of teal verdigris dust and soft amber embers detaching and drifting diagonally downward-left in slow curved paths, the lower-left three-quarters of the frame is vast cool dark space with deep blue-indigo undertones, connected remnant threads of darkening copper trailing between the cooling forms, the geometry of heat surrendering to night rendered as metal oxidizing in real time at cosmic scale, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the night is warm...", "fireflies are speaking...", "the longest day ends gently..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single warm ember-crystal of faceted citrine and dark amber resting near the lower-right corner of enormous warm black void, the crystal small and dense with photorealistic gemstone surface catching fading internal heat-light at its core, a faint shimmer-haze of dispersing warmth particles radiating outward from the crystal in concentric rings that dissolve into darkness, one thin thread of gold-leaf particles extending upward-left along a fibonacci spiral and vanishing, nearly the entire frame is vast deep warm negative space with only this quiet remnant and its fading heat memory, the longest day compressed into one glowing mineral form at impossible scale, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "dense cluster of thin branching capillary-like filaments in deep green and muted olive anchored in the lower-right third of deep umber-black void, the filaments designed with fractal branching — each major vein splitting into finer and finer tributaries like a circulatory system, the very tips of the outermost branches just beginning to flush warm amber at their extremities while the core remains green, fine particles of the first golden pigment detaching from the branch-tips and drifting leftward along diagonal paths into vast open darkness filling two thirds of the frame, photorealistic texture like oxidized copper wire at cosmic scale, asymmetric composition with visual weight low and right, no leaves no trees no landscape no honeycomb no hexagons no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the change begins...", "feel the first cool...", "something is ending beautifully..."],
        poetryMood: "melancholic",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "sweeping diagonal cascade of thousands of individual color-particles in deep crimson and burnt sienna and bright amber falling from the upper-left corner toward lower-right across deep brown-black infinite space, each particle a tiny irregular shard with photorealistic cracked-pigment texture — no two the same size or shape, the cascade dense and vivid where it enters the frame but spreading and scattering as it falls with increasing gaps between particles, the particles tumbling and rotating catching warm side-light that reveals copper and gold facets, the lower-right third of the frame open dark void with only the most distant scattered particles reaching into it, the ecstasy of color released into freefall at atmospheric scale, asymmetric composition with the cascade sweeping corner to corner, no leaves no trees no landscape no honeycomb no hexagons no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look at what it becomes...", "the dying is the beauty...", "every leaf is a flame..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "massive spiraling smoke-column of warm pigment dust rising from the lower-left edge of the frame and curving rightward through deep charcoal-black void, the smoke rendered as billions of microscopic color particles — deep crimson at the dense base transitioning through amber and gold to pale sienna at the dispersing top, the spiral has internal turbulence with darker eddies and brighter vortices creating designed structure within the chaos, photorealistic volumetric smoke texture with subsurface light scattering turning the thinnest wisps translucent and glowing, the upper-right two thirds of the frame open dark atmosphere with only the finest color-dust reaching into it, the release rendered as a vast atmospheric event at cosmic scale, asymmetric composition with the spiral anchored low-left and blooming toward upper-right, no leaves no trees no landscape no honeycomb no hexagons no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["this is the peak...", "everything releasing at once...", "let go with the leaves..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "bare skeletal tree-like branching structure in pale silver-grey and cool bone-white against deep grey-black void, the branches stripped of all color revealing their underlying architecture — thin forking limbs with photorealistic weathered-driftwood texture, the branching pattern mathematically precise like a Lindenmayer system frozen in space, the structure anchored along the right edge with branches reaching leftward into generous dark emptiness, at every fork-joint the faintest trace of residual warm copper like the last memory of pigment, fine particles of pale ash drifting downward from the branch-tips in slow vertical paths, two thirds of the frame open darkness with only scattered silver dust, the elegant geometry of what remains after everything beautiful has been released, asymmetric composition weighted right with vast void left, no leaves no trees no landscape no honeycomb no hexagons no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see the structure...", "what remains is essential...", "the beauty of less..."],
        poetryMood: "melancholic",
        voice: "fable",
      },
      return: {
        aiPrompt: "thin layer of settled color-sediment along the bottom edge of an enormous deep brown-black void, the sediment a compressed stratum of all the autumn tones — crimson and amber and sienna and copper pressed into a narrow horizontal band with photorealistic geological-layer texture, from this settled layer a few last fine particles of warm gold still rising in slow upward drift-paths like the final exhalation, the vast majority of the frame is quiet open darkness above with deep grey-brown atmospheric undertones, a single thin crack of amber light visible within the sediment layer where warmth still persists, the visual silence of completion at infinite scale, asymmetric composition with the sediment anchored at the very bottom and nearly the entire frame open void above, no leaves no trees no landscape no honeycomb no hexagons no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the earth is resting...", "rain completes it...", "nothing is lost, only changed..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "single sharp crystalline frost-form growing over a small dark remnant of warm copper in the upper-right corner of absolute black void, the frost rendered as precise geometric ice-needles radiating outward from the warm remnant in a starburst pattern — each needle photorealistic with internal prismatic refraction catching cold blue-white light, the copper remnant beneath glowing its last faint amber warmth through the translucent ice, one hair-thin trail of frost-crystal dust extending diagonally downward-left and dissolving into the faintest particle motes, nearly the entire frame vast black silence with only this small frozen memory, the first frost claiming the last warmth at cosmic scale, asymmetric composition with the form small and anchored upper-right, no leaves no trees no landscape no honeycomb no hexagons no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP DARK VOID BACKGROUND, frozen crystalline pressure-forms in bruise violet and deep charcoal anchored in the lower-right corner of absolute black void, the forms built from photorealistic black ice with visible internal stress-fracture geometry and faint indigo light trapped in the deepest layers, the surface texture rendered as cracked permafrost at impossible cosmic scale with voronoi tessellation patterns in the fracture network, fine particles of dark violet ice-dust trailing leftward along horizontal paths into vast generous negative space filling two-thirds of the frame, connected hairline filaments of frozen graphite threading between the pressure-forms, asymmetric composition with the structures small and dense against overwhelming emptiness, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["be still...", "let it come...", "you don't have to be strong here..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      expansion: {
        aiPrompt: "DARK BACKGROUND, layered compression geometry of thick obsidian plates pressing inward from the upper-left third toward center frame, the plates stacked with photorealistic volcanic glass texture showing visible stress-fractures glowing faint bruise-violet and deep plum at the pressure seams, thin sheets of dark mica cracking and delaminating between the obsidian layers with fine particles of black mineral dust dispersing diagonally downward-right into vast deep grey-black negative space filling the lower two-thirds, connected threads of deep indigo tension-lines spanning between plate edges like geological fault-lines, the weight of grief rendered as tectonic compression at cosmic scale where the crushing force is architectural and designed, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["feel it...", "the weight is real...", "don't look away..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      transcendence: {
        aiPrompt: "DARK BACKGROUND, shattering glass architecture splitting open across the upper-right third of infinite black void, massive cathedral-scale panels of photorealistic dark tempered glass with deep violet-grey tint fracturing along geometric stress-lines, raw white wound-light pouring through the widening cracks and illuminating the internal lattice-structure of the glass from within, each shard retaining precise voronoi-cut edges as it separates, fine particles of pulverized glass-dust and prismatic splinters dispersing outward-left into vast open darkness from the bright seams, connected remnant filaments of dark lead-crystal still bridging between the separating panels, the moment of breaking rendered as designed architectural failure at cosmic scale, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["let it break...", "this is the bottom...", "you are still here..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      illumination: {
        aiPrompt: "DEEP DARK VOID BACKGROUND, thawing ice-forms clustered along the left edge of vast black emptiness, the forms built from photorealistic translucent glacial ice in pale blue-grey and deep violet with warm amber veins of liquid slowly spreading through internal crack-networks as the ice softens, the surfaces sweating with condensation droplets catching faint gold light, fine particles of melt-water mist and warm amber dispersing rightward along gentle curving paths into generous dark negative space filling two-thirds of the frame, connected gossamer threads of melting ice-crystal bridging between the thawing forms, the first warmth after frozen grief rendered as phase-transition at impossible scale, asymmetric composition with quiet sculptural power, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["something shifted...", "the weight is lighter now...", "breathe..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, kintsugi-mended mineral forms arcing from the lower-left corner across deep grey-black void, broken pieces of dark basalt and bruise-violet stone reassembled with veins of molten gold filling every crack and seam in photorealistic precious-metal texture, the gold lines following fibonacci-curve geometry through the fractured surfaces, fine particles of warm gold dust and dark mineral powder dispersing upward-right along gentle curving paths into vast generous negative space filling the upper two-thirds, connected threads of liquid gold still flowing between the mended junctions, the architecture of aftermath and repair rendered at cosmic scale where healing is visible as designed metalwork, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you carried it...", "the ache is quieter now...", "you are still whole..."],
        poetryMood: "flowing",
        voice: "onyx",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single scar-tissue crystal of smooth healed obsidian and dark amethyst anchored small in the lower-left corner of vast soft grey-black void, the crystal surface polished and whole but with photorealistic internal memory of its fracture pattern visible as faint ghost-lines of pale violet and warm gold trapped within the translucent mineral layers, a single point of quiet amber light glowing at its deepest center where the original break occurred, one thin trail of fine luminous particles extending diagonally upward-right along a fibonacci curve and dissolving into infinite darkness, nearly the entire frame is generous negative space, the geometry of survival compressed into one quiet healed form at impossible scale, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are changed...", "carry this gently..."],
        poetryMood: "flowing",
        voice: "onyx",
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
