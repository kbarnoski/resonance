import { FRAG as DUSK_FRAG } from "./dusk";
import { FRAG as OCEAN_FRAG } from "./ocean";
import { FRAG as FLUX_FRAG } from "./flux";
// Elemental (new)
import { FRAG as MONSOON_FRAG } from "./monsoon";
import { FRAG as MAGMA_FRAG, PRE as MAGMA_PRE, PRE_SCALE as MAGMA_PRE_SCALE, ORIG as MAGMA_ORIG } from "./magma";
import { FRAG as TYPHOON_FRAG } from "./typhoon";


import { FRAG as ASTRAL_FRAG } from "./astral";
import { FRAG as EMBER_FRAG } from "./ember";
import { FRAG as TIDE_FRAG } from "./tide";
import { FRAG as UMBRA_FRAG } from "./umbra";
import { FRAG as INFERNO_FRAG } from "./inferno";
import { FRAG as PLASMA_FRAG, PRE as PLASMA_PRE, PRE_SIZE as PLASMA_PRE_SIZE } from "./plasma";
import { FRAG as PULSAR_FRAG } from "./pulsar";
import { FRAG as SUPERNOVA_FRAG } from "./supernova";
// nebula removed from registry — appeared in Ghost despite blocklist + caused
// load issues. File is kept on disk but never registered/picked.
import { FRAG as SINGULARITY_FRAG } from "./singularity";
import { FRAG as DRIFT_FRAG } from "./drift";
import { FRAG as EXPANSE_FRAG } from "./expanse";
import { FRAG as PROTOSTAR_FRAG } from "./protostar";

import { FRAG as REDSHIFT_FRAG } from "./redshift";
// Visionary

import { FRAG as THRESHOLD_FRAG } from "./threshold";
import { FRAG as RAPTURE_FRAG } from "./rapture";
import { FRAG as MANDORLA_FRAG } from "./mandorla";
import { FRAG as SERAPH_FRAG } from "./seraph";

// Organic

import { FRAG as SPORE_FRAG } from "./spore";
import { FRAG as CHRYSALIS_FRAG } from "./chrysalis";
import { FRAG as PLANKTON_FRAG, PRE as PLANKTON_PRE, PRE_SCALE as PLANKTON_PRE_SCALE, ORIG as PLANKTON_ORIG } from "./plankton";
import { FRAG as LICHEN_FRAG } from "./lichen";

// Organic (new)
import { FRAG as ENZYME_FRAG } from "./enzyme";

import { FRAG as POLLEN_FRAG } from "./pollen";
import { FRAG as SYMBIOSIS_FRAG, PRE as SYMBIOSIS_PRE, PRE_SCALE as SYMBIOSIS_PRE_SCALE, ORIG as SYMBIOSIS_ORIG } from "./symbiosis";

// Organic (biological)


import { FRAG as KELP_FRAG, PRE as KELP_PRE, PRE_COLUMNS as KELP_PRE_COLUMNS, ORIG as KELP_ORIG } from "./kelp";
// Organic (new batch)
import { FRAG as FLAGELLA_FRAG } from "./flagella";
import { FRAG as MYCELIUM_FRAG, PRE as MYCELIUM_PRE, PRE_SCALE as MYCELIUM_PRE_SCALE, ORIG as MYCELIUM_ORIG } from "./mycelium";
import { FRAG as CORAL_FRAG } from "./coral";
import { FRAG as SYNAPSE_FRAG } from "./synapse";
import { FRAG as DIATOM_FRAG } from "./diatom";

// Geometry

import { FRAG as SPIRAL_FRAG } from "./spiral";

import { FRAG as GEODESIC_FRAG } from "./geodesic";

import { FRAG as MOIRE_FRAG } from "./moire";


import { FRAG as CATENARY_FRAG } from "./catenary";

// Dark (new)
import { FRAG as VORTEX_FRAG } from "./vortex";
// Visionary (new)
import { FRAG as HALO_FRAG } from "./halo";
// Visionary (new batch)
import { FRAG as GNOSIS_FRAG } from "./gnosis";
import { FRAG as CHAKRA_FRAG } from "./chakra";
import { FRAG as VESTIGE_FRAG, PRE as VESTIGE_PRE, PRE_SIZE as VESTIGE_PRE_SIZE, ORIG as VESTIGE_ORIG } from "./vestige";
import { FRAG as STIGMATA_FRAG } from "./stigmata";
import { FRAG as AUREOLE_FRAG } from "./aureole";
import { FRAG as APOPHATIC_FRAG } from "./apophatic";
import { FRAG as YANTRA_FRAG } from "./yantra";
import { FRAG as SATORI_FRAG } from "./satori";
import { FRAG as MERKABA_FRAG } from "./merkaba";
import { FRAG as SOMA_FRAG } from "./soma";
// Cosmic (new)
import { FRAG as NADIR_FRAG } from "./nadir";
import { FRAG as PARSEC_FRAG, PRE as PARSEC_PRE, PRE_SCALE as PARSEC_PRE_SCALE, ORIG as PARSEC_ORIG } from "./parsec";
import { FRAG as NOVA_FRAG } from "./nova";
import { FRAG as PHOTON_FRAG } from "./photon";
import { FRAG as SELENE_FRAG } from "./selene";
import { FRAG as KEPLER_FRAG } from "./kepler";
import { FRAG as HUBBLE_FRAG, PRE as HUBBLE_PRE, PRE_SCALE as HUBBLE_PRE_SCALE, ORIG as HUBBLE_ORIG } from "./hubble";
// Cosmic (new batch)
import { FRAG as AURORA_WAVE_FRAG } from "./aurora-wave";
import { FRAG as ZENITH_FRAG } from "./zenith";
import { FRAG as LIGHTYEAR_FRAG, PRE as LIGHTYEAR_PRE, PRE_SCALE as LIGHTYEAR_PRE_SCALE, ORIG as LIGHTYEAR_ORIG } from "./lightyear";
import { FRAG as EVENT_HORIZON_FRAG } from "./event-horizon";
// Geometry (new)
import { FRAG as ASTROID_FRAG } from "./astroid";
import { FRAG as CARDIOID_FRAG } from "./cardioid";
import { FRAG as LISSAJOUS_FRAG } from "./lissajous";
import { FRAG as CYMATIC_FRAG } from "./cymatic";
import { FRAG as GUILLOCHE_FRAG } from "./guilloche";
import { FRAG as TREFOIL_FRAG } from "./trefoil";
import { FRAG as QUATREFOIL_FRAG } from "./quatrefoil";
import { FRAG as INVOLUTE_FRAG } from "./involute";
import { FRAG as ROSETTE_FRAG } from "./rosette";
import { FRAG as DELTOID_FRAG } from "./deltoid";
import { FRAG as NEPHROID_FRAG } from "./nephroid";
import { FRAG as EPICYCLE_FRAG } from "./epicycle";
import { FRAG as CONSTELLATION_FRAG } from "./constellation";
// Geometry (new batch)
import { FRAG as HELIX_FRAG } from "./helix";
import { FRAG as HARMONOGRAPH_FRAG } from "./harmonograph";
import { FRAG as VORONOI_FLOW_FRAG } from "./voronoi-flow";
import { FRAG as MOBIUS_STRIP_FRAG } from "./mobius-strip";
import { FRAG as FIBONACCI_SPIRAL_FRAG } from "./fibonacci-spiral";
import { FRAG as FRACTAL_TREE_FRAG } from "./fractal-tree";
import { FRAG as WEAVE_FRAG } from "./weave";
// Elemental (new)
import { FRAG as CHINOOK_FRAG } from "./chinook";
import { FRAG as MAELSTROM_FRAG } from "./maelstrom";
import { FRAG as DELUGE_FRAG } from "./deluge";
// Elemental (nature)
import { FRAG as SPARKLER_FRAG } from "./sparkler";
import { FRAG as COMET_SWARM_FRAG } from "./comet-swarm";
import { FRAG as EMBER_FOUNTAIN_FRAG } from "./ember-fountain";
import { FRAG as FIREFLY_FIELD_FRAG, PRE as FIREFLY_FIELD_PRE, PRE_SIZE as FIREFLY_FIELD_PRE_SIZE, ORIG as FIREFLY_FIELD_ORIG } from "./firefly-field";
import { FRAG as RIBBON_OF_LIGHT_FRAG, PRE as RIBBON_OF_LIGHT_PRE, PRE_SIZE as RIBBON_OF_LIGHT_PRE_SIZE, ORIG as RIBBON_OF_LIGHT_ORIG } from "./ribbon-of-light";
import { FRAG as ORBIT_WEAVER_FRAG, PRE as ORBIT_WEAVER_PRE, PRE_SIZE as ORBIT_WEAVER_PRE_SIZE, ORIG as ORBIT_WEAVER_ORIG } from "./orbit-weaver";
import { FRAG as METEOR_RAIN_FRAG, PRE as METEOR_RAIN_PRE, PRE_SIZE as METEOR_RAIN_PRE_SIZE, ORIG as METEOR_RAIN_ORIG } from "./meteor-rain";
import { FRAG as MURMURATION_FRAG, PRE as MURMURATION_PRE, PRE_SIZE as MURMURATION_PRE_SIZE, ORIG as MURMURATION_ORIG } from "./murmuration";
import { FRAG as WILL_O_WISP_FRAG, PRE as WILL_O_WISP_PRE, PRE_SIZE as WILL_O_WISP_PRE_SIZE, ORIG as WILL_O_WISP_ORIG } from "./will-o-wisp";
import { FRAG as GALAXY_SEED_FRAG } from "./galaxy-seed";
import { FRAG as PENDULUM_DUST_FRAG, PRE as PENDULUM_DUST_PRE, PRE_SIZE as PENDULUM_DUST_PRE_SIZE, ORIG as PENDULUM_DUST_ORIG } from "./pendulum-dust";
import { FRAG as HELIX_STREAM_FRAG } from "./helix-stream";
import { FRAG as FRACTURE_LIGHT_FRAG, PRE as FRACTURE_LIGHT_PRE, PRE_SIZE as FRACTURE_LIGHT_PRE_SIZE, ORIG as FRACTURE_LIGHT_ORIG } from "./fracture-light";
import { FRAG as ROSE_WINDOW_FRAG, PRE as ROSE_WINDOW_PRE, PRE_SIZE as ROSE_WINDOW_PRE_SIZE, ORIG as ROSE_WINDOW_ORIG } from "./rose-window";
import { FRAG as CASCADE_VEIL_FRAG, PRE as CASCADE_VEIL_PRE, PRE_SIZE as CASCADE_VEIL_PRE_SIZE, ORIG as CASCADE_VEIL_ORIG } from "./cascade-veil";
import { FRAG as BINARY_STARS_FRAG, PRE as BINARY_STARS_PRE, PRE_SIZE as BINARY_STARS_PRE_SIZE, ORIG as BINARY_STARS_ORIG } from "./binary-stars";
import { FRAG as RESONANT_RINGS_FRAG } from "./resonant-rings";
import { FRAG as RIPPLE_FRAG } from "./ripple";
// Elemental (new batch)
import { FRAG as RIME_FRAG } from "./rime";
import { FRAG as CIRRUS_FRAG } from "./cirrus";
import { FRAG as TORRENT_FRAG, PRE as TORRENT_PRE, PRE_SCALE as TORRENT_PRE_SCALE, ORIG as TORRENT_ORIG } from "./torrent";
import { FRAG as AURORA_BOREALIS_FRAG } from "./aurora-borealis";
// Nature (fire / cellular / light)
import { FRAG as FLAME_FRAG, PRE as FLAME_PRE, PRE_SCALE as FLAME_PRE_SCALE, ORIG as FLAME_ORIG } from "./flame";
// Nature (smooth motion)
import { FRAG as STARFIELD_FRAG, PRE as STARFIELD_PRE } from "./starfield";
import { FRAG as RADIANCE_FRAG } from "./radiance";
// Dark (new)
// Dark (new batch)
import { FRAG as MAELSTROM_DARK_FRAG } from "./maelstrom-dark";
import { FRAG as OBSIDIAN_FLOW_FRAG } from "./obsidian-flow";
import { FRAG as FURNACE_FRAG } from "./furnace";
// Geometry (April 2026)
import { FRAG as PARABOLA_FRAG } from "./parabola";
import { FRAG as CASSEGRAIN_FRAG } from "./cassegrain";
import { FRAG as CISSOID_FRAG } from "./cissoid";
import { FRAG as AGNESI_FRAG } from "./agnesi";
import { FRAG as STROPHOID_FRAG } from "./strophoid";
import { FRAG as BRACHISTOCHRONE_FRAG } from "./brachistochrone";
import { FRAG as CHLADNI_FRAG } from "./chladni";
import { FRAG as CAUSTIC_POOL_FRAG } from "./caustic-pool";
import { FRAG as ZOETROPE_FRAG } from "./zoetrope";
import { FRAG as TANGENT_FIELD_FRAG } from "./tangent-field";
import { FRAG as PEDAL_CURVE_FRAG } from "./pedal-curve";
import { FRAG as RULED_SURFACE_FRAG } from "./ruled-surface";
import { FRAG as WAVEFORM_FRAG } from "./waveform";
import { FRAG as EPICYCLOID_FRAG } from "./epicycloid";
// Organic (April 2026)
import { FRAG as PELAGIC_FRAG, PRE as PELAGIC_PRE, PRE_SIZE as PELAGIC_PRE_SIZE, ORIG as PELAGIC_ORIG } from "./pelagic";
import { FRAG as ZOOID_FRAG } from "./zooid";
import { FRAG as LAMINAR_FRAG } from "./laminar";
import { FRAG as WHORL_FRAG } from "./whorl";
import { FRAG as STAMEN_FRAG } from "./stamen";
import { FRAG as MERISTEM_FRAG } from "./meristem";
// Dark (April 2026)
import { FRAG as ECLIPSE_RING_FRAG } from "./eclipse-ring";
import { FRAG as SMOLDER_FRAG } from "./smolder";
import { FRAG as CRUCIBLE_FRAG } from "./crucible";
// Dark (April 2026 — visible dark)
import { FRAG as EMBER_DRIFT_FRAG } from "./ember-drift";
import { FRAG as DEEP_CURRENT_FRAG } from "./deep-current";
import { FRAG as MOLTEN_VEIN_FRAG, PRE as MOLTEN_VEIN_PRE, PRE_SCALE as MOLTEN_VEIN_PRE_SCALE, ORIG as MOLTEN_VEIN_ORIG } from "./molten-vein";
import { FRAG as DARK_AURORA_FRAG } from "./dark-aurora";
import { FRAG as SHADOW_FIRE_FRAG } from "./shadow-fire";
import { FRAG as DARK_TIDE_FRAG } from "./dark-tide";
import { FRAG as SMOKE_SIGNAL_FRAG } from "./smoke-signal";
import { FRAG as IRON_FORGE_FRAG, PRE as IRON_FORGE_PRE, PRE_SCALE as IRON_FORGE_PRE_SCALE, ORIG as IRON_FORGE_ORIG } from "./iron-forge";
import { FRAG as CATACOMB_TORCH_FRAG } from "./catacomb-torch";
import { FRAG as BLOOD_MOON_FRAG } from "./blood-moon";
import { FRAG as WITCH_LIGHT_FRAG } from "./witch-light";
import { FRAG as DARK_CRYSTAL_FRAG } from "./dark-crystal";
import { FRAG as VOLCANIC_FRAG } from "./volcanic";
import { FRAG as LIGHTNING_FIELD_FRAG } from "./lightning-field";
import { FRAG as DARK_NEBULA_FRAG } from "./dark-nebula";
import { FRAG as NIGHT_FOREST_FRAG } from "./night-forest";
// Visionary (April 2026)
import { FRAG as KENOSIS_FRAG } from "./kenosis";
import { FRAG as ANIMA_FRAG } from "./anima";
import { FRAG as COVENANT_FRAG } from "./covenant";
import { FRAG as VESPERS_FRAG } from "./vespers";
import { FRAG as JUBILEE_FRAG } from "./jubilee";
import { FRAG as PILGRIMAGE_FRAG } from "./pilgrimage";
import { FRAG as CATAPHATIC_FRAG } from "./cataphatic";
import { FRAG as HESYCHASM_FRAG } from "./hesychasm";
import { FRAG as KAIROS_FRAG } from "./kairos";
import { FRAG as LECTIO_FRAG } from "./lectio";
import {
  R_MERCURY, R_TENDRILS, R_STARDUST, R_EMBERS,
  R_KALEIDO, R_BLACKHOLE,
  R_MOLTEN, R_SMOKERINGS,
  R_GROWTH, R_SILK, R_DROPLETS, R_PETALS,
} from "./review-pack";
// Pack #2 survivors only — deleted entries removed from import list.
import {
  R2_CURLSWARM, R2_SPIRALGAL, R2_INTERFERENCE,
  R2_FIBERS,
  R2_THERMAL, R2_MAGNETIC,
  R2_CORAL,
  R2_PHOTON,
  R2_PIXIE,
  R2_INFRARED,
  R2_PORTALRIM, R2_SPORE, R2_SUNSETCASCADE,
} from "./review-pack-2";
// Pack #3 survivors only — 67 deleted entries removed from import list.
import {
  R3_SPIRITTRAILS, R3_GHOSTRIBBONS, R3_SILKWIND, R3_DREAMTENDRILS,
  R3_LIGHTRIVERS, R3_AURORASTREAMS, R3_WAVEVEIL,
  R3_PLASMASTORM, R3_LIGHTNINGVEIL, R3_CORONASTREAMS,
  R3_STELLARRIBBON, R3_MAGNETICWISPS, R3_ARCDISCHARGE, R3_BALLLIGHTNING,
  R3_CORALPULSE, R3_FERNUNFURL,
  R3_SEAWEEDSWAY, R3_UNDERWATERVINES, R3_SLEEPINGBLOOM,
  R3_FAIRYGLOW, R3_WISHTRAILS, R3_MEMORYFLOW, R3_AURORADREAM,
  R3_RIPPLECASCADE, R3_PULSERINGSSOFT, R3_HEARTWARMTH, R3_SOFTORBIT, R3_INNERGLOW,
} from "./review-pack-3";
// SUN lab (2026-10-12) — promoted 2026-10-13 on Karel's keep; cast in the
// light journeys (SUN_SHADER_PINS, src/lib/journeys/shader-balance.ts).
import { FRAG as SUN_CORONA_FRAG } from "./sun-corona";
import { FRAG as SUN_VEIL_FRAG, PRE as SUN_VEIL_PRE, PRE_SCALE as SUN_VEIL_PRE_SCALE, ORIG as SUN_VEIL_ORIG } from "./sun-veil";
import { FRAG as SUN_DAWN_FRAG } from "./sun-dawn";
import { FRAG as SUN_HALO_FRAG } from "./sun-halo";
import { FRAG as SUN_WIND_FRAG } from "./sun-wind";
import { FRAG as SUN_ASTER_FRAG } from "./sun-aster";
import type { VisualizerMode } from "@/lib/audio/vibe-detection";

export const SHADERS: Partial<Record<VisualizerMode, string>> = {
  dusk: DUSK_FRAG,
  ocean: OCEAN_FRAG,
  flux: FLUX_FRAG,
  monsoon: MONSOON_FRAG,
  magma: MAGMA_FRAG,
  typhoon: TYPHOON_FRAG,

  // prismatic removed — user request

  astral: ASTRAL_FRAG,
  ember: EMBER_FRAG,
  tide: TIDE_FRAG,
  umbra: UMBRA_FRAG,
  inferno: INFERNO_FRAG,
  plasma: PLASMA_FRAG,
  vortex: VORTEX_FRAG,
  pulsar: PULSAR_FRAG,
  supernova: SUPERNOVA_FRAG,
  singularity: SINGULARITY_FRAG,
  drift: DRIFT_FRAG,
  expanse: EXPANSE_FRAG,
  protostar: PROTOSTAR_FRAG,

  redshift: REDSHIFT_FRAG,
  // Visionary

  threshold: THRESHOLD_FRAG,
  rapture: RAPTURE_FRAG,
  mandorla: MANDORLA_FRAG,
  seraph: SERAPH_FRAG,

  // Organic

  spore: SPORE_FRAG,
  chrysalis: CHRYSALIS_FRAG,
  plankton: PLANKTON_FRAG,
  lichen: LICHEN_FRAG,

  enzyme: ENZYME_FRAG,

  pollen: POLLEN_FRAG,
  symbiosis: SYMBIOSIS_FRAG,



  kelp: KELP_FRAG,
  // Organic (new batch)
  flagella: FLAGELLA_FRAG,
  mycelium: MYCELIUM_FRAG,
  coral: CORAL_FRAG,
  synapse: SYNAPSE_FRAG,
  diatom: DIATOM_FRAG,

  // Geometry

  spiral: SPIRAL_FRAG,

  geodesic: GEODESIC_FRAG,

  moire: MOIRE_FRAG,

  catenary: CATENARY_FRAG,
  // Visionary (new)
  halo: HALO_FRAG,
  // Visionary (new batch)
  gnosis: GNOSIS_FRAG,
  chakra: CHAKRA_FRAG,
  vestige: VESTIGE_FRAG,
  stigmata: STIGMATA_FRAG,
  aureole: AUREOLE_FRAG,
  apophatic: APOPHATIC_FRAG,
  yantra: YANTRA_FRAG,
  satori: SATORI_FRAG,
  merkaba: MERKABA_FRAG,
  soma: SOMA_FRAG,
  // Cosmic (new)
  nadir: NADIR_FRAG,
  parsec: PARSEC_FRAG,
  nova: NOVA_FRAG,
  photon: PHOTON_FRAG,
  selene: SELENE_FRAG,
  kepler: KEPLER_FRAG,
  hubble: HUBBLE_FRAG,
  // Cosmic (new batch)
  "aurora-wave": AURORA_WAVE_FRAG,
  zenith: ZENITH_FRAG,
  lightyear: LIGHTYEAR_FRAG,
  "event-horizon": EVENT_HORIZON_FRAG,
  // Geometry (new)
  astroid: ASTROID_FRAG,
  cardioid: CARDIOID_FRAG,
  lissajous: LISSAJOUS_FRAG,
  cymatic: CYMATIC_FRAG,
  guilloche: GUILLOCHE_FRAG,
  trefoil: TREFOIL_FRAG,
  quatrefoil: QUATREFOIL_FRAG,
  involute: INVOLUTE_FRAG,
  rosette: ROSETTE_FRAG,
  deltoid: DELTOID_FRAG,
  nephroid: NEPHROID_FRAG,
  epicycle: EPICYCLE_FRAG,
  constellation: CONSTELLATION_FRAG,
  // Geometry (new batch)
  helix: HELIX_FRAG,
  harmonograph: HARMONOGRAPH_FRAG,
  "voronoi-flow": VORONOI_FLOW_FRAG,
  "mobius-strip": MOBIUS_STRIP_FRAG,
  "fibonacci-spiral": FIBONACCI_SPIRAL_FRAG,
  "fractal-tree": FRACTAL_TREE_FRAG,
  weave: WEAVE_FRAG,
  // Elemental (new)
  chinook: CHINOOK_FRAG,
  maelstrom: MAELSTROM_FRAG,
  deluge: DELUGE_FRAG,
  // Elemental (nature)
  ripple: RIPPLE_FRAG,
  // Elemental (new batch)
  rime: RIME_FRAG,
  cirrus: CIRRUS_FRAG,
  torrent: TORRENT_FRAG,
  "aurora-borealis": AURORA_BOREALIS_FRAG,
  // Nature (fire / cellular / light)
  flame: FLAME_FRAG,
  // Nature (smooth motion)
  starfield: STARFIELD_FRAG,
  radiance: RADIANCE_FRAG,
  // Dark (new)
  // Dark (new batch)
  "maelstrom-dark": MAELSTROM_DARK_FRAG,
  "obsidian-flow": OBSIDIAN_FLOW_FRAG,
  furnace: FURNACE_FRAG,
  // Geometry (April 2026)
  parabola: PARABOLA_FRAG,
  cassegrain: CASSEGRAIN_FRAG,
  cissoid: CISSOID_FRAG,
  agnesi: AGNESI_FRAG,
  strophoid: STROPHOID_FRAG,
  brachistochrone: BRACHISTOCHRONE_FRAG,
  chladni: CHLADNI_FRAG,
  "caustic-pool": CAUSTIC_POOL_FRAG,
  zoetrope: ZOETROPE_FRAG,
  "tangent-field": TANGENT_FIELD_FRAG,
  "pedal-curve": PEDAL_CURVE_FRAG,
  "ruled-surface": RULED_SURFACE_FRAG,
  waveform: WAVEFORM_FRAG,
  epicycloid: EPICYCLOID_FRAG,
  // Organic (April 2026)
  pelagic: PELAGIC_FRAG,
  zooid: ZOOID_FRAG,
  laminar: LAMINAR_FRAG,
  whorl: WHORL_FRAG,
  stamen: STAMEN_FRAG,
  meristem: MERISTEM_FRAG,
  // Dark (April 2026)
  "eclipse-ring": ECLIPSE_RING_FRAG,
  smolder: SMOLDER_FRAG,
  crucible: CRUCIBLE_FRAG,
  // Dark (April 2026 — visible dark)
  "ember-drift": EMBER_DRIFT_FRAG,
  "deep-current": DEEP_CURRENT_FRAG,
  "molten-vein": MOLTEN_VEIN_FRAG,
  "dark-aurora": DARK_AURORA_FRAG,
  "shadow-fire": SHADOW_FIRE_FRAG,
  "dark-tide": DARK_TIDE_FRAG,
  "smoke-signal": SMOKE_SIGNAL_FRAG,
  "iron-forge": IRON_FORGE_FRAG,
  "catacomb-torch": CATACOMB_TORCH_FRAG,
  "blood-moon": BLOOD_MOON_FRAG,
  "witch-light": WITCH_LIGHT_FRAG,
  "dark-crystal": DARK_CRYSTAL_FRAG,
  volcanic: VOLCANIC_FRAG,
  "lightning-field": LIGHTNING_FIELD_FRAG,
  "dark-nebula": DARK_NEBULA_FRAG,
  "night-forest": NIGHT_FOREST_FRAG,
  // Visionary (April 2026)
  kenosis: KENOSIS_FRAG,
  anima: ANIMA_FRAG,
  covenant: COVENANT_FRAG,
  vespers: VESPERS_FRAG,
  jubilee: JUBILEE_FRAG,
  pilgrimage: PILGRIMAGE_FRAG,
  cataphatic: CATAPHATIC_FRAG,
  hesychasm: HESYCHASM_FRAG,
  kairos: KAIROS_FRAG,
  lectio: LECTIO_FRAG,
  // ─── Review pack #1 survivors ───
  "r-mercury": R_MERCURY,
  "r-tendrils": R_TENDRILS,
  "r-stardust": R_STARDUST,
  "sparkler": SPARKLER_FRAG,
  "comet-swarm": COMET_SWARM_FRAG,
  "ember-fountain": EMBER_FOUNTAIN_FRAG,
  "firefly-field": FIREFLY_FIELD_FRAG,
  "ribbon-of-light": RIBBON_OF_LIGHT_FRAG,
  "orbit-weaver": ORBIT_WEAVER_FRAG,
  "meteor-rain": METEOR_RAIN_FRAG,
  "murmuration": MURMURATION_FRAG,
  "will-o-wisp": WILL_O_WISP_FRAG,
  "galaxy-seed": GALAXY_SEED_FRAG,
  "pendulum-dust": PENDULUM_DUST_FRAG,
  "helix-stream": HELIX_STREAM_FRAG,
  "fracture-light": FRACTURE_LIGHT_FRAG,
  "rose-window": ROSE_WINDOW_FRAG,
  "cascade-veil": CASCADE_VEIL_FRAG,
  "binary-stars": BINARY_STARS_FRAG,
  "resonant-rings": RESONANT_RINGS_FRAG,
  "r-embers": R_EMBERS,
  "r-kaleido": R_KALEIDO,
  "r-blackhole": R_BLACKHOLE,
  "r-molten": R_MOLTEN,
  "r-smokerings": R_SMOKERINGS,
  "r-growth": R_GROWTH,
  "r-silk": R_SILK,
  "r-droplets": R_DROPLETS,
  "r-petals": R_PETALS, // Ghost ending only (pinned via the scripted take; globally blocked from rotation)
  // ─── Review pack #2 survivors ───
  "r2-curlswarm": R2_CURLSWARM,
  "r2-spiralgal": R2_SPIRALGAL,
  "r2-interference": R2_INTERFERENCE,
  "r2-fibers": R2_FIBERS,
  "r2-thermal": R2_THERMAL,
  "r2-magnetic": R2_MAGNETIC,
  "r2-coral": R2_CORAL,
  "r2-photon": R2_PHOTON,
  "r2-pixie": R2_PIXIE,
  "r2-infrared": R2_INFRARED,
  "r2-portalrim": R2_PORTALRIM,
  "r2-spore": R2_SPORE,
  "r2-sunsetcascade": R2_SUNSETCASCADE,
  // ─── Review pack #3 survivors ───
  "r3-spirittrails": R3_SPIRITTRAILS,
  "r3-ghostribbons": R3_GHOSTRIBBONS,
  "r3-silkwind": R3_SILKWIND,
  "r3-dreamtendrils": R3_DREAMTENDRILS,
  "r3-lightrivers": R3_LIGHTRIVERS,
  "r3-aurorastreams": R3_AURORASTREAMS,
  "r3-waveveil": R3_WAVEVEIL,
  "r3-plasmastorm": R3_PLASMASTORM,
  "r3-lightningveil": R3_LIGHTNINGVEIL,
  "r3-coronastreams": R3_CORONASTREAMS,
  "r3-stellarribbon": R3_STELLARRIBBON,
  "r3-magneticwisps": R3_MAGNETICWISPS,
  "r3-arcdischarge": R3_ARCDISCHARGE,
  "r3-balllightning": R3_BALLLIGHTNING,
  "r3-coralpulse": R3_CORALPULSE,
  "r3-fernunfurl": R3_FERNUNFURL,
  "r3-seaweedsway": R3_SEAWEEDSWAY,
  "r3-underwatervines": R3_UNDERWATERVINES,
  "r3-sleepingbloom": R3_SLEEPINGBLOOM,
  "r3-fairyglow": R3_FAIRYGLOW,
  "r3-wishtrails": R3_WISHTRAILS,
  "r3-memoryflow": R3_MEMORYFLOW,
  "r3-auroradream": R3_AURORADREAM,
  "r3-ripplecascade": R3_RIPPLECASCADE,
  "r3-pulseringssoft": R3_PULSERINGSSOFT,
  "r3-heartwarmth": R3_HEARTWARMTH,
  "r3-softorbit": R3_SOFTORBIT,
  "r3-innerglow": R3_INNERGLOW,
  // ─── SUN (lab 2026-10-12, promoted 2026-10-13) ───
  "sun-corona": SUN_CORONA_FRAG,
  "sun-veil": SUN_VEIL_FRAG,
  "sun-dawn": SUN_DAWN_FRAG,
  "sun-halo": SUN_HALO_FRAG,
  "sun-wind": SUN_WIND_FRAG,
  "sun-aster": SUN_ASTER_FRAG,
};

/** LAB shaders — registered so they can be auditioned by hand, but
 *  EXCLUDED from every automatic picker: journey pools
 *  (pickJourneyShaders), casts (castJourneyShaders), the engine's pick-time
 *  gate (isShaderAllowed), the vetted pools (scripts/vet-shaders.mjs full
 *  runs) and the viz-mode cycle. Promote one by removing it here after
 *  Karel approves it. Guarded by src/lib/shaders/lab-shaders.test.ts.
 *
 *  EMPTY since 2026-10-13: the SUN lab (sun-corona, sun-veil, sun-dawn,
 *  sun-halo, sun-wind, sun-aster — 2026-10-12, Karel: "one day you'll want
 *  to explore with me some new sun themed shaders", seraph as the bar) was
 *  promoted on Karel's keep of all six; they are cast in the light journeys
 *  (SUN_SHADER_PINS in src/lib/journeys/shader-balance.ts). */
export const LAB_SHADERS: ReadonlySet<string> = new Set<string>([]);

/**
 * LOW-RESOLUTION PREPASSES (2026-10-13, the 120 fps law — Karel: "poor 60 fps
 * compared to 120 is not [perfection]"). A shader whose cost is dominated by a
 * smooth field (fbm nebulae, haze) renders that field at `scale` of its
 * canvas into a texture first; its FRAG then samples it (`uniform sampler2D
 * u_pre`, at gl_FragCoord.xy / u_resolution) and adds its fine detail at full
 * resolution. PRE receives the usual uniforms (u_resolution = the MAIN
 * canvas) plus `u_preres` (its own target size). The picture is the same —
 * each split is A/B'd against its single-pass original (scripts/perf/
 * shader-ab.mjs); only the GPU cost changes. The visualizer runs it.
 */
/** `size` + `nearest`: a fixed-size TABLE instead of a scaled image — point-
 *  light shaders compute each light's position + colour once per frame there
 *  (the identical GPU math, packed 16-bit — shaders/prepass-pack.ts) instead
 *  of once per light per PIXEL. */
/** `float` + `fallback`: a FLOAT target (32-bit, exact values, linear
 *  filtering) — needs OES_texture_float + WEBGL_color_buffer_float (+
 *  OES_texture_float_linear unless nearest); without them the layer runs
 *  `fallback`, the shader's original single-pass source. */
export interface ShaderPrepass { frag: string; scale: number; size?: readonly [number, number]; nearest?: boolean; float?: boolean; fallback?: string; /** stacked field blocks (each round(H*scale) rows: 4 more values per texel) */ blocks?: number; /** table rows above the field blocks (time-only values, e.g. magma's sparks) */ extraRows?: number; /** the SHADER itself renders at `scale` (frag = its FRAG), the layer upsamples (prepass-pack.ts UPSAMPLE_FRAG) */ whole?: boolean; /** a per-ROW table: `columns` texels for every canvas row (values that depend on the pixel's row only) */ columns?: number }
export const SHADER_PREPASS: Partial<Record<VisualizerMode, ShaderPrepass>> = {
  starfield: { frag: STARFIELD_PRE, scale: 0.25 },
  mycelium: { frag: MYCELIUM_PRE, scale: MYCELIUM_PRE_SCALE, float: true, fallback: MYCELIUM_ORIG },
  lightyear: { frag: LIGHTYEAR_PRE, scale: LIGHTYEAR_PRE_SCALE, blocks: 2, float: true, fallback: LIGHTYEAR_ORIG },
  "molten-vein": { frag: MOLTEN_VEIN_PRE, scale: MOLTEN_VEIN_PRE_SCALE, float: true, fallback: MOLTEN_VEIN_ORIG },
  torrent: { frag: TORRENT_PRE, scale: TORRENT_PRE_SCALE, float: true, fallback: TORRENT_ORIG },
  parsec: { frag: PARSEC_PRE, scale: PARSEC_PRE_SCALE, float: true, fallback: PARSEC_ORIG },
  kelp: { frag: KELP_PRE, scale: 0, columns: KELP_PRE_COLUMNS, nearest: true, float: true, fallback: KELP_ORIG },
  "iron-forge": { frag: IRON_FORGE_PRE, scale: IRON_FORGE_PRE_SCALE, blocks: 3, float: true, fallback: IRON_FORGE_ORIG },
  hubble: { frag: HUBBLE_PRE, scale: HUBBLE_PRE_SCALE, extraRows: 2, float: true, fallback: HUBBLE_ORIG },
  pelagic: { frag: PELAGIC_PRE, scale: 0, size: PELAGIC_PRE_SIZE, nearest: true, float: true, fallback: PELAGIC_ORIG },
  vestige: { frag: VESTIGE_PRE, scale: 0, size: VESTIGE_PRE_SIZE, nearest: true, float: true, fallback: VESTIGE_ORIG },
  symbiosis: { frag: SYMBIOSIS_PRE, scale: SYMBIOSIS_PRE_SCALE, blocks: 3, float: true, fallback: SYMBIOSIS_ORIG },
  "sun-veil": { frag: SUN_VEIL_PRE, scale: SUN_VEIL_PRE_SCALE, float: true, fallback: SUN_VEIL_ORIG },
  "fracture-light": { frag: FRACTURE_LIGHT_PRE, scale: 0, size: FRACTURE_LIGHT_PRE_SIZE, nearest: true, float: true, fallback: FRACTURE_LIGHT_ORIG },
  "binary-stars": { frag: BINARY_STARS_PRE, scale: 0, size: BINARY_STARS_PRE_SIZE, nearest: true, float: true, fallback: BINARY_STARS_ORIG },
  "will-o-wisp": { frag: WILL_O_WISP_PRE, scale: 0, size: WILL_O_WISP_PRE_SIZE, nearest: true, float: true, fallback: WILL_O_WISP_ORIG },
  "rose-window": { frag: ROSE_WINDOW_PRE, scale: 0, size: ROSE_WINDOW_PRE_SIZE, nearest: true, float: true, fallback: ROSE_WINDOW_ORIG },
  "pendulum-dust": { frag: PENDULUM_DUST_PRE, scale: 0, size: PENDULUM_DUST_PRE_SIZE, nearest: true, float: true, fallback: PENDULUM_DUST_ORIG },
  "cascade-veil": { frag: CASCADE_VEIL_PRE, scale: 0, size: CASCADE_VEIL_PRE_SIZE, nearest: true, float: true, fallback: CASCADE_VEIL_ORIG },
  "orbit-weaver": { frag: ORBIT_WEAVER_PRE, scale: 0, size: ORBIT_WEAVER_PRE_SIZE, nearest: true, float: true, fallback: ORBIT_WEAVER_ORIG },
  "ribbon-of-light": { frag: RIBBON_OF_LIGHT_PRE, scale: 0, size: RIBBON_OF_LIGHT_PRE_SIZE, nearest: true, float: true, fallback: RIBBON_OF_LIGHT_ORIG },
  "meteor-rain": { frag: METEOR_RAIN_PRE, scale: 0, size: METEOR_RAIN_PRE_SIZE, nearest: true, float: true, fallback: METEOR_RAIN_ORIG },
  "firefly-field": { frag: FIREFLY_FIELD_PRE, scale: 0, size: FIREFLY_FIELD_PRE_SIZE, nearest: true, float: true, fallback: FIREFLY_FIELD_ORIG },
  murmuration: { frag: MURMURATION_PRE, scale: 0, size: MURMURATION_PRE_SIZE, nearest: true, float: true, fallback: MURMURATION_ORIG },
  flame: { frag: FLAME_PRE, scale: FLAME_PRE_SCALE, blocks: 2, float: true, fallback: FLAME_ORIG },
  plankton: { frag: PLANKTON_PRE, scale: PLANKTON_PRE_SCALE, extraRows: 1, float: true, fallback: PLANKTON_ORIG },
  magma: { frag: MAGMA_PRE, scale: MAGMA_PRE_SCALE, extraRows: 1, float: true, fallback: MAGMA_ORIG },
  plasma: { frag: PLASMA_PRE, scale: 0, size: PLASMA_PRE_SIZE, nearest: true },
};
export { UPSAMPLE_FRAG } from "./prepass-pack";
/**
 * WHOLE-SHADER prepasses (prepass-pack.ts UPSAMPLE_FRAG): shaders with no
 * detail finer than a few pixels at the kiosk's shader resolution render at
 * this scale and are upsampled — each A/B'd against its full-resolution
 * render (scripts/perf/shader-ab.mjs, kiosk resolution: ≤ 2 of 255, ≤ 3 on a
 * few dozen pixels for kenosis / protostar / shadow-fire). Shaders
 * whose detail did NOT survive the test (pollen, seraph, chrysalis, rapture,
 * lightyear, ocean …) are not here.
 */
export const WHOLE_SHADER_SCALE: Partial<Record<VisualizerMode, number>> = {
  radiance: 1 / 3,
  chinook: 1 / 3,
  typhoon: 1 / 3,
  lectio: 1 / 3,
  cataphatic: 1 / 3,
  "dark-nebula": 1 / 3,
  volcanic: 1 / 3,
  kenosis: 1 / 2,
  protostar: 1 / 2,
  "shadow-fire": 1 / 2,
  "r3-aurorastreams": 1 / 3,
  "r-mercury": 1 / 3,
  "r2-spore": 1 / 3,
  "r3-fairyglow": 1 / 3,
  "r2-curlswarm": 3 / 4,
};
for (const [mode, scale] of Object.entries(WHOLE_SHADER_SCALE)) {
  const frag = SHADERS[mode as VisualizerMode];
  if (frag && scale) SHADER_PREPASS[mode as VisualizerMode] = { frag, scale, whole: true, float: true, fallback: frag };
}
const PREPASS_BY_FRAG = new Map<string, ShaderPrepass>();
for (const [mode, pre] of Object.entries(SHADER_PREPASS)) {
  const frag = SHADERS[mode as VisualizerMode];
  if (frag && pre) PREPASS_BY_FRAG.set(frag, pre);
}
/** The prepass a fragment shader needs, if any (keyed by the FRAG itself, so
 *  every layer that renders a registered shader gets it). */
export function prepassFor(frag: string): ShaderPrepass | null {
  return PREPASS_BY_FRAG.get(frag) ?? null;
}

export interface ModeMeta {
  mode: VisualizerMode;
  label: string;
  category: "Visionary" | "Cosmic" | "Organic" | "Geometry" | "3D Worlds" | "AI Imagery" | "Elemental" | "Dark" | "Review";
  addedDate?: string; // ISO date, e.g. "2026-04-07"
}

export const MODE_META: ModeMeta[] = [
  // Visionary
  { mode: "astral", label: "Astral", category: "Visionary" },

  { mode: "threshold", label: "Threshold", category: "Visionary" },
  { mode: "rapture", label: "Rapture", category: "Visionary" },
  { mode: "mandorla", label: "Mandorla", category: "Visionary" },
  { mode: "seraph", label: "Seraph", category: "Visionary" },

  { mode: "halo", label: "Halo", category: "Visionary" },
  // Visionary (new batch)
  { mode: "gnosis", label: "Gnosis", category: "Visionary" },
  { mode: "chakra", label: "Chakra", category: "Visionary" },
  { mode: "vestige", label: "Vestige", category: "Visionary" },
  { mode: "stigmata", label: "Stigmata", category: "Visionary" },
  { mode: "aureole", label: "Aureole", category: "Visionary" },
  { mode: "apophatic", label: "Apophatic", category: "Visionary" },
  { mode: "yantra", label: "Yantra", category: "Visionary" },
  { mode: "satori", label: "Satori", category: "Visionary" },
  { mode: "merkaba", label: "Merkaba", category: "Visionary" },
  { mode: "soma", label: "Soma", category: "Visionary" },
  // Cosmic
  { mode: "pulsar", label: "Pulsar", category: "Cosmic" },
  { mode: "supernova", label: "Supernova", category: "Cosmic" },
  { mode: "singularity", label: "Singularity", category: "Cosmic" },
  { mode: "drift", label: "Drift", category: "Cosmic" },
  { mode: "expanse", label: "Expanse", category: "Cosmic" },
  { mode: "protostar", label: "Protostar", category: "Cosmic" },

  { mode: "redshift", label: "Redshift", category: "Cosmic" },
  { mode: "nadir", label: "Nadir", category: "Cosmic" },
  { mode: "parsec", label: "Parsec", category: "Cosmic" },
  { mode: "nova", label: "Nova", category: "Cosmic" },
  { mode: "photon", label: "Photon", category: "Cosmic" },
  { mode: "selene", label: "Selene", category: "Cosmic" },
  { mode: "kepler", label: "Kepler", category: "Cosmic" },
  { mode: "hubble", label: "Hubble", category: "Cosmic" },
  // Cosmic (new batch)
  { mode: "aurora-wave", label: "Aurora Wave", category: "Cosmic" },
  { mode: "zenith", label: "Zenith", category: "Cosmic" },
  { mode: "lightyear", label: "Lightyear", category: "Cosmic" },
  { mode: "event-horizon", label: "Event Horizon", category: "Cosmic" },
  // Organic

  { mode: "ember", label: "Ember", category: "Organic" },
  { mode: "tide", label: "Tide", category: "Organic" },

  { mode: "spore", label: "Spore", category: "Organic" },
  { mode: "chrysalis", label: "Chrysalis", category: "Organic" },
  { mode: "plankton", label: "Plankton", category: "Organic" },
  { mode: "lichen", label: "Lichen", category: "Organic" },

  { mode: "enzyme", label: "Enzyme", category: "Organic" },

  { mode: "pollen", label: "Pollen", category: "Organic" },
  { mode: "symbiosis", label: "Symbiosis", category: "Organic" },


  { mode: "kelp", label: "Kelp", category: "Organic" },
  // Organic (new batch)
  { mode: "flagella", label: "Flagella", category: "Organic" },
  { mode: "mycelium", label: "Mycelium", category: "Organic" },
  { mode: "coral", label: "Coral", category: "Organic" },
  { mode: "synapse", label: "Synapse", category: "Organic" },
  { mode: "diatom", label: "Diatom", category: "Organic" },

  // Geometry
  // sacred removed — grainy resolution effect, not suitable for journeys

  { mode: "spiral", label: "Spiral", category: "Geometry" },

  { mode: "geodesic", label: "Geodesic", category: "Geometry" },

  { mode: "moire", label: "Moire", category: "Geometry" },

  { mode: "catenary", label: "Catenary", category: "Geometry" },
  { mode: "astroid", label: "Astroid", category: "Geometry" },
  { mode: "cardioid", label: "Cardioid", category: "Geometry" },
  { mode: "lissajous", label: "Lissajous", category: "Geometry" },
  { mode: "cymatic", label: "Cymatic", category: "Geometry" },
  { mode: "guilloche", label: "Guilloche", category: "Geometry" },
  { mode: "trefoil", label: "Trefoil", category: "Geometry" },
  { mode: "quatrefoil", label: "Quatrefoil", category: "Geometry" },
  { mode: "involute", label: "Involute", category: "Geometry" },
  { mode: "rosette", label: "Rosette", category: "Geometry" },
  { mode: "deltoid", label: "Deltoid", category: "Geometry" },
  { mode: "nephroid", label: "Nephroid", category: "Geometry" },
  { mode: "epicycle", label: "Epicycle", category: "Geometry" },
  { mode: "constellation", label: "Constellation", category: "Geometry" },
  { mode: "helix", label: "Helix", category: "Geometry" },
  { mode: "harmonograph", label: "Harmonograph", category: "Geometry" },
  { mode: "voronoi-flow", label: "Voronoi Flow", category: "Geometry" },
  { mode: "mobius-strip", label: "Mobius Strip", category: "Geometry" },
  { mode: "fibonacci-spiral", label: "Fibonacci Spiral", category: "Geometry" },
  { mode: "fractal-tree", label: "Fractal Tree", category: "Geometry" },
  { mode: "weave", label: "Weave", category: "Geometry" },
  // Elemental
  { mode: "dusk",      label: "Dusk",      category: "Elemental" },
  { mode: "ocean",     label: "Ocean",     category: "Elemental" },
  { mode: "flux",      label: "Flux",      category: "Elemental" },
  { mode: "monsoon",   label: "Monsoon",   category: "Elemental" },
  { mode: "magma",     label: "Magma",     category: "Elemental" },
  { mode: "typhoon",   label: "Typhoon",   category: "Elemental" },
  { mode: "chinook", label: "Chinook", category: "Elemental" },
  { mode: "maelstrom", label: "Maelstrom", category: "Elemental" },
  { mode: "deluge", label: "Deluge", category: "Elemental" },
  { mode: "ripple", label: "Ripple", category: "Elemental" },
  // Nature (fire / cellular / light)
  { mode: "flame", label: "Flame", category: "Elemental" },
  // Nature (smooth motion)
  { mode: "starfield", label: "Starfield", category: "Cosmic" },
  { mode: "radiance", label: "Radiance", category: "Elemental" },
  // Elemental (new batch)
  { mode: "rime", label: "Rime", category: "Elemental" },
  { mode: "cirrus", label: "Cirrus", category: "Elemental" },
  { mode: "torrent", label: "Torrent", category: "Elemental" },
  { mode: "aurora-borealis", label: "Aurora Borealis", category: "Elemental" },
  // 3D Worlds
  { mode: "orb", label: "Orb", category: "3D Worlds" },

  { mode: "galaxy", label: "Galaxy", category: "3D Worlds" },
  { mode: "crystal", label: "Crystal", category: "3D Worlds" },

  { mode: "cloud", label: "Cloud", category: "3D Worlds" },

  { mode: "wave", label: "Wave", category: "3D Worlds" },

  { mode: "seabed", label: "Seabed", category: "3D Worlds" },

  { mode: "cage", label: "Cage", category: "3D Worlds" },
  { mode: "field", label: "Star Field", category: "3D Worlds" },
  { mode: "aurora", label: "Aurora Ribbons", category: "3D Worlds" },
  { mode: "bonfire", label: "Bonfire", category: "3D Worlds" },
  { mode: "lotus", label: "Lotus Field", category: "3D Worlds" },
  // Dark
  { mode: "umbra",    label: "Umbra",    category: "Dark" },
  { mode: "inferno",  label: "Inferno",  category: "Dark" },
  { mode: "plasma",   label: "Plasma",   category: "Dark" },
  { mode: "vortex",   label: "Vortex",   category: "Dark" },
  // Dark (new batch)
  { mode: "maelstrom-dark", label: "Maelstrom Dark", category: "Dark" },
  { mode: "obsidian-flow", label: "Obsidian Flow", category: "Dark" },
  { mode: "furnace", label: "Furnace", category: "Dark" },
  // Geometry (April 2026)
  { mode: "parabola", label: "Parabola", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "cassegrain", label: "Cassegrain", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "cissoid", label: "Cissoid", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "agnesi", label: "Agnesi", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "strophoid", label: "Strophoid", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "brachistochrone", label: "Brachistochrone", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "chladni", label: "Chladni", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "caustic-pool", label: "Caustic Pool", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "zoetrope", label: "Zoetrope", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "tangent-field", label: "Tangent Field", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "pedal-curve", label: "Pedal Curve", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "ruled-surface", label: "Ruled Surface", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "waveform", label: "Waveform", category: "Geometry", addedDate: "2026-04-07" },
  { mode: "epicycloid", label: "Epicycloid", category: "Geometry", addedDate: "2026-04-07" },
  // Organic (April 2026)
  { mode: "pelagic", label: "Pelagic", category: "Organic", addedDate: "2026-04-07" },
  { mode: "zooid", label: "Zooid", category: "Organic", addedDate: "2026-04-07" },
  { mode: "laminar", label: "Laminar", category: "Organic", addedDate: "2026-04-07" },
  { mode: "whorl", label: "Whorl", category: "Organic", addedDate: "2026-04-07" },
  { mode: "stamen", label: "Stamen", category: "Organic", addedDate: "2026-04-07" },
  { mode: "meristem", label: "Meristem", category: "Organic", addedDate: "2026-04-07" },
  // Dark (April 2026)
  { mode: "eclipse-ring", label: "Eclipse Ring", category: "Dark", addedDate: "2026-04-07" },
  { mode: "smolder", label: "Smolder", category: "Dark", addedDate: "2026-04-07" },
  { mode: "crucible", label: "Crucible", category: "Dark", addedDate: "2026-04-07" },
  // Dark (April 2026 — visible dark)
  { mode: "ember-drift", label: "Ember Drift", category: "Dark", addedDate: "2026-04-08" },
  { mode: "deep-current", label: "Deep Current", category: "Dark", addedDate: "2026-04-08" },
  { mode: "molten-vein", label: "Molten Vein", category: "Dark", addedDate: "2026-04-08" },
  { mode: "dark-aurora", label: "Dark Aurora", category: "Dark", addedDate: "2026-04-08" },
  { mode: "shadow-fire", label: "Shadow Fire", category: "Dark", addedDate: "2026-04-08" },
  { mode: "dark-tide", label: "Dark Tide", category: "Dark", addedDate: "2026-04-08" },
  { mode: "smoke-signal", label: "Smoke Signal", category: "Dark", addedDate: "2026-04-08" },
  { mode: "iron-forge", label: "Iron Forge", category: "Dark", addedDate: "2026-04-08" },
  { mode: "catacomb-torch", label: "Catacomb Torch", category: "Dark", addedDate: "2026-04-08" },
  { mode: "blood-moon", label: "Blood Moon", category: "Dark", addedDate: "2026-04-08" },
  { mode: "witch-light", label: "Witch Light", category: "Dark", addedDate: "2026-04-08" },
  { mode: "dark-crystal", label: "Dark Crystal", category: "Dark", addedDate: "2026-04-08" },
  { mode: "volcanic", label: "Volcanic", category: "Dark", addedDate: "2026-04-08" },
  { mode: "lightning-field", label: "Lightning Field", category: "Dark", addedDate: "2026-04-08" },
  { mode: "dark-nebula", label: "Dark Nebula", category: "Dark", addedDate: "2026-04-08" },
  { mode: "night-forest", label: "Night Forest", category: "Dark", addedDate: "2026-04-08" },
  // Visionary (April 2026)
  { mode: "kenosis", label: "Kenosis", category: "Visionary", addedDate: "2026-04-07" },
  { mode: "anima", label: "Anima", category: "Visionary", addedDate: "2026-04-07" },
  { mode: "covenant", label: "Covenant", category: "Visionary", addedDate: "2026-04-07" },
  { mode: "vespers", label: "Vespers", category: "Visionary", addedDate: "2026-04-07" },
  { mode: "jubilee", label: "Jubilee", category: "Visionary", addedDate: "2026-04-07" },
  { mode: "pilgrimage", label: "Pilgrimage", category: "Visionary", addedDate: "2026-04-07" },
  { mode: "cataphatic", label: "Cataphatic", category: "Visionary", addedDate: "2026-04-07" },
  { mode: "hesychasm", label: "Hesychasm", category: "Visionary", addedDate: "2026-04-07" },
  { mode: "kairos", label: "Kairos", category: "Visionary", addedDate: "2026-04-07" },
  { mode: "lectio", label: "Lectio", category: "Visionary", addedDate: "2026-04-07" },
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
  // ─── Survivors of review pack #1 — distributed into permanent categories ───
  { mode: "r-mercury", label: "Mercury", category: "Elemental" },
  { mode: "r-embers", label: "Ember Storm", category: "Elemental" },
  { mode: "r-molten", label: "Molten Gold", category: "Elemental" },
  { mode: "r-droplets", label: "Mercury Droplets", category: "Elemental" },
  { mode: "r-petals", label: "Cherry Petals", category: "Cosmic" },
  { mode: "r-stardust", label: "Stardust River", category: "Cosmic" },
  { mode: "sparkler", label: "Sparkler", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "resonant-rings", label: "Resonant Rings", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "comet-swarm", label: "Comet Swarm", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "ember-fountain", label: "Ember Fountain", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "firefly-field", label: "Firefly Field", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "ribbon-of-light", label: "Ribbon of Light", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "orbit-weaver", label: "Orbit Weaver", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "meteor-rain", label: "Meteor Rain", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "murmuration", label: "Murmuration", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "will-o-wisp", label: "Will-o-Wisp", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "galaxy-seed", label: "Galaxy Seed", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "pendulum-dust", label: "Pendulum Dust", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "helix-stream", label: "Helix Stream", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "fracture-light", label: "Fracture Light", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "rose-window", label: "Rose Window", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "cascade-veil", label: "Cascade Veil", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "binary-stars", label: "Binary Stars", category: "Cosmic", addedDate: "2026-09-30" },
  { mode: "r-blackhole", label: "Black Hole", category: "Cosmic" },
  { mode: "r-tendrils", label: "Plasma Tendrils", category: "Cosmic" },
  { mode: "r-kaleido", label: "Kaleidoscope", category: "Geometry" },
  { mode: "r-smokerings", label: "Smoke Rings", category: "Organic" },
  { mode: "r-growth", label: "Tendril Growth", category: "Organic" },
  { mode: "r-silk", label: "Silk Threads", category: "Organic" },
  // ─── Review pack #2 survivors — distributed into permanent categories ───
  { mode: "r2-pixie", label: "Pixie Dust", category: "Visionary" },
  { mode: "r2-sunsetcascade", label: "Sunset Cascade", category: "Visionary" },
  { mode: "r2-spiralgal", label: "Spiral Galaxy", category: "Cosmic" },
  { mode: "r2-photon", label: "Photon Stream", category: "Cosmic" },
  { mode: "r2-portalrim", label: "Portal Rim", category: "Cosmic" },
  { mode: "r2-curlswarm", label: "Curl Swarm", category: "Organic" },
  { mode: "r2-fibers", label: "Fiber Strands", category: "Organic" },
  { mode: "r2-coral", label: "Coral Bloom", category: "Organic" },
  { mode: "r2-spore", label: "Spore Cloud", category: "Organic" },
  { mode: "r2-interference", label: "Wave Interference", category: "Geometry" },
  { mode: "r2-magnetic", label: "Magnetic Field", category: "Geometry" },
  { mode: "r2-thermal", label: "Thermal", category: "Elemental" },
  { mode: "r2-infrared", label: "Infrared", category: "Dark" },
  // ─── Review pack #3 survivors — distributed into permanent categories ───
  { mode: "r3-spirittrails", label: "Spirit Trails", category: "Visionary" },
  { mode: "r3-ghostribbons", label: "Ghost Ribbons", category: "Visionary" },
  { mode: "r3-silkwind", label: "Silk Wind", category: "Visionary" },
  { mode: "r3-dreamtendrils", label: "Dream Tendrils", category: "Visionary" },
  { mode: "r3-fairyglow", label: "Fairy Glow", category: "Visionary" },
  { mode: "r3-wishtrails", label: "Wish Trails", category: "Visionary" },
  { mode: "r3-memoryflow", label: "Memory Flow", category: "Visionary" },
  { mode: "r3-auroradream", label: "Aurora Dream", category: "Visionary" },
  { mode: "r3-heartwarmth", label: "Heart Warmth", category: "Visionary" },
  { mode: "r3-pulseringssoft", label: "Pulse Rings Soft", category: "Visionary" },
  { mode: "r3-softorbit", label: "Soft Orbit", category: "Visionary" },
  { mode: "r3-innerglow", label: "Inner Glow", category: "Visionary" },
  { mode: "r3-plasmastorm", label: "Plasma Storm", category: "Cosmic" },
  { mode: "r3-coronastreams", label: "Corona Streams", category: "Cosmic" },
  { mode: "r3-stellarribbon", label: "Stellar Ribbon", category: "Cosmic" },
  { mode: "r3-aurorastreams", label: "Aurora Streams", category: "Cosmic" },
  { mode: "r3-lightrivers", label: "Light Rivers", category: "Cosmic" },
  { mode: "r3-arcdischarge", label: "Arc Discharge", category: "Dark" },
  { mode: "r3-balllightning", label: "Ball Lightning", category: "Dark" },
  { mode: "r3-lightningveil", label: "Lightning Veil", category: "Dark" },
  { mode: "r3-coralpulse", label: "Coral Pulse", category: "Organic" },
  { mode: "r3-seaweedsway", label: "Seaweed Sway", category: "Organic" },
  { mode: "r3-underwatervines", label: "Underwater Vines", category: "Organic" },
  { mode: "r3-sleepingbloom", label: "Sleeping Bloom", category: "Organic" },
  { mode: "r3-fernunfurl", label: "Fern Unfurl", category: "Organic" },
  { mode: "r3-ripplecascade", label: "Ripple Cascade", category: "Geometry" },
  { mode: "r3-magneticwisps", label: "Magnetic Wisps", category: "Geometry" },
  { mode: "r3-waveveil", label: "Wave Veil", category: "Elemental" },
  // ─── SUN (lab 2026-10-12, promoted 2026-10-13 — light journeys) ───
  { mode: "sun-corona", label: "Sun · Corona Breath", category: "Visionary", addedDate: "2026-10-12" },
  { mode: "sun-veil", label: "Sun · Veiled Sun", category: "Visionary", addedDate: "2026-10-12" },
  { mode: "sun-dawn", label: "Sun · Dawn Fan", category: "Visionary", addedDate: "2026-10-12" },
  { mode: "sun-halo", label: "Sun · Precessing Halo", category: "Visionary", addedDate: "2026-10-12" },
  { mode: "sun-wind", label: "Sun · Solar Wind", category: "Visionary", addedDate: "2026-10-12" },
  { mode: "sun-aster", label: "Sun · Aster", category: "Visionary", addedDate: "2026-10-12" },
];

// Sort shaders alphabetically within each category
MODE_META.sort((a, b) => {
  const catOrder = ["Review", "Visionary", "Cosmic", "Organic", "Geometry", "3D Worlds", "Elemental", "Dark", "AI Imagery"];
  const catDiff = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
  if (catDiff !== 0) return catDiff;
  return a.label.localeCompare(b.label);
});

export const MODE_CATEGORIES = ["Review", "Visionary", "Cosmic", "Organic", "Geometry", "3D Worlds", "Elemental", "Dark", "AI Imagery"] as const;

export const MODES_3D: Set<string> = new Set([
  "orb",
  "galaxy", "crystal",
  "cloud",
  "wave", "seabed",
  "cage",
  // 2026-09-25: four finished scenes that were implemented but never
  // registered — an 8,000-point nebula, a 5,000-point fire, ribbon aurora
  // (3D geometry, not the banned image material), and a lotus field.
  "field", "aurora", "bonfire", "lotus",
]);

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
