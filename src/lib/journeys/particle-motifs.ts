// ─────────────────────────────────────────────────────────────────────────────
// particle-motifs.ts — the DESIGN PRINCIPLE of the particle system (Karel
// 2026-10-06): "it needs intelligence of the images it is layered on as input
// to the forms it shows. not literal but hint and abstraction of including
// associated movements … in realized if the theme is lots of lava and fire
// … the particle should abstractly show itself as fire flames moving and
// colors of fire from a bit of blue through hot colors."
//
// Each journey phase's imagery is vision-tagged offline (scripts/tag-journey-
// imagery.mjs → journey-motifs.generated.ts). Here motifs become FORMS (an
// organic majority — flowers as evolving floral patterns, never stems; no
// cheesy 3-D ellipses, no squares), MOTION and a COLOUR behaviour.
// ─────────────────────────────────────────────────────────────────────────────
import type { SoulId } from "@/lib/particles/souls";
import { JOURNEY_MOTIFS, type PhaseMotif } from "@/lib/particles/journey-motifs.generated";

/** The organic language — the only forms cast in journeys. */
export const ORGANIC_SOULS: readonly SoulId[] = [
  // v8 INTRICATE language (Karel 2026-10-06): Islamic-geometric girih +
  // medallions, mandala, kaleidoscope, blossom fields; fire keeps its flame,
  // water its caustic web
  "girih", "medallion", "mandala", "kaleido", "blossom", "caustic",
];

/** Banned in journeys: 3-D ellipses, squares/grids, the tree, the cube — and
 *  (v8, "a lot of basic shapes and unclear stuff") the basic / unclear forms. */
export const BANNED_SOULS: readonly SoulId[] = [
  "orbitals", "rings", "arcs", "lissajous", "knot", "harmonics", "polyhedron", "superformula",
  "torus", "cymatics", "geometry", "branches", "spirit", "threads", "helix",
  "bloom", "vortex", "rose", "spirograph", "nebula", "ink", "murmuration", "ribbons", "tendrils", "wisp", "petalfall",
  "flame", // Karel 2026-10-06: "stay away from this type of tiny form" (a small blocky flame)
];

type W = [SoulId, number][];
const FIRE: W = [["mandala", 2.2], ["medallion", 1.8], ["girih", 1.4], ["kaleido", 1]];
const LIGHT: W = [["medallion", 2], ["girih", 1.8], ["mandala", 1.5], ["kaleido", 1]];
const FLORAL: W = [["blossom", 3], ["medallion", 1.5], ["mandala", 1.5], ["kaleido", 1]];
const GREEN: W = [["blossom", 1.2], ["girih", 1.4], ["mandala", 1.2], ["kaleido", 1]];
const WATER: W = [["caustic", 2.5], ["medallion", 1.4], ["kaleido", 1.2], ["girih", 1]];
const CRYSTAL: W = [["kaleido", 2.5], ["girih", 2], ["medallion", 1.5]];
const AIR: W = [["girih", 1.6], ["medallion", 1.5], ["mandala", 1.2], ["kaleido", 1]];
const COSMOS: W = [["medallion", 2], ["kaleido", 1.6], ["girih", 1.4], ["mandala", 1.2]];
const GEO: W = [["girih", 2.5], ["kaleido", 2], ["medallion", 1.5]];
const MOTIF_FORMS: Record<string, W> = {
  fire: FIRE, lava: FIRE, embers: FIRE, sun: FIRE,
  "light-rays": LIGHT, "golden-light": LIGHT, figure: LIGHT,
  flowers: FLORAL, blossoms: FLORAL, petals: FLORAL, butterflies: FLORAL, "wings-feathers": FLORAL,
  leaves: GREEN, forest: GREEN, mushrooms: GREEN, vines: GREEN, fireflies: GREEN, "birds-flock": GREEN,
  water: WATER, "ocean-waves": WATER, rain: WATER, "pool-ripples": WATER, underwater: WATER,
  "ice-snow": CRYSTAL, crystal: CRYSTAL,
  clouds: AIR, mist: AIR, smoke: AIR, wind: AIR, "sand-desert": AIR, stone: AIR, "cave-tunnel": AIR,
  stars: COSMOS, nebula: COSMOS, galaxy: COSMOS, planet: COSMOS, aurora: COSMOS,
  "city-neon": GEO, "silk-fabric": GEO, geometric: GEO,
};
const MOVE_FORMS: Record<string, W> = {
  rising: [["blossom", 0.5]],
  unfurling: [["blossom", 1]],
  rippling: [["caustic", 1]],
  swirling: [["medallion", 0.6], ["kaleido", 0.5]],
  spiraling: [["medallion", 0.6], ["mandala", 0.5]],
  pulsing: [["mandala", 0.5], ["medallion", 0.5]],
  flowing: [["girih", 0.5]],
  streaming: [["girih", 0.5]],
  drifting: [["girih", 0.4], ["blossom", 0.3]],
  flickering: [["kaleido", 0.5]],
};

function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/** Ranked forms for one phase's imagery (strongest first, 4 at most). */
export function formsForMotif(pm: PhaseMotif | undefined, seed: string): SoulId[] {
  if (!pm?.motifs?.length) return [];
  const score = new Map<SoulId, number>();
  for (const { m, w } of pm.motifs) for (const [id, k] of MOTIF_FORMS[m] ?? []) score.set(id, (score.get(id) ?? 0) + k * (0.3 + w));
  for (const mv of pm.moves ?? []) for (const [id, k] of MOVE_FORMS[mv] ?? []) score.set(id, (score.get(id) ?? 0) + k);
  return [...score.entries()]
    .filter(([id]) => ORGANIC_SOULS.includes(id))
    .map(([id, v]) => [id, v * (0.92 + 0.16 * hash01(`${seed}:${id}`))] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);
}

export interface PhaseCharacter {
  forms: SoulId[];
  /** fire-like imagery: flame colour ramp (a hint of blue → hot → ember) */
  fire: boolean;
  /** floral imagery (petals, blossoms, flowers): the palette's pinks lead */
  floral: boolean;
  /** imagery family → which motif-form designs the field forms (pack: motif-forms.json) */
  family: string;
  /** motion multiplier from the imagery's movement (flicker livelier, drift calmer) */
  motion: number;
}

const FAMILY_OF: Record<string, string> = {
  fire: "fire", lava: "fire", embers: "fire", sun: "fire",
  flowers: "floral", blossoms: "floral", petals: "floral", butterflies: "floral",
  leaves: "green", forest: "green", mushrooms: "green", vines: "green", fireflies: "green", "birds-flock": "green",
  water: "water", "ocean-waves": "water", rain: "water", "pool-ripples": "water", underwater: "water",
  "ice-snow": "crystal", crystal: "crystal",
  clouds: "air", mist: "air", smoke: "air", wind: "air", "sand-desert": "air", stone: "air", "cave-tunnel": "air",
  stars: "cosmos", nebula: "cosmos", galaxy: "cosmos", planet: "cosmos", aurora: "cosmos",
  "light-rays": "light", "golden-light": "light", figure: "light", "wings-feathers": "light",
  "city-neon": "geo", "silk-fabric": "geo", geometric: "geo",
};
/** The imagery FAMILY of a phase (its strongest motif) — picks motif-form designs. */
export function familyOf(pm: PhaseMotif | undefined): string {
  for (const { m } of pm?.motifs ?? []) if (FAMILY_OF[m]) return FAMILY_OF[m];
  return "geo";
}

/** Per phase: forms + colour behaviour + motion, from the vision tags. */
export function phaseCharacters(journeyId: string): PhaseCharacter[] {
  const ph = JOURNEY_MOTIFS[journeyId] ?? [];
  return ph.map((pm, i) => {
    const forms = formsForMotif(pm, `${journeyId}#${i}`);
    const top = new Set((pm?.motifs ?? []).slice(0, 2).map((x) => x.m));
    const fire = top.has("fire") || top.has("lava") || top.has("embers");
    const floral = ["petals", "blossoms", "flowers"].some((m) => (pm?.motifs ?? []).some((x) => x.m === m));
    const mv = new Set(pm?.moves ?? []);
    const motion = mv.has("flickering") || mv.has("swirling") || mv.has("streaming") ? 1.2 : mv.has("drifting") || mv.has("still") ? 0.8 : 1;
    return { forms, fire, floral, motion, family: familyOf(pm) };
  });
}

/** Forms that read beautifully as a FIELD of many small copies. */
export const FIELD_FORMS: ReadonlySet<SoulId> = new Set(["blossom", "medallion", "mandala", "kaleido"]);

/** Forms that carry FULL-SPECTRUM colour (Karel 2026-10-06: "mind blowing ones
 *  with lots of full spectrum color and patterns") — anchored on the palette,
 *  the hue wheels around the form and ripples outward through its rings. */
export const SPECTRUM_FORMS: ReadonlySet<SoulId> = new Set(["mandala", "medallion", "girih", "kaleido"]);

/** Shaders drawn around the screen centre (suns, portals, mandalas …): the
 *  particles align exactly with that centre point (Karel 2026-10-06). */
export const CENTERED_SHADERS: ReadonlySet<string> = new Set([
  "portal", "halo", "yantra", "pulsar", "quasar", "supernova", "protostar", "nova", "whirlpool",
  "orb", "lotus", "vortex", "eclipse-ring", "dark-bloom", "r2-portalrim", "r3-softorbit",
  "r3-coronastreams", "r3-sleepingbloom", "orbit-weaver", "binary-stars",
]);
export function isCenteredShader(mode?: string | null): boolean {
  if (!mode) return false;
  return CENTERED_SHADERS.has(mode) || /sun|solar|corona|mandala|portal|iris|eclipse/.test(mode);
}

/** Shaders with their own moving particle-like elements: the field follows
 *  their motion and trails it (Karel: "have your particle system follow it
 *  and trail so they interplay"). */
export const PARTICLE_LIKE_SHADERS: ReadonlySet<string> = new Set([
  "ember", "pollen", "ember-drift", "r-embers", "r-petals", "r-stardust", "sparkler", "comet-swarm",
  "ember-fountain", "firefly-field", "meteor-rain", "murmuration", "pendulum-dust", "r2-curlswarm",
  "r3-fairyglow", "r3-innerglow",
]);
