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
        aiPrompt: "designed bioluminescent filament network entering from the lower right corner against deep brown-black void, phosphorescent green nodes connected by impossibly fine mycelial threads with warm gold light pulsing at the junctions, spore-like particles dispersed along the filament paths into vast dark negative space above and left, cosmic scale where the network could be a galaxy's neural map, asymmetric composition with visual weight low and right, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the spores are waking...", "feel the soil...", "life begins small..."],
        poetryMood: "mystical",
      },
      expansion: {
        aiPrompt: "DEEP BROWN-BLACK BACKGROUND — designed mycelial architecture sweeping diagonally from upper left toward lower right, connected filament forms in fibonacci branching geometry with subtle brown-grey shadows and fine phosphorescent green edges defining the interwoven network against deep earthy darkness, warm gold bioluminescent nodes glowing at the densest intersections in the upper third trailing into scattered spore particles and open dark void below, infinite depth through layered translucent threads, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["it's growing...", "everything connects...", "feel the network..."],
        poetryMood: "mystical",
      },
      transcendence: {
        aiPrompt: "cosmic-scale connected mycelium lattice sweeping across infinite brown-black in a vast branching arc, phosphorescent green and warm gold light pulsing within the nodes, the network dense and intricate where it crosses the frame but dissolving into spore trails and open void at both edges, filament bridges and bioluminescent rays stretching toward infinite darkness, dynamic and alive, composition fills the frame but is not centered — the densest node cluster sits upper right with branching streamers reaching across, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the network...", "all is one organism...", "breathe with the forest..."],
        poetryMood: "transcendent",
      },
      illumination: {
        aiPrompt: "DEEP SOIL-BLACK BACKGROUND — intricate dark filament threads and connected bioluminescent node forms arranged along the left edge and lower third of an immense deep brown-black void, designed mycelial detail like phosphorescent wireframes with dispersed spore particles trailing rightward into open dark space, warm gold light at the network junctions, the design clusters asymmetrically leaving the upper right vast and open, quiet power in the contrast of glowing interwoven organic intricacy against boundless darkness, no mushrooms no plants no landscape, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP BLACK VOID BACKGROUND — designed cosmic dust architecture sweeping diagonally from upper left toward lower right, dissolving particle forms in fibonacci dispersal geometry with subtle silver-grey shadows and fine violet edges defining the unraveling structure against infinite black void, warm gold starlight condensation glowing at the densest remnant regions in the upper third trailing into scattered motes and open darkness below, infinite depth through layered translucent dissolution, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP BLACK VOID BACKGROUND — intricate dark cosmic dust threads and connected starlight condensation nodes arranged along the left edge and lower third of an immense deep black void, designed particle-rebirth detail like silver constellations reforming with dispersed motes trailing rightward into open dark space, warm gold light emerging at the new junctions, the design clusters asymmetrically leaving the upper right vast and open, quiet power in the contrast of luminous interwoven cosmic intricacy against boundless darkness, no planets no earth no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "sparse cluster of ice-white luminous points connected by hair-thin cyan filaments anchored in the upper-left third of absolute black void, the star cluster forming a loose voronoi lattice with deep blue light at the connection nodes and electric violet glow at the densest intersections, fine white particles dispersing downward-right along gentle curved paths into the vast empty black two thirds of the frame, photorealistic crystalline star detail at galactic scale where each node is a sun, asymmetric composition with visual weight high and left, no planets no earth no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["look up...", "the stars are ancient light...", "you are moving without moving..."],
        poetryMood: "dreamy",
        voice: "fable",
      },
      expansion: {
        aiPrompt: "DEEP COSMIC-BLACK BACKGROUND — impossibly designed nebula architecture sweeping diagonally from upper left toward lower right, the gas formations sculptural with fibonacci spiral arms and voronoi cell-walls visible in the luminous vapor, subtle blue-grey shadows and prismatic cyan edges defining the nebula structure against deep interstellar darkness, warm gold and rose light glowing from the densest star-forming regions, the upper third dense with sculptural gas detail trailing into scattered luminous particles and open dark void below, infinite cosmic depth through layered translucency, no planets no earth no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP COSMIC-BLACK BACKGROUND — intricate dark filament structures and connected luminous gas-forms arranged along the left edge and lower third of an immense deep indigo-black void, supernova remnant architecture with geometric internal structure, dispersed golden star-particles trailing rightward into open dark space, cool indigo shadows on the filament surfaces, an infinite cosmic quality to the vast darkness above, the design clusters asymmetrically leaving the upper right open and boundless, quiet power in the contrast of luminous intricacy against infinite deep darkness, no planets no earth no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "massive dark stone archway floating in deep black void, the doorway impossibly tall and narrow with worn edges and faint emerald light spilling from beyond the threshold, the arch anchored in the lower-right third of the frame tilted slightly as if gravity works differently here, fine dust motes drifting through the opening caught in the green light, beyond the doorway a second smaller doorway visible and beyond that a third — each one offset at a different angle suggesting a path that keeps turning, vast empty darkness surrounding the lone arch on all sides, photorealistic weathered stone texture at cosmic scale where the doorway is light-years tall, asymmetric composition with the arch low-right and generous void upper-left, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["enter...", "every direction is the same...", "the walls are listening..."],
        poetryMood: "hypnotic",
      },
      expansion: {
        aiPrompt: "dozens of doorways and tunnel openings of vastly different sizes scattered across deep charcoal-black infinite space, some doorways massive and close with warm amber light pouring from them, others tiny and distant with cold cyan glow, the openings are round arched rectangular oval — no two alike — floating at impossible angles some upside-down some sideways, dark tunnels visible receding behind several of the larger openings curving away into unseen depths, each doorway seems to lead somewhere different but you cannot tell where, fine luminous particles streaming in conflicting directions between the openings as if each doorway has its own gravity, the cluster of doorways densest in the left third trailing into scattered distant openings and vast dark void rightward, photorealistic stone and light textures at impossible scale, asymmetric composition offset left with generous darkness right, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are lost...", "this is where you belong...", "deeper..."],
        poetryMood: "hypnotic",
      },
      transcendence: {
        aiPrompt: "infinite tunnel within tunnel within tunnel — looking through a massive dark archway that frames a second archway that frames a third and a fourth receding into impossible recursive depth against deep indigo-black cosmos, each tunnel a different shape and material so the nesting feels surreal not repetitive — rough stone then smooth obsidian then translucent glass then living shadow, emerald and violet light pulsing at different depths creating a rhythmic glow that draws the eye inward, the outermost arch entering from the upper-right edge of the frame at an angle with the recursive tunnel-sequence spiraling slightly as it recedes, fine particles orbiting the tunnel mouths in confused spirals, vast open void filling the lower-left two thirds with only scattered light-motes, photorealistic detail at galactic scale where each tunnel opening could swallow solar systems, asymmetric composition with the tunnel sequence cropped upper-right, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the labyrinth...", "there is no exit because there is no inside...", "the center is everywhere..."],
        poetryMood: "mystical",
      },
      illumination: {
        aiPrompt: "vast network of translucent doorways connected by faintly glowing passage-threads in deep black-violet infinite space, the doorways now transparent glass-like arches revealing that every opening leads to every other opening through curving tunnel-threads that bend through hidden dimensions, warm gold light flowing along the connecting threads like signals traveling between portals, the network stretching in all directions with the nearest doorways large and detailed in the left third and the farthest ones microscopic points of light in the distant right void, the revelation that being lost was an illusion — every threshold connects, emerald and amber light at the major portal-nodes with fine particle threads tracing paths between them, photorealistic glass and light textures at impossible cosmic scale, asymmetric composition with density left and generous dark space right, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the pattern reveals itself...", "you were never lost...", "the maze is the map of your mind..."],
        poetryMood: "mystical",
      },
      return: {
        aiPrompt: "doorways fading — several translucent archways in the right third of the frame losing their solidity and becoming smoke-like outlines of emerald and amber drifting apart in deep blue-black void, the tunnel-threads between them dissolving into wisps, one doorway still solid with warm golden light beyond it — the way through — while the others evaporate around it, fine particles of dissolved portal-material dispersing upward into vast dark space, the openings that once multiplied now simplifying down to this single clear threshold, vast open darkness filling the left two thirds, photorealistic smoke and light textures at cosmic scale, asymmetric composition weighted right with generous void left, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the walls are thinning...", "you chose a direction and it is right...", "the path appears..."],
        poetryMood: "flowing",
      },
      integration: {
        aiPrompt: "single faint archway of soft emerald light hovering small in the lower-left region of absolute black infinite void, the last doorway — its edges barely visible like a memory of a threshold, the faintest suggestion of golden warmth beyond it fading, gossamer wisps trailing from its outline upward-right and dissolving into nothing, nearly the entire frame vast empty silent cosmos with only microscopic luminous motes scattered like distant stars, the doorway not an exit but the quiet knowledge that you passed through something immense, photorealistic light-edge detail against infinite dark, asymmetric composition with the archway small and anchored lower-left, no maze walls no labyrinth no hedge no grid no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP MIDNIGHT-BLACK BACKGROUND — impossible crystalline ridge architecture sweeping diagonally from lower left toward upper right in a steep ascending arc, the formations sculptural and designed with fibonacci stacking layers and voronoi fracture-patterns visible in the translucent ice-stone, subtle blue-grey shadows and fine dark edges defining the ascending structure against deep alpine darkness, the densest detail in the lower third trailing into scattered mineral particles and open dark void above, infinite atmospheric depth through layered translucency, the visual sensation of climbing without earth, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP ALPINE-BLACK BACKGROUND — intricate dark crystal-thread forms and connected atmospheric ridge-structures arranged along the left edge and lower third of an immense deep midnight-black void, the summit-architecture sculptural and impossible with internal geometric facets, dispersed golden particles trailing rightward into open dark space, cool blue shadows on the crystalline surfaces, an infinite quality to the vast darkness above like altitude made visible, the design clusters asymmetrically leaving the upper right open and boundless, no trees no ground no horizon no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP WARM DARK VOID BACKGROUND, delicate rose-gold and warm amber voronoi lattice stretching from the right edge inward occupying only the right third of the frame, each voronoi cell contains fine copper wire substructure, tiny amber particles drift leftward along horizontal paths dissolving into vast deep warm dark negative space, photorealistic gossamer metallic mesh at nebula scale floating in deep warm darkness, expansive openness with structure receding, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the horizon retreats...", "emptiness is freedom...", "the sand knows your footsteps..."],
        poetryMood: "mystical",
        voice: "nova",
      },
      transcendence: {
        aiPrompt: "DEEP WARM DARK VOID BACKGROUND, near-total dissolution into deep warm dark void, only the faintest trace of a single copper-amber filament curving from the upper-left corner downward in a fibonacci arc, the filament breaks apart into microscopic ember-warm and pale gold particles that scatter and vanish into pure deep darkness, photorealistic impossible depth, the most abstract phase pure dark emptiness with almost nothing remaining, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["you are the desert...", "emptiness is fullness...", "the light is everything..."],
        poetryMood: "transcendent",
        voice: "nova",
      },
      illumination: {
        aiPrompt: "DEEP WARM DARK VOID BACKGROUND, constellation of tiny deep indigo and copper points clustered in the upper-right corner connected by hairline rose-gold bridges forming a sparse connected lattice, fine indigo particles trail downward-left along curving paths into vast deep warm dark negative space filling three-quarters of the frame, photorealistic crystalline points like distant stars seen through dark atmosphere, reversal from void into first points of structure, no sand dunes no desert no landscape no figures no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP DARK INDIGO-BLACK BACKGROUND, hexagonal honeycomb lattice of fine brown-black wireframe stretching from the left edge inward occupying only the left third, each hexagonal cell contains smaller recursive hexagons at fractal depth with warm amber light at the deepest centers, faint blue-green luminescence at sparse junction points, fine aged-ivory particles drift rightward along horizontal paths dissolving into vast deep indigo-black negative space, photorealistic architectural wireframe at cathedral scale, recursive geometric chambers receding infinitely, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP DARK INDIGO-BLACK BACKGROUND, symmetrical pair of small intricate lattice-forms mirroring each other across a vertical axis anchored in the lower-left third, each form built from interwoven copper and deep brown geometric threads with faint blue-green light at the mirroring plane between them, fine amber particles dispersing upward-right along curving fibonacci paths into vast deep indigo-black negative space filling three-quarters of the frame, photorealistic polished bronze textures reflecting each other at impossible scale, the pattern recognizing itself, no books no text no pages no shelves no figures no letters no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DARK BACKGROUND, interconnected lattice of golden filaments and amber nodes clustered in the upper-left third of the frame against deep warm black void, the lattice designed with radiating spoke geometry like a sundial mechanism rendered in photorealistic brushed copper and molten gold, fine particles of warm amber dispersing diagonally downward-right along sweeping curves into the vast open darkness that fills two-thirds of the frame, connected bridges of deep gold light threading between the lattice nodes, the first heat rendered as architectural pressure building inside designed containment, cosmic scale as if viewing a star igniting from within its corona, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
        guidancePhrases: ["the sun is already here...", "feel the warmth building...", "this is the longest day..."],
        poetryMood: "flowing",
        voice: "alloy",
      },
      expansion: {
        aiPrompt: "DEEP WARM AMBER-BLACK VOID BACKGROUND, vast heat-shimmer lattice of interwoven amber and deep gold filaments radiating from the lower-right corner across a deep warm amber-black void, the structure built from voronoi tessellation with photorealistic molten-metal texture at each cell wall, copper light refracting through the thinnest membranes, fine burnt-orange particles dispersing along the lattice arms trailing upward-left into the enormous open deep amber-dark space that fills the upper two-thirds of the frame, each node pulsing with internal golden warmth, the shimmer distortion rendered as geometric wavefront interference patterns, impossible atmospheric scale like viewing solar convection from within, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP WARM AMBER-BLACK VOID BACKGROUND, delicate web of golden-hour filaments in warm amber and soft copper arranged along the lower-left edge and bottom third of an immense deep warm amber-black void, the web designed with fibonacci curve geometry and photorealistic spun-glass texture catching pale rose and gold refractions, fine particles of amber dust settling downward from the web into gentle vertical drift paths, the upper-right two-thirds of the frame is vast breathing amber-dark emptiness with only scattered individual gold motes suspended in stillness, connected bridges of the thinnest copper thread spanning between web clusters, the peace after intensity rendered as delicate mathematical architecture at atmospheric scale, no sun no sky no landscape no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP DARK VOID BACKGROUND — a single thin fracture-line structure in bruise violet drifting in the lower-right corner, fine hair-like filaments trailing leftward into generous dark emptiness, photorealistic crystalline pressure-texture at impossible scale, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
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
        aiPrompt: "DEEP DARK VOID BACKGROUND — cluster of dark fracture-forms along the left edge with warm amber light glowing through their internal seams, the wound-structures interwoven and designed like damaged architecture healing, fine particles of amber and violet dispersing rightward into vast dark emptiness, quiet sculptural power against boundless deep darkness, no blood no tears no faces no figures, no text no signatures no watermarks no letters no writing",
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
