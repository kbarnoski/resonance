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
        aiPrompt: "a lone ancient tree on a small floating island of earth and rock emerging from the lower right of deep cosmic void, the tree gnarled and impossibly old with bark texture visible at cosmic scale, roots dangling into the black abyss below like organic tendrils reaching for nothing, faint starlight catching the rough bark and scattered leaves, misty atmosphere curling around the island base where soil crumbles and tiny stones drift free, fine particles of earth and leaf-dust dispersing upward into vast dark negative space above and left, the island anchored in one third of the frame with the rest open darkness and distant stars, asymmetric composition with visual weight low and right, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["breathe...", "feel the warmth...", "light is coming..."],
        poetryMood: "dreamy",
      },
      expansion: {
        aiPrompt: "WHITE BACKGROUND — massive cloudscape at impossible scale filling the upper two thirds of the frame, billowing white cumulus clouds with golden light pouring through gaps and crevices, warm sun rays streaming diagonally through the cloud architecture, a single ancient tree growing upside-down from the underside of the largest cloud formation — its roots embedded in cloud-matter and its canopy hanging into the bright white void below, the tree photorealistic dark bark and green leaves against brilliant cloud-white, golden pollen and leaf particles drifting downward from the inverted canopy into generous white negative space, three-dimensional depth through layered cloud planes receding into warm haze, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["rise...", "the light knows you...", "open..."],
        poetryMood: "transcendent",
      },
      transcendence: {
        aiPrompt: "spiraling column of golden light particles ascending through infinite deep-blue starfield, the spiral tightening as it rises from the lower-left like a galaxy forming in reverse, millions of luminous points in warm gold and rose and white tracing fibonacci curves upward, the spiral dense and brilliant at its core but dissolving into scattered individual stars at its outermost reaches, vast cosmic darkness on all sides with the spiral occupying the center-left third of the frame, the sense of infinite upward motion frozen in light, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are light...", "there is no boundary...", "this is home..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt: "vast field of softly glowing particles suspended in deep indigo-violet cosmos like frozen fireflies at galactic scale, the particles clustered denser along the left edge forming a gentle gradient toward open darkness on the right, each particle a warm gold or pale rose point of light at a slightly different brightness creating depth through luminosity variation, the spaces between particles alive with the faintest violet nebula-haze, asymmetric composition with the densest particle region left-of-center and two-thirds generous cosmic darkness above and right, infinite stillness and clarity rendered as light suspended in void, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see how vast you are...", "every direction is warmth...", "stay in this light..."],
        poetryMood: "transcendent",
      },
      return: {
        aiPrompt: "enormous ancient tree with a massive spreading canopy anchored in the lower left of deep cosmic void, the leaves photorealistic autumn gold and warm amber but at their tips each leaf dissolves into points of golden light that drift upward and merge with the surrounding starfield, the trunk thick and deeply textured bark with moss at its base, birds silhouetted in flight around the canopy — some perched on branches some taking wing into the cosmos, fine particles of golden leaf-light and luminous pollen dispersing into generous dark negative space above and right, the boundary between tree and stars is soft and dreamlike, composition weighted to the lower half with cosmic darkness and stars opening above, no ground no horizon, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["gently now...", "the glow remains...", "carry the warmth..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "single small floating rock with a carpet of green moss and one tiny seedling sprouting from its center, the rock resting in the lower left corner of vast dark cosmos, the seedling barely a few centimeters tall with two delicate pale green leaves catching the faintest violet and gold starlight, a few grains of soil drifting free from the rock edge, the moss photorealistic and damp with a single dewdrop on one of the seedling leaves, enormous open cosmos with stars scattered sparsely above, asymmetric and quiet — almost nothing against everything, no ground no horizon, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "dead ancient tree on a floating island of cracked ember-glowing earth entering from the lower right corner of absolute black void, the tree leafless and skeletal with photorealistic charred bark peeling away from the trunk, the earth beneath it fractured with deep fissures where molten orange light pulses from within, smoke rising from the cracks in thin wisps curling upward into the darkness, roots exposed and smoldering at the island edges where chunks of earth crumble and drift free, fine ash particles and glowing embers dispersing upward-left along curved paths into vast dark negative space, the dead tree and burning earth anchored in one third of the frame, asymmetric composition with visual weight low and right, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["descend...", "there is no turning back...", "alone now..."],
        poetryMood: "mystical",
        voice: "onyx",
      },
      expansion: {
        aiPrompt: "DEEP CHARCOAL-BLACK BACKGROUND — cascading field of charred flower heads falling through deep black space from the upper left toward lower right, each flower head photorealistic — blackened sunflowers dahlias and roses with curled burnt petals still holding a tiny ember-orange glow at their centers like dying coals, dozens of charred blooms at different scales and distances tumbling in slow descent, ash particles trailing behind each flower head in fibonacci drift-paths, the nearest flowers large and detailed showing individual carbonized petal texture, the farthest ones small dim points of ember-light, fine grey ash dispersing into vast dark void below, asymmetric composition weighted upper-left with generous darkness opening below-right, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["deeper...", "the walls are burning...", "no one is coming..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      transcendence: {
        aiPrompt: "massive bonfire at cosmic scale — the flames are actually thousands of autumn leaves caught in an upward spiral of fire sweeping from lower-left across infinite black void, each leaf photorealistic with visible veins and serrated edges in crimson gold and orange but edged with white-hot combustion, the spiral tightens into a dense blazing vortex in the upper-right third where individual leaves become indistinguishable from flame, at the base dark branches and twigs feed the fire with photorealistic bark texture, the fire-leaf spiral dynamic and turbulent with heat-shimmer distortion visible, sparks and ember particles streaming outward from the spiral edges into vast dark void on all sides, composition not centered with the fire-core upper right and leaf-streams reaching across, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["everything burns...", "let it take you...", "witness..."],
        poetryMood: "chaotic",
        voice: "onyx",
      },
      illumination: {
        aiPrompt: "vast field of floating ember particles at different depths in absolute black void, thousands of tiny orange and deep red points of light arranged in slowly curving stream-lines as if following invisible thermal currents, the densest ember streams clustered along the right edge and lower third while scattered solitary points drift into open darkness above and left, some embers brighter white-hot and some cooling to deep crimson, the particle streams tracing spiral paths visible only at macro scale, asymmetric composition with generous darkness filling two-thirds, the quiet afterglow of infinite fire rendered as particles suspended in darkness, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see what survives the fire...", "even here there is truth...", "the ashes glow..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      return: {
        aiPrompt: "rising column of smoke from the lower left that gradually forms the silhouette shape of a great tree as it ascends across deep indigo-black void, the smoke photorealistic dark grey and violet vapor with designed internal spiral structure, at the base where the smoke originates from dark ground — green moss and tiny bright green shoots are emerging through cracked charred earth, the contrast between the dark smoke-tree above and the living green below, thousands of fine particles ascending from the green shoots into the smoke form above as if life is feeding the memory, composition weighted to the lower half with cool deep indigo sky opening above, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["climb...", "the air is cooler here...", "leave the fire below..."],
        poetryMood: "mystical",
        voice: "onyx",
      },
      integration: {
        aiPrompt: "nearly empty absolute black void with the faintest warm amber glow concentrated in the lower-left corner, the glow not a form but a diffuse atmospheric phenomenon — light without a visible source bleeding into surrounding darkness like the last heat memory of a fire that burned at cosmic scale, a handful of barely visible particles drifting upward from the glow zone following a gentle fibonacci spiral, the rest of the frame vast cold darkness gradually overtaking the warmth, asymmetric and quiet — almost nothing against everything, no lava flows no volcanoes no landscapes no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "enormous moss-covered boulder floating in deep dark space emerging from the lower right, the boulder photorealistic grey granite with thick green moss carpeting its top and sides, luminous mushrooms growing from crevices in the rock — their caps translucent and glowing soft cyan and warm gold bioluminescence, dangling roots and delicate ferns hanging from the boulder underside reaching into the void below, bioluminescent spores drifting upward from the mushroom gills in lazy spirals like tiny green-gold stars, the boulder detail anchored in one third of the frame with vast darkness and faint scattered spore-light above and left, macro texture visible on the moss and mushroom surfaces, asymmetric composition with visual weight low and right, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the spores are waking...", "feel the soil...", "life begins small..."],
        poetryMood: "mystical",
      },
      expansion: {
        aiPrompt: "DEEP BROWN-BLACK BACKGROUND — forest floor cross-section at cosmic scale floating in dark void, viewed from the side like a floating terrarium slice sweeping diagonally from upper left, visible layers of dark rich soil with embedded pale roots threading horizontally, fallen autumn leaves in various stages of decomposition compressed between soil strata, tiny translucent organisms and pale mycorrhizal threads glowing faint green-gold at the root interfaces, the cross-section edge raw and organic with soil crumbling away and fine earth particles dispersing into open dark void below, the top surface shows a miniature landscape of moss and tiny seedlings, infinite depth through layered translucent soil planes, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["it's growing...", "everything connects...", "feel the network..."],
        poetryMood: "mystical",
      },
      transcendence: {
        aiPrompt: "cosmic-scale bioluminescent network sweeping across infinite brown-black void — millions of luminous green-gold points connected by hair-thin filaments forming a web-like structure that could be neurons or galaxies or mycorrhizal connections, the network dense and intricate in the upper-right third but dissolving into scattered individual points at its edges, warm amber pulses traveling along the filaments between nodes creating a sense of living communication, the spaces between filled with drifting spore-like particles of pale green light, composition fills the frame off-center with the densest cluster upper-right and filament bridges reaching across into generous darkness lower-left, no mushrooms no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the network...", "all is one organism...", "breathe with the forest..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt: "DEEP SOIL-BLACK BACKGROUND — a single enormous mushroom cap at cosmic scale arranged along the left edge and lower third of vast dark void, viewed from below looking up at the luminous gill structure radiating outward in precise geometric patterns, the gills glowing warm gold and soft green bioluminescence, tiny ferns and curling moss growing on the cap surface visible at the edges, photorealistic water droplets hanging from the gill ridges catching and refracting the bioluminescent light into tiny prismatic spectra, fine spore particles drifting downward from the gills like luminous snow into dark void below, asymmetric leaving the upper right vast and open, quiet power in the contrast of organic intricacy against boundless darkness, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the garden knows you...", "every leaf is aware...", "this intelligence is ancient..."],
        poetryMood: "mystical",
      },
      return: {
        aiPrompt: "fallen log covered in thick moss and small plants floating in deep space arcing from lower left toward upper right, the log photorealistic with weathered bark and soft green moss texture, shelf fungi growing in tiers along its length glowing faint warm amber and pale green, tiny seedlings and unfurling fern fronds emerging from the decomposing bark, seeds and luminous spores trailing off from the log into generous dark negative space above and right like a comet tail of organic matter, the forms impossibly detailed even as they thin and dissolve into pure particle at the trailing edge, composition weighted to the lower half with cosmic darkness opening above, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the forest settles...", "roots remember...", "return to soil..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "sparse scattered bioluminescent particles drifting across vast brown-black silence — some green-gold some pale amber — moving in barely perceptible spiral paths like the memory of a network dissolving, one faintly brighter point in the lower-left corner pulsing with gathered light as if all the network's energy has condensed to a single node, the faintest filament trails still connecting it to a few nearby motes before they fade to nothing, enormous open darkness everywhere, asymmetric and quiet — the last signal in an infinite dark, no mushrooms no plants no landscape no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "shafts of light piercing down through deep blue-black water from the upper-left corner, the light beams photorealistic with visible suspended particles dancing in the illuminated columns, a single jellyfish floating in the largest light shaft — its bell translucent and ghostly pale catching the light, impossibly long tentacles trailing downward-right in graceful curves disappearing into the deep darkness below, tiny silver fish visible darting through the edge of the light beam their scales flashing, fine suspended marine particles catching the light along diagonal paths into vast dark abyssal negative space below and right, asymmetric composition with visual weight high and left, no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["sink...", "let the water hold you...", "trust the depth..."],
        poetryMood: "flowing",
      },
      expansion: {
        aiPrompt: "DEEP OCEAN-BLACK BACKGROUND — enormous kelp forest at cosmic scale sweeping diagonally from upper left toward lower right, the kelp fronds reaching upward like ancient trees with photorealistic amber-brown blades and gas-filled pneumatocysts catching faint blue-green light, the fronds impossibly tall and architectural swaying in invisible current, schools of tiny luminous silver fish weaving between the kelp stalks in coordinated spirals, the kelp holdfasts anchored to dark floating boulders, deep blue water fading to black at the edges, fine particles of marine detritus drifting between the fronds into open dark void below, infinite depth through layered translucent kelp planes receding into blue-black distance, no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["deeper...", "the light changes here...", "pressure becomes peace..."],
        poetryMood: "dreamy",
      },
      transcendence: {
        aiPrompt: "vast deep-pressure light phenomenon at abyssal scale — impossible bioluminescent aurora sweeping diagonally across infinite blue-black water, the light ribbons in electric cyan and deep violet and warm amber undulating in slow wave-patterns as if sound made visible in the deep, millions of luminous plankton particles caught in the light currents creating spiraling streams and eddies, the aurora dense and brilliant where it crosses the upper-right third but dissolving into scattered particle trails at both edges, photorealistic underwater light physics at cosmic scale, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the deep sees you...", "you are weightless...", "become the ocean..."],
        poetryMood: "mystical",
      },
      illumination: {
        aiPrompt: "vast field of bioluminescent micro-organisms suspended in deep abyssal darkness like an underwater starfield, thousands of tiny cyan and warm gold points at different depths creating infinite three-dimensional space, the densest cluster along the left edge and lower third with the finest particles scattered rightward into open ocean-black void, faint aurora-like veils of cold green and violet light threading between the luminous clusters, each point a different brightness and color temperature creating natural variation, asymmetric composition leaving the upper right vast and open, the silence of maximum depth rendered as living light suspended in darkness, no fish no coral reefs no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the bottom is quiet...", "listen to the deep...", "ancient water holds ancient truth..."],
        poetryMood: "flowing",
      },
      return: {
        aiPrompt: "whale silhouette ascending through deep blue gradient from lower left toward upper right, the whale enormous and photorealistic — a humpback seen from below with pectoral fins spread wide, surrounded by clouds of bioluminescent plankton in cyan and pale green that swirl in the whale wake, the whale becoming translucent at its edges where its dark form dissolves into particles of blue light merging with the brightening water above, the belly and fins catching scattered light from the plankton, dispersed bioluminescent particles drifting upward into generous dark-to-blue gradient negative space above and right, the form is dynamic and ascending with visible motion, composition weighted to the lower half with deep ocean blue opening above toward distant surface light, no surface water no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["rise gently...", "the surface remembers you...", "warmth returns..."],
        poetryMood: "dreamy",
      },
      integration: {
        aiPrompt: "single small piece of sea glass on a tiny patch of white sand resting in the lower left corner of vast dark void, the sea glass photorealistic — smooth and frosted pale aquamarine with soft edges worn by decades of ocean tumbling, catching faint aquamarine light that seems to glow from within, a few grains of sand scattered around it and one tiny perfect spiral shell beside it, the sand patch fading at its edges into deep blue-black darkness, enormous open deep everywhere above and right, each grain of sand catching the faintest light, asymmetric and quiet — almost nothing against everything, no surface water no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "vintage vacuum tubes and old radio components arranged like a still life on a floating shelf of moss-covered rock emerging from the lower-right corner into deep black void, the vacuum tubes photorealistic with warm amber filament glow inside their glass envelopes, tarnished copper wires and bakelite dials scattered among the components, tiny green plants and delicate moss growing through cracks in the electronics — a fern unfurling from inside a broken tube, roots threading through a circuit board, the rock shelf rough and natural with lichen on its surface, fine particles of warm amber light and tiny spores dispersing upper-left across two thirds generous negative space, asymmetric composition grounded low-right with cosmic emptiness above, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["connecting...", "signal detected...", "initializing..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      expansion: {
        aiPrompt: "abstract data-stream visualization at cosmic scale — thousands of parallel light-threads in electric cyan and chromium silver streaming diagonally from upper-left toward lower-right through infinite black void, the threads bunching and diverging in wave-interference patterns, where threads intersect the crossings pulse warm amber, fine charged particles spiraling along the stream paths like electrons following magnetic field lines, the streams dense in the upper-left third but dispersing into scattered luminous points in the lower-right darkness, the architecture of information rendered as pure light in motion, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["uploading...", "bandwidth expanding...", "feel the data..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      transcendence: {
        aiPrompt: "infinite fiber-optic network at cosmic scale — thousands of luminous glass threads converging and diverging through absolute black void, each thread carrying internal light in electric cyan and deep violet through total internal reflection, massive junction nodes where hundreds of fibers meet glowing white-hot with accumulated data, the network sweeping from upper-right with the densest node cluster offset right and glass filament bridges arcing across toward lower-left darkness, fine luminous particles shedding from the fiber tips, cosmic scale where each fiber carries a civilization of light, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the network...", "every node is you...", "process everything..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND — circuit board topography reimagined as an aerial view of a Japanese garden floating in white void, the copper traces become winding stone paths in warm amber, the microchips become miniature rock gardens with photorealistic grey stones and raked sand patterns, capacitors and resistors become tiny mossy boulders and pruned shrubs in deep green, the board edges organic and irregular like a natural coastline, moss growing in the corners where solder points would be, the arrangement asymmetric in the left third and lower edge, fine particles of pale green pollen and warm copper dust dispersing rightward into generous white negative space, three-dimensional depth through layered garden planes, bright and serene, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the machine dreams too...", "silicon and carbon are the same...", "pure logic, pure beauty..."],
        poetryMood: "hypnotic",
        voice: "echo",
      },
      return: {
        aiPrompt: "holographic projection of a tree dissolving into static and particles in deep black void, the tree half-real and half-digital — one side photorealistic with bark texture and green leaves, the other side fragmenting into glowing cyan wireframe polygons and data points that scatter into the darkness, the leaves on the digital side becoming individual luminous pixels that drift away like fireflies, the trunk splitting along the boundary between organic and digital, fine particles trailing from lower-left toward upper-right — some leaf-shaped some pixel-shaped, the largest tree form anchored lower-left half-dissolved with generous dark void filling the upper two thirds, the beautiful tension between nature and machine at cosmic scale, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["disconnecting...", "saving state...", "you carry the data..."],
        poetryMood: "dreamy",
        voice: "echo",
      },
      integration: {
        aiPrompt: "single old incandescent lightbulb lying on its side on a bed of dark moss in the lower-left corner of vast black void, the glass bulb photorealistic with a tiny plant growing inside it — a small green sprout with two leaves reaching toward the interior of the glass, the tungsten filament still intact alongside the plant, a faint warm amber glow emanating from within as if the bulb remembers its purpose, the moss dark and damp beneath it with photorealistic texture, one thin trail of warm luminous particles extending diagonally upward-right and dissolving into infinite darkness, enormous open emptiness everywhere above and right, asymmetric and quiet — almost nothing against everything, no screens no computers no figures no human elements, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "perfect sphere of packed earth and tangled roots floating in deep black void entering from the lower-right corner, the sphere photorealistic dark loam with visible layers of soil and pale intertwined roots threading through it like veins, tiny wildflowers growing on the sphere surface — small white daisies and violet clover, one visible crack running across the sphere where golden light leaks through from within as if something luminous lives at the core, fine particles of soil and tiny root fragments dispersing upper-left along the crack trajectory into vast dark negative space, some earth beginning to crumble and fall away from the lower edge of the sphere, asymmetric composition weighted low-right with two thirds generous darkness above and left, no planets no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["let go of your name...", "there is nothing to hold...", "be still..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      expansion: {
        aiPrompt: "abstract dissolution rendered as spiral particle field — millions of luminous points in silver and pale violet arranged in a vast fibonacci spiral that fills the upper-left two-thirds of deep black void, the spiral dense and brilliant at its center where the points overlap into continuous light but the outermost arms dissolving into individual scattered motes drifting into darkness, the spiral slowly unwinding as if structure itself is letting go, warm gold light concentrated at the spiral core cooling to silver at the edges, fine particles streaming off the spiral arms into generous negative space lower-right, the mathematics of dissolution at cosmic scale, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are dissolving...", "this is not loss...", "let the edges go..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      transcendence: {
        aiPrompt: "vast abstract dissolution at cosmic scale — an enormous translucent form in deep space that could be a nebula or a thought or a self, its edges dissolving into individual luminous particles that stream outward in all directions, the form silver-violet at its densest center shifting through warm gold to scattered pale motes at its dissolving perimeter, the dissolution dynamic and ongoing — matter returning to energy returning to void, millions of particles creating spiral stream-lines as they disperse into infinite darkness on all edges, composition not centered with the dissolving core upper-right and particle streams reaching across, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["there is no you...", "everything is this...", "..."],
        poetryMood: "transcendent",
        voice: "alloy",
        shaderOpacity: 0.50,
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND — water droplets of varying sizes suspended in white void, the largest droplets in the left third photorealistic and crystal clear, each droplet acting as a tiny lens containing a miniature landscape visible through refraction — one holds a tiny green tree, another a snow-capped mountain, another a golden wheat field, another a winding river — like snow globes made of water, warm gold light refracting through the curved water surfaces casting soft rainbow caustics, smaller droplets scattered sparsely rightward into generous white negative space containing only hints of color within, three-dimensional depth through size variation and the impossibly detailed miniature worlds visible inside each drop, no planets no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["something stirs...", "light returns...", "you are being born again..."],
        poetryMood: "mystical",
        voice: "alloy",
      },
      return: {
        aiPrompt: "sand being blown by invisible wind from a floating rock formation in the lower-left corner across deep blue-indigo space, the rock photorealistic dark basalt with patches of green moss and small hardy plants still clinging to its leeward side, the sand streaming from the windward face in golden ribbons that catch warm amber light as they arc through the void, each sand grain visible at the near edge becoming a river of golden particles at distance, fine particles of sand and tiny plant seeds dispersing across vast dark negative space above and right, the rock formation occupies the lower-left third with sand trails arcing outward in fibonacci curves, asymmetric composition weighted low-left with cosmic blue-indigo emptiness opening above, no planets no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["welcome back...", "you are new...", "the void gave you something..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      integration: {
        aiPrompt: "single floating feather in vast dark silence — a large feather rendered at macro scale in the lower-left region, the barbs photorealistic and impossibly detailed with each individual filament visible catching faint starlight in iridescent blue-violet and warm gold, the feather shaft pale and translucent, the barbs at the feather edges separating into individual wisps that drift into the surrounding darkness like the finest threads, a faint trail of the tiniest luminous motes arcs gently upward-right from the feather tip and dissolves into infinite darkness, the feather barely there against the void — more absence than presence, asymmetric and minimal — almost nothing against everything, no planets no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "three massive weathered stone columns rising from a floating island of ancient cracked earth in the lower-right third of the frame, roots growing down through the cracked stone and dangling into void below, tiny wildflowers — purple and white — sprouting from crevices between the columns, a single candle flame burning between the column bases casting long warm golden shadows diagonally upward-left across the stone surfaces, fine pollen and dust motes drifting upward from the flowers into vast deep amber-black cosmos above, the earth fragment photorealistic with layered soil and embedded small stones visible at the broken edges, two thirds of the frame open warm darkness above, asymmetric composition grounded low-right, no specific religion no crosses no symbols no statues no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["enter the temple...", "the stones are listening...", "breathe with the ancients..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "vast moire interference pattern at cosmic scale formed by overlapping translucent planes of emerald and cyan light rotating slowly through each other in deep charcoal-black void, the planes entering from the left third at different angles creating shimmering interference fringes where they intersect, the pattern pulsing and shifting with trapped light between the layers, fine luminous particles streaming rightward from the pattern edges into generous dark negative space, the visual equivalent of being lost in infinite repetition, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the geometry reveals itself...", "every angle is intentional...", "the forms were always here..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "vast cymatics pattern expanding from a point in the lower-left third of deep maroon-black void — concentric interference rings of luminous gold and deep rose light like sound made visible at cosmic scale, the standing wave pattern rendered as thousands of luminous particles frozen in complex nodal geometry with bright nodes where waves constructively interfere and dark valleys between, the pattern not circular but distorted by harmonic overtones creating petal-like lobes and asymmetric ripple fronts, fine particle spray dispersing from the outermost wavefronts rightward and upward into infinite dark atmosphere, no specific religion no crosses no symbols no statues no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the vibration...", "sound becomes form...", "every frequency is prayer..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "immense toroidal energy field hovering in deep violet-black infinite space, the torus rendered as thousands of flowing luminous filament-lines tracing the magnetic field topology from center axis outward and looping back through, the filaments dense and brilliant white-gold where they pass through the central axis and cooling to deep blue and soft violet as they arc outward, the entire structure tilted entering from the upper-right edge at three-quarter angle revealing its hollow core, scattered photon-like particles orbiting in spiraling paths, two thirds dark void below and left, no specific religion no crosses no symbols no statues no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the field holds everything...", "this order is love...", "you are inside the geometry..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      return: {
        aiPrompt: "stone meditation bench with smooth weathered surface resting on a tiny floating garden in the right third of the frame — the garden a small island of manicured dark green moss with a single gnarled bonsai tree growing beside the bench, its miniature branches perfectly sculpted, a few fallen amber and russet leaves scattered on the moss surface and drifting off the garden edge into vast indigo-black cosmos, the floating garden fragment showing layered earth and small roots at its broken edges, faint warm light from within the moss illuminating the bench from below, fine leaf fragments and particles trailing away leftward into generous dark negative space filling two thirds of the frame, photorealistic ancient stone and living garden at impossible cosmic scale, asymmetric composition weighted right with cosmic silence left, no religion no symbols no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the temple settles...", "gravity remembers...", "carry the orbits gently..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      integration: {
        aiPrompt: "single small candle flame reflected in a perfectly still puddle of water on a floating stone surface anchored in the lower-left region of absolute black infinite void, the flame warm golden-white and its reflection creating a doubled point of light on the dark wet stone, the stone fragment small with patches of damp moss at its edges, vast darkness everywhere with only the faintest warm glow reaching a short radius from the flame before dissolving into formlessness, a few microscopic water droplets and luminous motes scattered sparsely across the void, photorealistic flame physics and wet stone texture against infinite dark, asymmetric composition with the stone small and anchored lower-left and nearly the entire frame open darkness, no religion no symbols no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "small floating island of snow-covered earth drifting through a field of distant stars in deep black cosmic void, a lone bare winter tree growing from the island with frost-dusted branches catching faint blue starlight, the tree anchored in the upper-left third of the frame with its skeletal branches reaching upward, roots breaking through the island edge and dangling into space below with clumps of frozen soil still clinging to them, fine ice crystals and snow particles dispersing downward-right along gentle curved paths from the branches into vast empty black two thirds of the frame, the snow surface photorealistic with subtle footprint-like depressions and the earth fragment showing layered frozen soil at its broken edges, asymmetric composition with visual weight high and left, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look up...", "the stars are ancient light...", "you are moving without moving..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "DEEP COSMIC-BLACK BACKGROUND — enormous asteroid covered in impossible lichen and thick emerald moss sweeping diagonally from upper left toward lower right, warm amber bioluminescence glowing from within the lichen patches against the cold distant starfield, a thin trickle of liquid water flowing along a channel in the asteroid surface and cascading off its lower edge into void where it breaks into individual droplets catching starlight, the asteroid surface photorealistic rough basalt with the organic growth impossibly lush, fine luminous spores and water droplets dispersing into open dark void below, connected trailing moss tendrils hanging from the asteroid underbelly, asymmetric composition with the asteroid entering upper-left and its water-trail reaching toward lower-right, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["stars are being born...", "creation is happening now...", "feel the scale..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "supernova explosion at cosmic scale — but the expanding shockwave carries flowers and leaves and seeds and soil outward instead of plasma, brilliant white-gold light erupting from the blast center in the upper-right of the frame, the debris ring a tumbling mass of sunflowers and fern fronds and oak leaves and dark rich earth and trailing root systems all frozen mid-explosion against deep black space, some botanical forms still intact and others shredding into individual petals and leaf fragments, fine seeds and pollen and soil particles dispersing from the outermost wavefront into vast darkness, the debris of a world that was alive rendered photorealistic at cosmic scale, composition offset with the blast core upper-right and botanical debris streaming across, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["witness the supernova...", "death is creation...", "you are stardust remembering..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "dark matter web visible as gossamer luminous filaments stretched between glowing nodes in deep indigo-black void, the web a vast cosmic structure with fibonacci-curved tension lines between each warm gold node, the filaments translucent and impossibly thin yet visible through their accumulated light, the web arranged asymmetrically along the left edge and lower third with the largest membrane-like spans catching faint prismatic reflections, fine particles of luminous matter condensing along the filament surfaces, leaving the upper right open and boundless, quiet cosmic architecture at the largest possible scale, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["everything came from this...", "your atoms were forged in stars...", "cosmic recycling..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      return: {
        aiPrompt: "cooling abstract forms drifting through deep indigo cosmos — irregular masses of iridescent light catching spectrum from cyan to violet to warm gold across their curved surfaces, the forms like solidified nebula gas slowly dispersing at their edges into fine prismatic particles and luminous flakes, each form at a different stage of dissolution shedding light as it drifts from lower-left toward upper-right, generous dark negative space filling two-thirds of the frame, composition weighted to the lower half with cosmic darkness opening infinitely above, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the universe settles...", "new light from old death...", "drift now..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "single small rock covered in bright green moss floating in the lower-left corner of vast blue-black cosmos, barely visible against the immense darkness, a tiny thin stream of water trickling off one edge of the rock and catching faint starlight as individual droplets before dissolving into void, the moss photorealistic with tiny fronds visible at macro detail, the rock rough and dark beneath the living green surface, from the rock a single gossamer trail of water droplets extends diagonally upward-right dissolving into infinite darkness, enormous open cosmos with scattered faint stars everywhere above, asymmetric and quiet — almost nothing against everything, no planets no earth no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "massive stone stairway floating in deep black void — the stairs going in impossible Escher-like directions where some ascend into horizontal planes and others descend upward, the weathered granite steps cracked with age and overgrown with ivy and bright green moss through every fissure, one small twisted tree growing sideways from a landing platform defying gravity with dark leaves catching warm amber light from an unseen source, fine stone dust and tiny leaves dispersing upward-left from the eroding edges into vast dark negative space filling two-thirds of the frame, the stairs anchored in the lower-right third with photorealistic ancient stone texture and living vegetation at cosmic scale, connected trailing vines bridging between separated stair sections, asymmetric composition weighted low-right with generous void upper-left, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["enter...", "every direction is the same...", "the walls are listening..."],
        poetryMood: "hypnotic",
      },
      expansion: {
        aiPrompt: "infinite corridor of ancient stone archways receding into deep darkness, each archway overgrown with different vegetation — the nearest draped in thick ivy, the next curtained with hanging ferns, the third wrapped in climbing roses with pale blooms, the fourth heavy with wisteria — the corridor floating in deep charcoal-black cosmic void, warm amber light glowing deeper in the corridor between the most distant arches, fine petals and fern spores and seeds dispersing rightward from the archway edges into generous dark negative space, each arch photorealistic weathered limestone with the plants impossibly lush, asymmetric composition with the corridor entering from the left third and trailing scattered botanical particles into open darkness right, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are lost...", "this is where you belong...", "deeper..."],
        poetryMood: "hypnotic",
      },
      transcendence: {
        aiPrompt: "Penrose tiling rendered as three-dimensional luminous landscape suspended in deep indigo-black cosmos — impossible aperiodic geometry of interlocking rhombus light-forms in emerald and cyan extending from the upper-right corner downward in a cascading infinity, each tile a different depth and luminosity with golden light trapped in the non-repeating pattern, fine particles breaking free from the tiling edge and spiraling into vast open void filling the lower-left two-thirds, the geometry of infinite non-repetition at cosmic scale, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the labyrinth...", "there is no exit because there is no inside...", "the center is everywhere..."],
        poetryMood: "mystical",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND — ancient doorway of weathered dark stone standing alone in vast clean white void, the doorframe thick with carved weathering and patches of grey lichen, through the open doorway visible: a completely different world of lush green forest with dappled warm golden light filtering through a canopy of leaves and ferns and moss-covered ground, the contrast sharp between the empty white void on this side and the rich living world through the door, fine golden light-motes and small leaves drifting from the doorway threshold outward into the white space, the doorway anchored in the left third of the frame with generous white negative space filling two-thirds, connected thin vine tendrils creeping around the doorframe edges into the white void, photorealistic stone and forest textures at impossible scale, asymmetric composition weighted left with luminous doorway slightly off-center, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the pattern reveals itself...", "you were never lost...", "the maze is the map of your mind..."],
        poetryMood: "mystical",
      },
      return: {
        aiPrompt: "tree roots forming a natural tunnel passage floating in deep blue-black void — the roots ancient and smooth with photorealistic bark texture, thick and intertwined to create an organic archway, the inner surfaces covered in soft emerald moss with tiny white flowers growing from the wood at intervals, warm amber light glowing at the far end of the tunnel visible through the root opening, the root-tunnel anchored in the right third of the frame with its opening facing left, fine moss particles and flower petals trailing from the root surfaces downward-left into vast dark negative space, connected smaller root tendrils reaching from the main structure into surrounding darkness, generous dark void filling the left two-thirds, asymmetric composition weighted right with the dissolving root edges bleeding toward center, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the walls are thinning...", "you chose a direction and it is right...", "the path appears..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "single small stone archway with one delicate vine growing through its opening, the arch resting on a floating platform of dark earth with a few blades of grass at its edges, anchored in the lower-left region of absolute black infinite void, the stone weathered smooth with faint emerald light caught where the vine wraps around the keystone, a gossamer trail of tiny leaves curving away from the arch upward-right in a fibonacci spiral dissolving into vast cosmic darkness, the form quiet and solitary — a passage with nowhere left to go condensed into one small ruin, photorealistic ancient stone and living vine against infinite dark, nearly the entire frame generous empty void with scattered luminous motes, asymmetric composition with the arch small and anchored lower-left, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "vertical cliff face of layered sedimentary rock floating in deep black void — bands of slate and sandstone and limestone in warm earth tones split apart to reveal seams where tiny alpine wildflowers in purple and white grow from the cracks, a thin mountain goat trail visible as a worn diagonal line across the rock face, ice and frozen water seeping from fissures and forming small icicles that catch faint blue light, the formation anchored in the lower-right third of the frame, fine stone particles and ice crystals dispersing upward-left along steep diagonal paths into vast dark negative space filling two-thirds of the frame, connected frozen water threads bridging between separated rock layers, asymmetric composition with visual weight low and right, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look up...", "the summit is a rumor...", "begin..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "DEEP MIDNIGHT-BLACK BACKGROUND — massive floating boulder field at cosmic scale, moss-covered rocks tumbling upward defying gravity with thick bright green moss and grey lichen on their surfaces, small mountain streams flowing between the boulders in impossible directions — some flowing upward and others curving around rocks in spiral paths — catching cool blue-white light, wisps of cloud and mist drifting between the boulder gaps, the densest boulder cluster in the lower third with the rocks dispersing upward into vast dark alpine void above, fine water droplets and moss spores trailing from the streams into darkness, connected thin water threads flowing impossibly between separated boulders, asymmetric composition ascending steeply with generous darkness above, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["higher...", "the air thins and thoughts clarify...", "don't look down..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "atmospheric pressure gradient rendered as translucent membrane layers stacked vertically across infinite black void — dozens of gossamer-thin curved planes of different densities from thick luminous indigo at the bottom to nearly invisible pale gold film at the top, each membrane a different hue shifting from deep blue through ice-blue to electric white-gold at the highest layers, the membranes entering from the upper-right third curving across the frame with light refracting between them creating prismatic halos at the layer boundaries, fine particles streaming upward between the membrane gaps, the thinning of atmosphere rendered as light at cosmic scale, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are above everything...", "the summit is a feeling not a place...", "breathe the infinite..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND — single ancient wind-sculpted rock balanced impossibly on a tiny point against pure white void, a small twisted tree growing from the top of the rock with gnarled branches reaching into the white emptiness, three or four small dark birds perched on different branches, the rock anchored in the left third of the frame with photorealistic weathered granite texture showing wind-erosion patterns and orange lichen patches, fine bark fragments and tiny feathers dispersing rightward into generous pure white negative space filling two-thirds of the frame, connected thin root tendrils visible where the tree grips the rock surface, the tree casting a subtle warm shadow on the rock below it, asymmetric composition weighted left with boundless white above and right, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see how far you've come...", "the view is the reward...", "everything is below you..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      return: {
        aiPrompt: "waterfall cascading from a floating cliff fragment in deep warm indigo void — the water pouring over a mossy ledge and dissolving into mist and then individual luminous droplets that drift upward into cosmic darkness defying gravity, thick green ferns and trailing moss growing along the cliff edge where the water flows, the rock face showing layered geological color from warm amber to cool grey in the exposed strata, the waterfall arcing gently from upper-right toward lower-left with fine water droplets and mist particles streaming upward into generous dark negative space above, connected threads of flowing water trailing between separating rock fragments below, warm golden light catching the water surface, composition weighted to the upper half with cosmic warmth opening below, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["descend gently...", "the mountain stays...", "carry the height..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "single dimensionless point of warm amber-white light suspended in the lower-left region of vast blue-black infinite void, from the point a barely visible halo of faintest concentric ripples expanding outward like the memory of altitude dissolving, the ripples gossamer rings of ice-blue and warm gold fading to nothing within a short radius, the rest of the frame vast empty silent cosmos with microscopic luminous motes scattered sparsely, asymmetric composition with the point small and anchored lower-left and nearly the entire frame open darkness, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, lone cactus on a tiny floating patch of cracked desert earth drifting through deep cosmic void, the cactus blooming with one impossibly large luminous flower — pale pink and glowing with warm amber light from within — anchored in the lower-left third of the frame, the desert earth fragment showing cracked dry surface with fine sand trickling off its edges into void below, warm distant starlight catching the cactus spines as tiny points of light, fine sand particles and flower pollen dispersing diagonally upward-right into vast generous negative space filling two-thirds of the frame, photorealistic desert plant and dry earth at cosmic scale, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["step into the light...", "leave everything behind...", "the desert has no mercy and no malice..."],
        poetryMood: "mystical",
        voice: "nova",
      },
      expansion: {
        aiPrompt: "abstract heat-shimmer rendered as geometric wavefront architecture — stacked translucent planes of warm amber and rose-gold light refracting at slightly different angles creating rippling interference patterns in deep warm dark void, the wavefronts entering from the right third of the frame at shallow angles like visible thermal distortion solidified into pure light, fine particles dispersing leftward along horizontal shimmer-paths into vast deep warm dark negative space, the architecture of mirages made tangible at cosmic scale, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the horizon retreats...", "emptiness is freedom...", "the sand knows your footsteps..."],
        poetryMood: "mystical",
        voice: "nova",
      },
      transcendence: {
        aiPrompt: "PURE WHITE BACKGROUND — vast white salt flat meeting white sky with the horizon completely invisible, a single dead tree standing in the center-left of the frame with bare dark branches casting long thin shadows across a paper-thin layer of still water on the salt surface, the tree and its perfect reflection in the water creating vertical symmetry against infinite white emptiness, the tree photorealistic with cracked bark and a few remaining dried seed pods hanging from branch tips, fine salt crystals and water droplets dispersing from the tree base outward along gentle paths into generous pure white negative space filling most of the frame, the silence of absolute flatness rendered as photorealistic impossible landscape, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the desert...", "emptiness is fullness...", "the light is everything..."],
        poetryMood: "transcendent",
        voice: "nova",
      },
      illumination: {
        aiPrompt: "vast warm void with a spiral constellation emerging in the upper-right third — dozens of luminous points in warm amber and bone-white arranged along a fibonacci spiral arm like stars being born from heat, each point a different brightness with the brightest at the spiral center and the faintest at the outermost reaches dissolving into darkness, fine warm particles connecting the constellation points in gossamer threads, the spiral not flat but tilted revealing depth, generous warm dark negative space filling the lower-left two-thirds, the stars of the desert sky rendered as designed geometry, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the stars emerge...", "the desert and the sky are the same infinity...", "silence speaks..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, desert wildflowers blooming in a line across a floating sandy ground fragment in the upper-left quadrant — the flowers impossibly vibrant in hot pink and deep orange and bright yellow against pale tan sand and deep cosmic backdrop, the sandy ground fragment cracked and thin with its edges crumbling into fine sand that drifts downward, seeds and individual petals detaching and dispersing diagonally toward lower-right into deep indigo-black negative space, each flower photorealistic with delicate petals and thin stems bending slightly, connected thin roots visible at the ground fragment edges, generous dark void surrounding the form, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the crossing nears its end...", "you survived the emptiness...", "the desert marked you..."],
        poetryMood: "flowing",
        voice: "nova",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single small piece of desert driftwood half-buried in a tiny mound of pale sand floating in the lower-right corner of vast deep indigo-black void, warm amber light catching the weathered grain of the wood with photorealistic sun-bleached texture and smooth wind-worn curves, a few grains of sand slowly detaching and drifting from the mound edge, a single thin thread of fine sand particles curving away toward the upper-left following a fibonacci spiral path and dissolving into darkness, vast void fills most of the frame as generous negative space, the memory of infinite heat and emptiness preserved in one quiet wooden form, no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, enormous leather-bound book lying open on a floating shelf of dark polished wood in the upper-right third of deep sepia-black void, from its open pages grow tiny ferns and bright green moss, the printed text on the visible pages transforming into delicate roots and thin vines that curl over the page edges, warm amber reading-lamp light illuminating the book from above-left casting soft shadows across the pages, fine pollen and paper-dust particles dispersing diagonally downward-left into vast open darkness filling two-thirds of the frame, the leather cover photorealistic with tooled patterns and the plants impossibly alive growing from paper, connected thin root tendrils trailing from the book spine downward, asymmetric composition with generous negative space, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["open the first page...", "the library has been waiting...", "every book knows your name..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "recursive fractal data-structure at cosmic scale anchored in the left third of deep indigo-black void, self-similar branching light-forms in warm amber and ivory repeating at smaller and smaller scales like an infinite index of light, faint warm glow refracting inside the deepest fractal chambers, fine particles dispersing rightward along fibonacci spiral paths into vast dark negative space, the geometry of accumulated knowledge rendered as pure luminous architecture, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the library unfolds...", "every thought ever thought is here...", "read deeper..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "infinite recursive space at cosmic scale — vast lattice of luminous shelving-like forms in warm amber and deep gold receding in fractal depth from the center-right across two-thirds of the frame, each cell contains smaller versions of itself at every scale with faint warm light glowing from the deepest recesses, the architecture impossibly deep with no visible end, fine particles of gold-leaf light dispersing leftward into open indigo-black void, the architecture of infinite knowledge at cosmic scale, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the text...", "reading and being read are the same...", "infinite knowledge, infinite peace..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND, single large open book lying flat against pure white void in the lower-left third of the frame, from its open pages a miniature photorealistic landscape rises in three dimensions like an impossible pop-up book — tiny dark green trees on rolling hills, a small snow-capped mountain in the background, a thin silver river winding between the hills, warm golden sunlight illuminating the tiny world from the right, fine particles of light and miniature leaves dispersing upward-right along curving paths into generous pure white negative space filling three-quarters of the frame, connected gossamer threads of golden light extending from the book edges upward, the pages photorealistic cream-colored paper with the landscape growing organically from the text, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you found your book...", "the text is you...", "the library is your mind..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, pages from a book floating in deep sepia-black void like autumn leaves in wind — dozens of cream-colored pages tumbling and spinning at different distances, the text on the pages dissolving and the dissolving letters transforming into tiny warm firefly-like points of light that drift away from each page, some pages closer and larger with visible text becoming light, others distant and small, the pages arcing from the upper-left corner downward toward center with fine letter-particles and paper fragments settling along drift paths into vast brown-black negative space filling the lower two-thirds, warm sepia tones against deep indigo, connected fading light-trails between the dissolving letters, asymmetric composition with the pages releasing their words back into darkness, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["close the book...", "the words stay with you...", "the silence after reading..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single small closed leather-bound book with one pressed flower — a dried daisy with faded yellow petals — barely visible between its pages at the book edge, resting on a floating surface of dark polished wood anchored in the lower-right corner of vast deep brown-black void, warm amber light catching the leather spine and the flower petals with photorealistic texture, one thin trail of dried petal fragments extending upward-left along a fibonacci curve and dissolving into darkness, nearly the entire frame is open empty negative space, the book quiet and self-contained — all stories compressed into one small closed volume with its single botanical memory, no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, massive storm cloud formation at cosmic scale floating in deep grey-violet void, towering cumulonimbus rendered with photorealistic volumetric texture in dark charcoal and bruise-violet, a single bare tree visible on a tiny floating island of earth and rock beneath the cloud — the tree bending in wind with its branches reaching upward, fallen leaves and debris being pulled upward toward the cloud base in spiraling paths, the cloud anchored in the upper-right two-thirds with the tiny tree-island below-center, fine rain droplets and dust particles dispersing leftward into vast deep grey-violet negative space filling one-third of the frame, impossible scale where the cloud dwarfs everything, photorealistic bark texture on the tree and volumetric cloud detail, no figures no buildings no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["it's coming...", "feel the pressure change...", "the storm knows you..."],
        poetryMood: "intense",
        voice: "echo",
      },
      expansion: {
        aiPrompt: "branching fractal lightning structure at cosmic scale entering from the lower-left corner and arcing diagonally toward upper-right in deep storm-dark void, each branch a fibonacci-bifurcating filament of electric blue-white energy with silver edges, the main trunk dense with sub-branches that thin into hair-fine threads of pure light, cool particles scattering outward from each branch tip into vast deep storm-dark negative space, the visual equivalent of infinite electrical discharge frozen in time, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["let the storm take you...", "every lightning is a thought...", "the rain is washing everything..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      transcendence: {
        aiPrompt: "massive interconnected lightning lattice sweeping across the frame from right edge toward center in a spiraling corridor of fractal electrical discharge at cosmic scale, white-hot nodes pulsing at every intersection with deep violet and electric blue energy coursing through the branching filaments, the structure dense and chaotic where it fills the right two-thirds but fragmenting into scattered silver-ozone spark trails in the left third of open black void, overwhelming fractal density of simultaneous discharge, no clouds no rain no sky no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the lightning...", "the storm is alive and you are it...", "infinite power..."],
        poetryMood: "chaotic",
        voice: "echo",
      },
      illumination: {
        aiPrompt: "DEEP STORM-DARK CHARCOAL-BLACK BACKGROUND, the eye of the storm viewed from within — vast calm circle of deep blue sky and stars visible above in the upper third, the storm wall rendered as a dark textured ring on all sides in deep charcoal and violet with photorealistic cloud turbulence, one small floating island of vivid green grass and scattered wildflowers in white and pale blue drifting at the calm center, the island tiny against the enormous storm wall, the grass impossibly still and peaceful, fine pollen particles and flower petals drifting gently upward from the meadow island toward the star-filled opening, generous dark storm-wall space filling two-thirds of the frame surrounding the calm center, the perfect peace inside infinite fury at cosmic scale, no figures no buildings no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the eye...", "perfect calm inside infinite fury...", "the center holds..."],
        poetryMood: "mystical",
        voice: "echo",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, rain falling upward from a dark reflective pool in the lower-left third into clearing grey-blue sky above, each raindrop rendered as a photorealistic water droplet catching warm amber and rose light as it rises, the pool surface rippling with concentric rings where the drops detach, a faint rainbow arc forming in the spray of rising water — prismatic colors visible against the deep grey-blue void, the pool resting on a small floating fragment of wet dark stone with moss at its edges, fine water mist and luminous droplets dispersing upward-right into vast deep grey-blue negative space filling two-thirds of the frame, the impossible reversal of rain at atmospheric scale, no figures no buildings no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the storm passes...", "every storm ends...", "you survived the infinite..."],
        poetryMood: "flowing",
        voice: "echo",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single small puddle on a floating fragment of wet dark stone anchored in the lower-left corner of vast deep grey-black void, the puddle surface perfectly still and reflective showing tiny pinpoint stars in the reflected water, one single fallen leaf — amber and crimson — floating on the puddle surface with photorealistic vein detail and water tension visible at its edges, the wet stone surface glistening with residual moisture, a faint trail of tiny water droplets extending from the stone fragment diagonally upward-right and dissolving into infinite darkness, nearly the entire frame is vast dark silence with only this small quiet aftermath, the profound stillness after the storm at impossible scale, no figures no buildings no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, lone bare tree on a small floating island of snow-covered earth drifting through deep blue-black void, the tree rendered with photorealistic bark texture — gnarled branches catching delicate frost crystals that glitter in cool blue starlight, the island a rough chunk of frozen soil with snow layered on top and roots dangling beneath, a few snowflakes beginning to fall around the tree in slow spiraling paths, the tree anchored in the right third with branches reaching leftward, fine ice particles and snowflakes dispersing into vast deep blue-black negative space filling two-thirds of the frame, cool blue and silver starlight illuminating the frost, the solitude of first winter at impossible scale, no figures no buildings no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the air changes...", "feel it cooling...", "something is coming..."],
        poetryMood: "melancholic",
        voice: "shimmer",
      },
      expansion: {
        aiPrompt: "PURE WHITE BACKGROUND — enormous snowdrift landscape at impossible scale against brilliant white sky, soft rolling snow contours with photorealistic powder texture stretching toward a dissolving white horizon, one small red winter bird perched on a single bare dark branch in the lower-right third — the only color in the entire frame, the bird rendered with photorealistic feather detail in vivid crimson against the white, a line of small footprints in the snow leading from the branch toward the left edge and trailing off into white nothingness, the horizon dissolving seamlessly into the white void above, fine snow particles barely visible drifting in still air, the overwhelming quiet of pure white winter at cosmic scale, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["sound is softening...", "the world is changing...", "let the white take everything..."],
        poetryMood: "dreamy",
        voice: "shimmer",
      },
      transcendence: {
        aiPrompt: "cosmic-scale connected lattice of ice-light and dispersed luminous particles sweeping across infinite black in a vast spiral arc, deep blue and electric purple light pulsing within the nodes, the structure dense and intricate where it crosses the frame but dissolving into scattered particle trails and open void at both edges, the frozen cosmos mid-expansion with fractal ridges and luminous bridges stretching toward infinite darkness, dynamic and powerful, the spiral core upper-right with spiraling streamers reaching across, no trees no roots no plants, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are inside the snow...", "there is only white...", "surrender to the crystal..."],
        poetryMood: "mystical",
        voice: "shimmer",
      },
      illumination: {
        aiPrompt: "vast field of luminous micro-particles suspended in deep blue-black void like frozen starlight at galactic scale, thousands of tiny interconnected points at different depths creating infinite three-dimensional space, the densest cluster along the left edge and lower third with the finest particles scattered rightward into open cosmic darkness, each point catching pale silver and ice-blue light at different angles, faint aurora-like veils of cold green and violet light threading between the clusters, the silence of absolute zero rendered as still light at cosmic scale, asymmetric composition leaving the upper right vast and open, no trees no roots no plants, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["listen to the silence...", "the world is new...", "everything is clean..."],
        poetryMood: "transcendent",
        voice: "shimmer",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, single pine tree branch heavy with snow entering from the upper-right corner and bending gracefully downward under the weight, the branch rendered with photorealistic green needles visible beneath the snow load, the snow catching warm prismatic light — blue and violet at the shadows through rose and gold at the highlights where sunlight hits, ice melting at the branch tips where warmth returns with photorealistic water droplets forming and falling, the droplets catching prismatic color as they detach, fine mist and ice particles dispersing leftward into vast deep indigo-violet negative space filling two-thirds of the frame, the beautiful moment of thaw beginning at impossible scale, no figures no buildings no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["warmth returns...", "home is near...", "the cold made this warmth possible..."],
        poetryMood: "flowing",
        voice: "shimmer",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single small snow-covered stone with one tiny green sprout emerging through the white snow, the stone floating on a fragment of frozen earth in the lower-left corner of vast deep blue-black void, the sprout rendered with photorealistic detail — two tiny pale green leaves unfurling bravely through the ice, a faint warm light seeming to emanate from the sprout itself, the snow on the stone beginning to recede around the green growth, fine water droplets and melting ice particles trailing upward-right in a gentle arc dissolving into infinite darkness, nearly the entire frame is vast dark silence with only this small sign of returning life, the first thaw at impossible scale, no figures no buildings no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, enormous seed pod cracking open in the lower-right third of deep brown-black void, the pod shell rendered with photorealistic dark bark-like texture split along fibonacci spiral lines, but inside the pod instead of seeds there is a miniature world — tiny trees with green canopies, a winding stream of blue-silver water, clusters of wildflowers in white and gold, all contained within the pod shell like a terrarium, warm green-gold light spilling from the interior world into the surrounding darkness, fine spores and tiny flower petals ejecting from the opening along diagonal paths upward-left into vast dark space, the impossible nursery of an entire landscape inside a seed at cosmic scale, two-thirds of the frame open dark void above and left, asymmetric composition with the pod anchored low-right, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["wait for it...", "feel the thaw beginning...", "something stirs beneath..."],
        poetryMood: "melancholic",
        voice: "nova",
      },
      expansion: {
        aiPrompt: "DARK BACKGROUND, giant fiddlehead fern unfurling at cosmic scale from a tight coil in the upper-left corner of deep green-black void, but as each frond unfurls it reveals a different spring scene contained within — one frond opens to show cherry blossoms in pale pink, another reveals meadow wildflowers in gold and white, another shows new translucent green leaves — like pages of a book of spring turning open, the spiral structure following a golden ratio with photorealistic fern texture and translucent hairs along the rachis catching warm gold backlight, fine pollen particles of pale rose and chartreuse dispersing from the unfurling tips rightward and downward into vast dark void filling two-thirds of the frame, the frond architecture impossibly detailed as if viewing a fern the size of a galaxy, asymmetric composition with the coil anchored upper-left, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["it's happening...", "the green is unstoppable...", "everything at once..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      transcendence: {
        aiPrompt: "vast cross-section of vascular architecture rendered at impossible scale against deep black-green void — luminous circular vessels and tubular channels arranged in a designed ring pattern at cosmic scale, each vessel a different size with green-gold bioluminescent fluid flowing through them in visible currents, between the vessels a matrix of cellular forms glowing soft rose-pink and warm gold, fine particles of luminous sap streaming from the vessel ends into surrounding darkness, the living architecture of growth at cosmic scale where each vessel could be a tunnel through a galaxy, asymmetric composition offset lower-left with generous dark void upper-right, no landscape no ground no soil no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["this is what was waiting...", "every cell remembers this...", "the bloom is you..."],
        poetryMood: "transcendent",
        voice: "nova",
      },
      illumination: {
        aiPrompt: "DARK BACKGROUND, field of wildflowers on a floating chunk of meadow earth viewed from within at eye-level with the flower heads, the flowers rendered with photorealistic detail — daisies, poppies in warm red, cornflowers in deep blue, buttercups in bright gold — swaying gently, bees and butterflies visible among the blooms with iridescent wing detail, the earth fragment visible at the edges where the meadow surface drops away revealing soil layers and dangling roots above deep cosmic blue void below, warm golden sunlight illuminating the flowers from the upper-left casting soft shadows, fine pollen particles drifting in the warm light, the meadow anchored across the lower two-thirds with cosmic blue space visible beyond the earth edge, the impossible intimacy of standing in a floating garden at atmospheric scale, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the garden is complete...", "everything is alive...", "rest here in the green..."],
        poetryMood: "flowing",
        voice: "nova",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, dandelion seed-head at macro scale in the right third of deep blue-black void, the sphere of seed-parachutes rendered with photorealistic detail — each individual pappus a perfect radial structure of impossibly fine silver-white filaments, several seeds detaching and drifting leftward and upward into the darkness, each floating seed-parachute catching faint warm gold and spring green light as it separates, the most distant seeds already tiny luminous points dissolving into deep space like newborn stars, fine individual filaments trailing behind each drifting seed, the main seed-head still holding dozens of seeds with the stem visible below, vast quiet dark void filling two-thirds of the frame at left, the beautiful dispersal of life into the cosmos at impossible scale, asymmetric composition weighted right, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the day was full...", "the garden sleeps...", "carry the pollen with you..."],
        poetryMood: "dreamy",
        voice: "nova",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single thin plant stem with one closed bud at its tip rising from a tiny mound of dark rich earth floating in the lower-left corner of absolute black void, the stem rendered in muted olive-green with photorealistic cellular texture, the bud a small tight spiral of pale green and faint rose holding the memory of everything the bloom was inside its folded layers, a single dewdrop clinging to the bud tip catching faint warm prismatic light — a tiny spectrum visible in the drop, nearly the entire frame vast dark silence with only this single living form and its single drop of light, the quiet promise that what bloomed will bloom again at infinite scale, asymmetric composition with the stem small and anchored lower-left, no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "solar corona structure at cosmic scale anchored in the upper-left third of deep warm black void, concentric rings of luminous plasma in molten gold and deep orange with radial tendrils extending outward, the corona surface textured with fibonacci-spiral filaments of white-hot light, fine particles of superheated luminous dust dispersing diagonally downward-right along sweeping arcs into vast open darkness, connected bridges of brilliant light threading between the outermost tendrils, the first heat of the longest day rendered as stellar architecture, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the sun is already here...", "feel the warmth building...", "this is the longest day..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      expansion: {
        aiPrompt: "DARK BACKGROUND, golden wheat field on a floating island of rich dark earth anchored in the lower-right third of deep warm amber-black void, the wheat stalks swaying in invisible wind rendered with photorealistic detail — each head of grain individually visible with golden awns catching warm light, the field ending abruptly at the earth island edge where cross-section of soil layers and dangling roots are visible dropping into darkness below, fine wheat seeds and chaff blowing off the field edge leftward and dispersing into vast deep warm negative space filling the upper two-thirds, warm golden sunlight from the upper-left illuminating the wheat heads, the abundance of midsummer on an impossible floating fragment at atmospheric scale, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the heat carries you...", "let the light fill everything...", "time is slow and golden..."],
        poetryMood: "dreamy",
        voice: "alloy",
      },
      transcendence: {
        aiPrompt: "electromagnetic storm collision at cosmic scale anchored in the center-right of deep black void, a dense gold-and-copper lattice of geometric light-architecture interpenetrated by jagged electric-discharge veins of cobalt blue and white phosphor, the two energy systems fused at impact points glowing white-hot, particle trails of burnt orange sparks streaming diagonally upward-left and electric blue shards dispersing downward-right, the tension of maximum energy rendered as designed interference pattern at cosmic scale, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the storm is coming...", "heat and lightning...", "the fullest moment of the year..."],
        poetryMood: "intense",
        voice: "alloy",
      },
      illumination: {
        aiPrompt: "PURE WHITE BACKGROUND, single ripe peach on a branch with three green leaves floating in the lower-left third of vast brilliant white void, the fruit rendered with impossibly detailed photorealistic texture — warm amber and rose skin with soft fuzz visible, a slight blush of deep crimson at the sun-facing side, the leaves translucent with warm sunlight passing through them revealing their vein structure in vivid green, the branch rendered in warm brown with photorealistic bark texture, a single drop of nectar at the stem junction catching prismatic light, fine particles of warmth barely visible dispersing upward-right into generous pure white negative space filling two-thirds of the frame, simple and perfect — the golden hour captured in a single fruit at impossible scale, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the storm passed...", "golden hour...", "the longest light of the year..."],
        poetryMood: "transcendent",
        voice: "alloy",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, sunset-lit field of lavender on a floating fragment of earth anchored in the upper-right third of deep indigo-violet sky fading to cosmic dark at the edges, the purple flower stalks catching warm amber-gold sunset light with photorealistic detail — individual tiny blossoms visible on each spike, butterflies with delicate wing patterns visiting the flowers, the earth fragment edge visible at the lower portion with soil layers and roots exposed above the void, fine lavender petals and pollen particles detaching and drifting diagonally downward-left into vast deep indigo-violet negative space filling the lower two-thirds, warm amber light mixing with cool violet creating rich color at the flower tips, the last warmth of the longest day at atmospheric scale, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the night is warm...", "fireflies are speaking...", "the longest day ends gently..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      integration: {
        aiPrompt: "DARK BACKGROUND, single firefly glowing warm amber-gold in the lower-right corner of enormous warm dark void, the firefly rendered as a tiny photorealistic insect with translucent wings and a bright bioluminescent abdomen casting the faintest warm halo into the surrounding darkness, barely visible against the infinite night, a faint trail of amber light particles behind it tracing a gentle curved flight path from center-frame toward its current position, nearly the entire frame is vast deep warm negative space with only this single point of summer warmth, the tiniest ember of the longest day persisting against the dark at impossible scale, no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, ancient oak tree branch entering from the right edge of deep umber-black void, the branch rendered with photorealistic gnarled bark texture in dark brown and grey, the leaves along the branch at different stages of turning — deep green at the base nearest the trunk transitioning through gold and warm amber in the middle to deep crimson at the outermost tips, each leaf individually detailed with visible veins and curl, a few leaves detaching from the crimson tips and beginning to fall in slow arcing paths downward-left, fine particles of golden pigment dust trailing from the turning leaves into vast open darkness filling two-thirds of the frame at left, warm side-light catching the translucent amber leaves from behind, the first change of autumn on a single branch at cosmic scale, asymmetric composition weighted right, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the change begins...", "feel the first cool...", "something is ending beautifully..."],
        poetryMood: "melancholic",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "DARK BACKGROUND, cascade of autumn leaves falling through deep cosmic brown-black void from the upper-left corner toward lower-right, each leaf a different species rendered with photorealistic detail — maple leaves in deep crimson, oak leaves in burnt sienna, birch leaves in bright gold, aspen leaves in warm amber — tumbling and rotating in slow motion, warm side-light from the right catching their translucent surfaces and revealing vein structures, the leaves dense and vivid where they enter the frame but spreading and scattering with increasing gaps as they fall, fine particles of leaf-dust and tiny seeds dispersing between the tumbling forms, the lower-right third of the frame open dark void with only the most distant scattered leaves reaching into it, the ecstasy of color released into freefall at atmospheric scale, asymmetric composition sweeping corner to corner, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look at what it becomes...", "the dying is the beauty...", "every leaf is a flame..."],
        poetryMood: "mystical",
        voice: "fable",
      },
      transcendence: {
        aiPrompt: "massive spiraling warm-light column rising from the lower-left edge of the frame through deep charcoal-black void, rendered as billions of luminous particles in deep crimson at the dense base transitioning through amber and gold to pale silver at the dispersing top, the spiral has internal turbulence with darker eddies and brighter vortices creating designed structure within the motion, the upper-right two-thirds open dark atmosphere with only the finest particles reaching into it, the release of everything rendered as a vast ascending spiral of light at cosmic scale, no leaves no trees no landscape no honeycomb no hexagons no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["this is the peak...", "everything releasing at once...", "let go with the leaves..."],
        poetryMood: "transcendent",
        voice: "fable",
      },
      illumination: {
        aiPrompt: "DARK BACKGROUND, bare tree silhouette against deep grey-blue void anchored along the right edge of the frame, the branches forming an elegant network of thin forking limbs with photorealistic weathered bark texture in pale silver-grey, one last leaf still attached to an upper branch — the leaf catching warm amber light and glowing against the cool dark background, a murder of crows taking flight from the upper branches rendered as dark silhouettes at different distances with wings at various positions of flight, the branching pattern elegant and architectural reaching leftward into generous dark emptiness, fine particles of pale bark dust drifting downward from the branch tips, two-thirds of the frame open grey-blue darkness with only scattered crow silhouettes and bark particles, the elegant structure of what remains after all color has fallen, asymmetric composition weighted right with vast void left, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["see the structure...", "what remains is essential...", "the beauty of less..."],
        poetryMood: "melancholic",
        voice: "fable",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, forest floor close-up at cosmic scale floating as a thick shelf of earth in deep brown-black void, the surface covered with layers of fallen leaves in every autumn color — crimson maple and gold birch and brown oak layered and overlapping with photorealistic texture, scattered acorns with their caps among the leaves, tiny mushrooms in cream and pale brown growing from the leaf litter, frost beginning to form at the leaf edges as delicate white ice crystals, the rich decay beautiful and impossibly detailed, the earth shelf anchored across the lower third with soil layers and fine roots visible at the broken edge, vast deep brown-black void above with only a few floating leaf particles, the quiet beauty of the forest floor at impossible scale, asymmetric composition with the shelf low and generous void above, no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the earth is resting...", "rain completes it...", "nothing is lost, only changed..."],
        poetryMood: "flowing",
        voice: "fable",
      },
      integration: {
        aiPrompt: "nearly empty absolute black void with the faintest crystalline frost-light growing in the upper-right corner — precise geometric ice-needle forms of pale blue-white light radiating from a dim warm amber point in a starburst pattern, one hair-thin trail of frost-particle light extending diagonally downward-left and dissolving into darkness, the first cold claiming the last warmth at cosmic scale, nearly the entire frame vast black silence, asymmetric and quiet, no leaves no trees no landscape no honeycomb no hexagons no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP DARK VOID BACKGROUND, frozen lake surface viewed from above floating in absolute black void, the ice rendered with photorealistic translucent texture in pale blue-grey and deep charcoal, a single crack running through the ice from the upper-left third toward center — the crack revealing dark water beneath through the fissure, the ice surface reflecting a faint grey sky, a lone bare tree visible on a tiny distant shore fragment at the far edge of the frozen lake rendered as a dark silhouette, the lake fragment anchored in the lower-right two-thirds with the crack creating asymmetric tension, fine particles of frost and ice dust trailing from the crack edges leftward into vast deep dark negative space filling one-third of the frame, cold and still at impossible scale, the first sign of something breaking beneath the surface, no blood no tears no faces no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["be still...", "let it come...", "you don't have to be strong here..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      expansion: {
        aiPrompt: "DARK BACKGROUND, enormous rock being slowly split apart by tree roots growing through it — the rock anchored in the upper-left third of deep grey-black void, rendered with photorealistic granite texture in dark grey and bruise-violet, thick pale roots forcing their way through widening cracks in the stone with patient vegetable power, the roots rendered with photorealistic bark texture showing fine root-hairs gripping the stone surfaces, dark green moss covering portions of the rock surface in soft velvet patches, tiny fragments of stone falling from the widening cracks and dispersing diagonally downward-right into vast deep grey-black negative space filling the lower two-thirds, connected threads of root tendrils reaching between the separating rock halves, the slow unstoppable force of growth through grief at cosmic scale, no blood no tears no faces no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["feel it...", "the weight is real...", "don't look away..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      transcendence: {
        aiPrompt: "shattering abstract architecture splitting open across the upper-right third of infinite black void — massive cathedral-scale panels of dark translucent form fracturing along geometric stress-lines, raw white wound-light pouring through the widening cracks illuminating the internal structure from within, each fragment retaining precise geometric edges as it separates, fine particles of luminous dust dispersing outward-left from the bright seams, connected remnant filaments still bridging between the separating panels, the moment of breaking rendered as pure abstract light at cosmic scale, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["let it break...", "this is the bottom...", "you are still here..."],
        poetryMood: "intense",
        voice: "onyx",
      },
      illumination: {
        aiPrompt: "DEEP DARK VOID BACKGROUND, ice melting from a frozen flower clustered along the left edge of vast black emptiness — the flower emerging in full color as the ice recedes, deep violet and warm rose petals becoming visible with photorealistic texture as the translucent ice shell retreats, water droplets catching warm amber light where the ice meets the revealed petals, the ice still present at the outer edges in pale blue-grey but retreating toward the tips, the flower stem and two leaves visible below in deep green where already thawed, fine particles of melt-water mist and warm amber light dispersing rightward along gentle curving paths into generous dark negative space filling two-thirds of the frame, the first warmth after frozen grief rendered as a flower emerging from ice at impossible scale, asymmetric composition with quiet transformative power, no blood no tears no faces no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["something shifted...", "the weight is lighter now...", "breathe..."],
        poetryMood: "melancholic",
        voice: "onyx",
      },
      return: {
        aiPrompt: "DARK BACKGROUND, kintsugi bowl floating in deep indigo void — a cracked ceramic bowl repaired with veins of molten gold filling every crack and seam with photorealistic precious-metal texture, but from the golden cracks where the repair lines are, small flowers and soft green moss are growing outward, tiny blooms in pale violet and warm rose emerging from the gold seams, the bowl anchored in the lower-left third with the gold seams glowing warm light that illuminates the tiny garden growing from the wounds, fine particles of warm gold dust and tiny flower petals dispersing upward-right along gentle curving paths into vast generous deep indigo negative space filling the upper two-thirds, the repair becoming a garden at cosmic scale where healing grows beauty from the broken places, no blood no tears no faces no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you carried it...", "the ache is quieter now...", "you are still whole..."],
        poetryMood: "flowing",
        voice: "onyx",
      },
      integration: {
        aiPrompt: "nearly empty vast soft grey-black void with a single quiet point of warm amber light anchored in the lower-left corner, from it the faintest particle trail arcs gently upward-right following a fibonacci curve before dissolving into nothing, the light not a form but a presence — warm against the cold dark, the rest of the frame enormous gentle darkness with only microscopic motes scattered sparsely, the geometry of survival compressed into one quiet glow at impossible scale, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
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
