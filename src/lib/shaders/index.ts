import { FRAG as FOG_FRAG } from "./fog";
import { FRAG as STORM_FRAG } from "./storm";
import { FRAG as DUSK_FRAG } from "./dusk";
import { FRAG as SNOW_FRAG } from "./snow";
import { FRAG as OCEAN_FRAG } from "./ocean";
import { FRAG as CASCADE_FRAG } from "./cascade";
import { FRAG as WHIRLPOOL_FRAG } from "./whirlpool";
import { FRAG as CURRENT_FRAG } from "./current";
import { FRAG as DELTA_FRAG } from "./delta";
import { FRAG as FLUX_FRAG } from "./flux";
import { FRAG as MANDALA_FRAG } from "./mandala";
import { FRAG as COSMOS_FRAG } from "./cosmos";
import { FRAG as NEON_FRAG } from "./neon";
import { FRAG as LIQUID_FRAG } from "./liquid";
import { FRAG as SACRED_FRAG } from "./sacred";
import { FRAG as ETHEREAL_FRAG } from "./ethereal";
import { FRAG as FRACTAL_FRAG } from "./fractal";
import { FRAG as WARP_FRAG } from "./warp";
import { FRAG as PRISMATIC_FRAG } from "./prismatic";
import { FRAG as VOID_FRAG } from "./void";
import { FRAG as MYCELIUM_FRAG } from "./mycelium";
import { FRAG as TESSERACT_FRAG } from "./tesseract";
import { FRAG as DISSOLUTION_FRAG } from "./dissolution";
import { FRAG as ASTRAL_FRAG } from "./astral";
import { FRAG as HORIZON_FRAG } from "./horizon";
import { FRAG as ABYSS_FRAG } from "./abyss";
import { FRAG as TEMPLE_FRAG } from "./temple";
import { FRAG as EMBER_FRAG } from "./ember";
import { FRAG as MERIDIAN_FRAG } from "./meridian";
import { FRAG as TIDE_FRAG } from "./tide";
import { FRAG as MONOLITH_FRAG } from "./monolith";
import { FRAG as OBSIDIAN_FRAG } from "./obsidian";
import { FRAG as CRYPT_FRAG } from "./crypt";
import { FRAG as PHANTOM_FRAG } from "./phantom";
import { FRAG as WRAITH_FRAG } from "./wraith";
import { FRAG as UMBRA_FRAG } from "./umbra";
import { FRAG as CHASM_FRAG } from "./chasm";
import { FRAG as INFERNO_FRAG } from "./inferno";
import { FRAG as PLASMA_FRAG } from "./plasma";
import { FRAG as TORRENT_FRAG } from "./torrent";
import { FRAG as PULSAR_FRAG } from "./pulsar";
import { FRAG as QUASAR_FRAG } from "./quasar";
import { FRAG as SUPERNOVA_FRAG } from "./supernova";
import { FRAG as NEBULA_FRAG } from "./nebula";
import { FRAG as SINGULARITY_FRAG } from "./singularity";
import { FRAG as STARDUST_FRAG } from "./stardust";
import { FRAG as CORONA_FRAG } from "./corona";
import { FRAG as SOLSTICE_FRAG } from "./solstice";
import { FRAG as DRIFT_FRAG } from "./drift";
import { FRAG as EXPANSE_FRAG } from "./expanse";
// Visionary
import { FRAG as SIGIL_FRAG } from "./sigil";
import { FRAG as PORTAL_FRAG } from "./portal";
import { FRAG as ORACLE_FRAG } from "./oracle";
import { FRAG as REVELATION_FRAG } from "./revelation";
import { FRAG as THRESHOLD_FRAG } from "./threshold";
import { FRAG as ASCENSION_FRAG } from "./ascension";
import { FRAG as ECLIPSE_FRAG } from "./eclipse";
import { FRAG as RAPTURE_FRAG } from "./rapture";
import { FRAG as PROPHECY_FRAG } from "./prophecy";
import { FRAG as GLYPH_FRAG } from "./glyph";
// Organic
import { FRAG as MOSS_FRAG } from "./moss";
import { FRAG as CORAL_FRAG } from "./coral";
import { FRAG as BLOOM_FRAG } from "./bloom";
import { FRAG as SPORE_FRAG } from "./spore";
import { FRAG as CHRYSALIS_FRAG } from "./chrysalis";
import { FRAG as PLANKTON_FRAG } from "./plankton";
import { FRAG as LICHEN_FRAG } from "./lichen";
import { FRAG as DENDRITE_FRAG } from "./dendrite";
import { FRAG as MEMBRANE_FRAG } from "./membrane";
import { FRAG as GROWTH_FRAG } from "./growth";
// Geometry
import { FRAG as LATTICE_FRAG } from "./lattice";
import { FRAG as HELIX_FRAG } from "./helix";
import { FRAG as WEAVE_FRAG } from "./weave";
import { FRAG as PRISM_FRAG } from "./prism";
import { FRAG as SPIRAL_FRAG } from "./spiral";
import { FRAG as TORUS_FRAG } from "./torus";
import { FRAG as FIBONACCI_FRAG } from "./fibonacci";
import { FRAG as GEODESIC_FRAG } from "./geodesic";
import { FRAG as PENROSE_FRAG } from "./penrose";
import { FRAG as MOIRE_FRAG } from "./moire";
import type { VisualizerMode } from "@/lib/audio/vibe-detection";

export const SHADERS: Partial<Record<VisualizerMode, string>> = {
  fog: FOG_FRAG,
  storm: STORM_FRAG,
  dusk: DUSK_FRAG,
  snow: SNOW_FRAG,
  ocean: OCEAN_FRAG,
  cascade: CASCADE_FRAG,
  whirlpool: WHIRLPOOL_FRAG,
  current: CURRENT_FRAG,
  delta: DELTA_FRAG,
  flux: FLUX_FRAG,
  mandala: MANDALA_FRAG,
  cosmos: COSMOS_FRAG,
  neon: NEON_FRAG,
  liquid: LIQUID_FRAG,
  sacred: SACRED_FRAG,
  ethereal: ETHEREAL_FRAG,
  fractal: FRACTAL_FRAG,
  warp: WARP_FRAG,
  prismatic: PRISMATIC_FRAG,
  void: VOID_FRAG,
  mycelium: MYCELIUM_FRAG,
  tesseract: TESSERACT_FRAG,
  dissolution: DISSOLUTION_FRAG,
  astral: ASTRAL_FRAG,
  horizon: HORIZON_FRAG,
  abyss: ABYSS_FRAG,
  temple: TEMPLE_FRAG,
  ember: EMBER_FRAG,
  meridian: MERIDIAN_FRAG,
  tide: TIDE_FRAG,
  monolith: MONOLITH_FRAG,
  obsidian: OBSIDIAN_FRAG,
  crypt: CRYPT_FRAG,
  phantom: PHANTOM_FRAG,
  wraith: WRAITH_FRAG,
  umbra: UMBRA_FRAG,
  chasm: CHASM_FRAG,
  inferno: INFERNO_FRAG,
  plasma: PLASMA_FRAG,
  torrent: TORRENT_FRAG,
  pulsar: PULSAR_FRAG,
  quasar: QUASAR_FRAG,
  supernova: SUPERNOVA_FRAG,
  nebula: NEBULA_FRAG,
  singularity: SINGULARITY_FRAG,
  stardust: STARDUST_FRAG,
  corona: CORONA_FRAG,
  solstice: SOLSTICE_FRAG,
  drift: DRIFT_FRAG,
  expanse: EXPANSE_FRAG,
  // Visionary
  sigil: SIGIL_FRAG,
  portal: PORTAL_FRAG,
  oracle: ORACLE_FRAG,
  revelation: REVELATION_FRAG,
  threshold: THRESHOLD_FRAG,
  ascension: ASCENSION_FRAG,
  eclipse: ECLIPSE_FRAG,
  rapture: RAPTURE_FRAG,
  prophecy: PROPHECY_FRAG,
  glyph: GLYPH_FRAG,
  // Organic
  moss: MOSS_FRAG,
  coral: CORAL_FRAG,
  bloom: BLOOM_FRAG,
  spore: SPORE_FRAG,
  chrysalis: CHRYSALIS_FRAG,
  plankton: PLANKTON_FRAG,
  lichen: LICHEN_FRAG,
  dendrite: DENDRITE_FRAG,
  membrane: MEMBRANE_FRAG,
  growth: GROWTH_FRAG,
  // Geometry
  lattice: LATTICE_FRAG,
  helix: HELIX_FRAG,
  weave: WEAVE_FRAG,
  prism: PRISM_FRAG,
  spiral: SPIRAL_FRAG,
  torus: TORUS_FRAG,
  fibonacci: FIBONACCI_FRAG,
  geodesic: GEODESIC_FRAG,
  penrose: PENROSE_FRAG,
  moire: MOIRE_FRAG,
};

export interface ModeMeta {
  mode: VisualizerMode;
  label: string;
  category: "Visionary" | "Cosmic" | "Organic" | "Geometry" | "3D Worlds" | "AI Imagery" | "Elemental" | "Dark";
}

export const MODE_META: ModeMeta[] = [
  // Visionary
  { mode: "prismatic", label: "Prismatic", category: "Visionary" },
  { mode: "dissolution", label: "Dissolution", category: "Visionary" },
  { mode: "mandala", label: "Mandala", category: "Visionary" },
  { mode: "astral", label: "Astral", category: "Visionary" },
  { mode: "temple", label: "Temple", category: "Visionary" },
  { mode: "sigil", label: "Sigil", category: "Visionary" },
  { mode: "portal", label: "Portal", category: "Visionary" },
  { mode: "oracle", label: "Oracle", category: "Visionary" },
  { mode: "revelation", label: "Revelation", category: "Visionary" },
  { mode: "threshold", label: "Threshold", category: "Visionary" },
  { mode: "ascension", label: "Ascension", category: "Visionary" },
  { mode: "eclipse", label: "Eclipse", category: "Visionary" },
  { mode: "rapture", label: "Rapture", category: "Visionary" },
  { mode: "prophecy", label: "Prophecy", category: "Visionary" },
  { mode: "glyph", label: "Glyph", category: "Visionary" },
  // Cosmic
  { mode: "cosmos", label: "Cosmos", category: "Cosmic" },
  { mode: "void", label: "Void", category: "Cosmic" },
  { mode: "warp", label: "Warp", category: "Cosmic" },
  { mode: "fractal", label: "Fractal", category: "Cosmic" },
  { mode: "horizon", label: "Horizon", category: "Cosmic" },
  { mode: "abyss", label: "Abyss", category: "Cosmic" },
  { mode: "pulsar", label: "Pulsar", category: "Cosmic" },
  { mode: "quasar", label: "Quasar", category: "Cosmic" },
  { mode: "supernova", label: "Supernova", category: "Cosmic" },
  { mode: "nebula", label: "Nebula", category: "Cosmic" },
  { mode: "singularity", label: "Singularity", category: "Cosmic" },
  { mode: "stardust", label: "Stardust", category: "Cosmic" },
  { mode: "corona", label: "Corona", category: "Cosmic" },
  { mode: "solstice", label: "Solstice", category: "Cosmic" },
  { mode: "drift", label: "Drift", category: "Cosmic" },
  { mode: "expanse", label: "Expanse", category: "Cosmic" },
  // Organic
  { mode: "liquid", label: "Liquid", category: "Organic" },
  { mode: "mycelium", label: "Mycelium", category: "Organic" },
  { mode: "ethereal", label: "Entity", category: "Organic" },
  { mode: "ember", label: "Ember", category: "Organic" },
  { mode: "tide", label: "Tide", category: "Organic" },
  { mode: "moss", label: "Moss", category: "Organic" },
  { mode: "coral", label: "Coral", category: "Organic" },
  { mode: "bloom", label: "Bloom", category: "Organic" },
  { mode: "spore", label: "Spore", category: "Organic" },
  { mode: "chrysalis", label: "Chrysalis", category: "Organic" },
  { mode: "plankton", label: "Plankton", category: "Organic" },
  { mode: "lichen", label: "Lichen", category: "Organic" },
  { mode: "dendrite", label: "Dendrite", category: "Organic" },
  { mode: "membrane", label: "Membrane", category: "Organic" },
  { mode: "growth", label: "Growth", category: "Organic" },
  // Geometry
  { mode: "sacred", label: "Sacred", category: "Geometry" },
  { mode: "tesseract", label: "Tesseract", category: "Geometry" },
  { mode: "neon", label: "Neon", category: "Geometry" },
  { mode: "meridian", label: "Meridian", category: "Geometry" },
  { mode: "lattice", label: "Lattice", category: "Geometry" },
  { mode: "helix", label: "Helix", category: "Geometry" },
  { mode: "weave", label: "Weave", category: "Geometry" },
  { mode: "prism", label: "Prism", category: "Geometry" },
  { mode: "spiral", label: "Spiral", category: "Geometry" },
  { mode: "torus", label: "Torus", category: "Geometry" },
  { mode: "fibonacci", label: "Fibonacci", category: "Geometry" },
  { mode: "geodesic", label: "Geodesic", category: "Geometry" },
  { mode: "penrose", label: "Penrose", category: "Geometry" },
  { mode: "moire", label: "Moire", category: "Geometry" },
  // 3D Worlds
  { mode: "orb", label: "Orb", category: "3D Worlds" },
  { mode: "field", label: "Field", category: "3D Worlds" },
  { mode: "rings", label: "Rings", category: "3D Worlds" },
  { mode: "aurora", label: "Aurora", category: "3D Worlds" },
  { mode: "totem", label: "Totem", category: "3D Worlds" },
  { mode: "wormhole", label: "Wormhole", category: "3D Worlds" },
  // Elemental
  { mode: "fog",       label: "Fog",       category: "Elemental" },
  { mode: "storm",     label: "Storm",     category: "Elemental" },
  { mode: "dusk",      label: "Dusk",      category: "Elemental" },
  { mode: "snow",      label: "Snow",      category: "Elemental" },
  { mode: "ocean",     label: "Ocean",     category: "Elemental" },
  { mode: "cascade",   label: "Cascade",   category: "Elemental" },
  { mode: "whirlpool", label: "Whirlpool", category: "Elemental" },
  { mode: "current",   label: "Current",   category: "Elemental" },
  { mode: "delta",     label: "Delta",     category: "Elemental" },
  { mode: "flux",      label: "Flux",      category: "Elemental" },
  // Dark
  { mode: "monolith", label: "Monolith", category: "Dark" },
  { mode: "obsidian", label: "Obsidian", category: "Dark" },
  { mode: "crypt",    label: "Crypt",    category: "Dark" },
  { mode: "phantom",  label: "Phantom",  category: "Dark" },
  { mode: "wraith",   label: "Wraith",   category: "Dark" },
  { mode: "umbra",    label: "Umbra",    category: "Dark" },
  { mode: "chasm",    label: "Chasm",    category: "Dark" },
  { mode: "inferno",  label: "Inferno",  category: "Dark" },
  { mode: "plasma",   label: "Plasma",   category: "Dark" },
  { mode: "torrent",  label: "Torrent",  category: "Dark" },
  // AI Imagery — no shader, pure AI-generated visuals
  { mode: "dreamscape", label: "Dreamscape", category: "AI Imagery" },
  { mode: "visions", label: "Visions", category: "AI Imagery" },
  { mode: "morphic", label: "Morphic", category: "AI Imagery" },
  { mode: "liminal", label: "Liminal", category: "AI Imagery" },
  { mode: "cathedral", label: "Cathedral", category: "AI Imagery" },
  { mode: "tundra", label: "Tundra", category: "AI Imagery" },
  { mode: "canyon", label: "Canyon", category: "AI Imagery" },
  { mode: "cavern", label: "Cavern", category: "AI Imagery" },
  { mode: "glacier", label: "Glacier", category: "AI Imagery" },
  { mode: "volcano", label: "Volcano", category: "AI Imagery" },
  { mode: "jungle", label: "Jungle", category: "AI Imagery" },
  { mode: "seafloor", label: "Seafloor", category: "AI Imagery" },
  { mode: "summit", label: "Summit", category: "AI Imagery" },
  { mode: "fjord", label: "Fjord", category: "AI Imagery" },
  { mode: "mesa", label: "Mesa", category: "AI Imagery" },
  { mode: "ruins", label: "Ruins", category: "AI Imagery" },
  { mode: "monastery", label: "Monastery", category: "AI Imagery" },
  { mode: "observatory", label: "Observatory", category: "AI Imagery" },
  { mode: "fortress", label: "Fortress", category: "AI Imagery" },
  { mode: "colosseum", label: "Colosseum", category: "AI Imagery" },
  { mode: "catacombs", label: "Catacombs", category: "AI Imagery" },
  { mode: "sanctuary", label: "Sanctuary", category: "AI Imagery" },
  { mode: "ziggurat", label: "Ziggurat", category: "AI Imagery" },
  { mode: "mirror", label: "Mirror", category: "AI Imagery" },
  { mode: "recursive", label: "Recursive", category: "AI Imagery" },
  { mode: "mobius", label: "Mobius", category: "AI Imagery" },
  { mode: "hypercube", label: "Hypercube", category: "AI Imagery" },
  { mode: "chronos", label: "Chronos", category: "AI Imagery" },
  { mode: "parallax", label: "Parallax", category: "AI Imagery" },
  { mode: "olympus", label: "Olympus", category: "AI Imagery" },
  { mode: "valhalla", label: "Valhalla", category: "AI Imagery" },
  { mode: "elysium", label: "Elysium", category: "AI Imagery" },
  { mode: "avalon", label: "Avalon", category: "AI Imagery" },
  { mode: "nirvana", label: "Nirvana", category: "AI Imagery" },
  { mode: "purgatorio", label: "Purgatorio", category: "AI Imagery" },
  { mode: "solitude", label: "Solitude", category: "AI Imagery" },
  { mode: "ecstasy", label: "Ecstasy", category: "AI Imagery" },
  { mode: "wonder", label: "Wonder", category: "AI Imagery" },
  { mode: "serenity", label: "Serenity", category: "AI Imagery" },
  { mode: "fury", label: "Fury", category: "AI Imagery" },
  { mode: "cenote", label: "Cenote", category: "AI Imagery" },
  { mode: "pantheon", label: "Pantheon", category: "AI Imagery" },
  { mode: "bioluminescence", label: "Bioluminescence", category: "AI Imagery" },
  { mode: "petrified", label: "Petrified", category: "AI Imagery" },
  { mode: "monochrome", label: "Monochrome", category: "AI Imagery" },
];

export const MODE_CATEGORIES = ["Visionary", "Cosmic", "Organic", "Geometry", "3D Worlds", "Elemental", "Dark", "AI Imagery"] as const;

export const MODES_3D: Set<string> = new Set(["orb", "field", "rings", "aurora", "totem", "wormhole"]);

/** AI-only modes — no shader rendered, AI images are the sole visual */
export const MODES_AI: Set<string> = new Set([
  "dreamscape", "visions", "morphic", "liminal", "cathedral",
  "tundra", "canyon", "cavern", "glacier", "volcano",
  "jungle", "seafloor", "summit", "fjord", "mesa",
  "ruins", "monastery", "observatory", "fortress", "colosseum",
  "catacombs", "sanctuary", "ziggurat", "mirror", "recursive",
  "mobius", "hypercube", "chronos", "parallax", "olympus",
  "valhalla", "elysium", "avalon", "nirvana", "purgatorio",
  "solitude", "ecstasy", "wonder", "serenity", "fury",
  "cenote", "pantheon", "bioluminescence", "petrified", "monochrome",
]);

/** AI prompt templates for each AI-only mode */
export const AI_MODE_PROMPTS: Record<string, string> = {
  dreamscape: "surreal dreamlike landscape, flowing organic forms, luminous clouds, impossible architecture, otherworldly beauty, painted light, ethereal mist",
  visions: "infinite depth of field, light at the end of an impossibly long passage, sacred geometry emerging from darkness at vast distance, volumetric fog receding forever, cinematic photorealistic, the feeling of looking into eternity",
  morphic: "morphing organic abstract forms, continuous fluid transformation, biomorphic shapes, iridescent colors shifting, living breathing patterns, cellular and cosmic",
  liminal: "vast empty threshold space, infinite corridor stretching into warm distant light, pools of golden light on dark floors, between worlds, photorealistic architecture of silence, liminal, the space between sleeping and waking",
  cathedral: "infinite vaulted ceiling receding into light, impossibly tall stone columns vanishing upward forever, shafts of warm light falling through vast darkness, photorealistic sacred architecture at impossible scale, the interior of something too large to comprehend",
  tundra: "infinite frozen tundra stretching to every horizon, pale blue ice meeting white sky with no visible boundary, lone dark shapes at impossible distance, photorealistic arctic wasteland, the silence of absolute cold extending forever",
  canyon: "infinite layered canyon walls descending into warm shadow, geological strata in amber and rust receding endlessly downward, light catching the highest edges, photorealistic impossible depth, a wound in the earth with no bottom",
  cavern: "infinite underground cavern with bioluminescent light on wet stone, stalactites descending from darkness above into darkness below, reflections in still black water stretching forever, photorealistic subterranean infinity",
  glacier: "infinite glacier field stretching to vanishing point, deep blue crevasses descending into pure darkness, light trapped inside ancient ice, photorealistic frozen infinity, time made visible in compressed layers",
  volcano: "infinite volcanic landscape, rivers of molten lava branching into darkness, obsidian plains stretching to a red horizon, ash falling forever through orange light, photorealistic infernal geology at impossible scale",
  jungle: "infinite dense canopy receding into mist, shafts of golden light descending through infinite layers of leaves, roots and vines creating architecture at impossible depth, photorealistic primordial overgrowth without end",
  seafloor: "infinite deep ocean floor, bioluminescent creatures drifting through absolute darkness at vast distance, hydrothermal vents sending light upward into infinite black water, photorealistic abyssal depth, life in the deepest darkness",
  summit: "infinite mountain summit above an ocean of clouds, peaks emerging from white mist at every distance, golden light on snow at impossible altitude, photorealistic view from the top of everything, breathing the edge of space",
  fjord: "infinite fjord carved between vertical cliff walls vanishing into mist, still dark water reflecting infinite sky, waterfalls descending from impossible heights, photorealistic Norse infinity, stone and water and silence forever",
  mesa: "infinite flat-topped plateaus receding across a vast desert plain, each one smaller in perfect atmospheric perspective, warm light casting infinite shadows, photorealistic geological infinity, monuments of deep time",
  ruins: "infinite crumbling ancient ruins overgrown with moss and time, columns and arches receding into mist at every angle, light falling through broken ceilings onto floors no one has walked, photorealistic archaeological infinity",
  monastery: "infinite stone cloister corridors receding in perfect perspective, warm candlelight on ancient walls, archways opening onto archways forever, photorealistic contemplative architecture, silence built from stone and centuries",
  observatory: "infinite observatory dome open to a sky dense with stars, massive telescope pointing into endless depth, rings of instruments receding into darkness, photorealistic scientific cathedral, humanity reaching toward infinite cosmos",
  fortress: "infinite fortress walls and towers receding across a twilight landscape, each rampart smaller in the distance, torchlight on ancient stone extending forever, photorealistic military infinity, the architecture of eternal vigilance",
  colosseum: "infinite amphitheater tiers ascending into clouds, empty stone seats receding upward and outward forever, light falling onto an arena floor far below, photorealistic ancient scale beyond comprehension",
  catacombs: "infinite underground tunnels lined with ancient bones and candlelight, passages branching at every junction into warm darkness, memento mori stretching back through centuries, photorealistic sacred mortality at infinite depth",
  sanctuary: "infinite sacred interior space, golden light descending through impossibly tall windows, floor reflecting infinity, air thick with motes of dust catching light, photorealistic divine architecture, a room too holy to measure",
  ziggurat: "infinite stepped pyramid ascending into clouds, each terrace smaller and more ancient, warm stone against infinite blue sky, tiny figures ascending endless stairs, photorealistic Mesopotamian infinity, the stairway between earth and heaven",
  mirror: "infinite reflections receding into warm darkness, each reflection slightly different and further away, the self dissolving into infinite copies, photorealistic recursive identity, mirrors facing mirrors forever",
  recursive: "infinite recursive frames-within-frames, each containing a smaller version of the scene, zooming deeper forever, warm light at the center of infinite nesting, photorealistic mathematical infinity made visible",
  mobius: "infinite Mobius strip surface curving through space, walking forever and arriving where you began, impossible geometry made tangible, warm light on a surface with only one side, photorealistic topological infinity",
  hypercube: "infinite four-dimensional cube rotating through three-dimensional space, edges and vertices creating impossible depth, light refracting through dimensions we cannot name, photorealistic higher-dimensional geometry",
  chronos: "infinite visualization of time itself, layers of past and future stacked transparently at infinite depth, light aging and renewing across vast distances, photorealistic temporal infinity, seeing every moment at once",
  parallax: "infinite layered depth planes receding at different speeds, each layer a different world slightly offset, warm light between the layers, photorealistic parallax infinity, the universe as infinite onion",
  olympus: "infinite Mount Olympus ascending through clouds into golden light, marble temples at impossible heights, divine architecture beyond mortal scale, photorealistic mythic ascension, where gods breathe the infinite",
  valhalla: "infinite golden hall stretching beyond sight, torchlight on shields and carved pillars receding forever, feast tables extending to vanishing point, photorealistic Norse afterlife, the hall of infinite warriors",
  elysium: "infinite blessed fields of soft golden light, gentle rolling hills extending forever under a warm eternal sky, flowers that have been blooming since the beginning of time, photorealistic paradise without boundary",
  avalon: "infinite mist-shrouded island floating in still silver water, apple trees heavy with light extending into warm fog, the shore always receding, photorealistic Celtic mystery, a place you can never quite reach",
  nirvana: "infinite pure white space dissolving into warmth and light, no edges no boundaries no self, luminous emptiness that is also fullness, photorealistic enlightenment, the end of seeking rendered as infinite peace",
  purgatorio: "infinite terraced mountain ascending through rings of warm and cool light, each terrace a different quality of awareness, figures climbing forever upward toward a light that never gets closer, photorealistic Dantean infinity",
  solitude: "infinite empty landscape with a single figure at vast distance, warm light and cool shadow creating infinite loneliness and infinite peace simultaneously, photorealistic isolation as transcendence",
  ecstasy: "infinite overwhelming beauty, light breaking into impossible colors across infinite space, the visual equivalent of being unable to contain what you are feeling, photorealistic transcendent joy at infinite scale",
  wonder: "infinite discovery, doors opening onto doors onto doors, each room larger and more impossible than the last, warm light of infinite curiosity, photorealistic architecture of perpetual amazement",
  serenity: "infinite still water reflecting infinite sky, no horizon visible, warm golden light suffusing everything, complete and total calm at infinite scale, photorealistic peace rendered as landscape",
  fury: "infinite storm consuming infinite space, lightning branching forever through boiling clouds, the raw power of nature at scale beyond comprehension, photorealistic meteorological infinity, beautiful wrath",
  cenote: "infinite sacred cenote descending through limestone into underground river systems that go on forever, turquoise water darkening into infinite depth, roots descending from above, shafts of light piercing deep green water, photorealistic geological portal to the underworld",
  pantheon: "infinite interior of a domed temple, the oculus open to stars, columns in perfect circle extending upward forever, light falling through the eye of the dome onto a floor that reflects infinity, photorealistic sacred geometry at divine scale",
  bioluminescence: "infinite deep ocean filled with bioluminescent organisms, jellyfish and plankton pulsing with inner light across infinite dark water, living galaxies in the deep, photorealistic underwater cosmos, the ocean's own stars",
  petrified: "infinite petrified forest stretching to every horizon, ancient trees turned to stone standing in amber light, time itself made solid and visible at infinite scale, photorealistic geological immortality",
  monochrome: "infinite landscape rendered in a single color and its infinite shades, every depth and distance expressed through tone alone, the purity of seeing without color, photorealistic infinite grayscale world",
};
