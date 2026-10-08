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
import { IMAGERY_ONLY_SOULS, type SoulId } from "@/lib/particles/souls";
import { JOURNEY_MOTIFS, type PhaseMotif } from "@/lib/particles/journey-motifs.generated";

/** The forms cast in journeys = exactly what Karel KEPT in the form review
 *  (2026-10-08, /review/forms — "let me get you the command that shares what i
 *  liked"; he also removed wisp, caustic and the 3-D / grid geometry). His keep
 *  list supersedes the older bans below for the souls he kept (ink, nebula,
 *  harmonics, lissajous, rings, rose, torus). */
export const ORGANIC_SOULS: readonly SoulId[] = [
  "vortex", "murmuration", "ribbons", "tendrils",
  "girih", "medallion", "kaleido", "mandala", "blossom",
  "smoke", "motes", "petals", "embers", "duststorm", "pollen", "fireflies",
  "ink", "waves", "nebula", "fountain",
  "harmonics", "lissajous", "rings", "rose", "torus",
];

/** Banned in journeys: what Karel removed in the form review, plus the old
 *  bans he did not bring back. (Kept-in-review souls are never banned.) */
export const BANNED_SOULS: readonly SoulId[] = [
  "orbitals", "arcs", "knot", "polyhedron", "superformula",
  "cymatics", "geometry", "branches", "spirit", "threads", "helix",
  "bloom", "spirograph", "petalfall", "flame", "wisp", "caustic",
];

type W = [SoulId, number][];
// every family draws on a WIDE set (Karel 2026-10-08: "we really need particle
// forms within journeys … to expand in options and variety")
const FIRE: W = [["vortex", 2.0], ["embers", 2.0], ["motes", 1.4], ["ribbons", 1.1], ["smoke", 1.0], ["murmuration", 1.0], ["mandala", 0.9], ["medallion", 0.8], ["torus", 0.6]];
const LIGHT: W = [["ribbons", 1.1], ["vortex", 1.4], ["motes", 1.2], ["fountain", 1.0], ["harmonics", 1.0], ["murmuration", 1.0], ["medallion", 1], ["girih", 0.8], ["rings", 0.7], ["rose", 0.6]];
const FLORAL: W = [["blossom", 2.4], ["petals", 2.0], ["rose", 1.6], ["pollen", 1.2], ["ribbons", 1.0], ["tendrils", 1.2], ["mandala", 0.9], ["fireflies", 0.6]];
const GREEN: W = [["tendrils", 2.2], ["pollen", 1.6], ["fireflies", 1.6], ["murmuration", 1.4], ["ribbons", 1.2], ["petals", 0.9], ["blossom", 0.9], ["girih", 0.7], ["smoke", 0.6]];
const WATER: W = [["waves", 2.2], ["ink", 1.6], ["fountain", 1.4], ["tendrils", 1.2], ["rings", 1.1], ["ribbons", 1.0], ["vortex", 1.0], ["kaleido", 0.8], ["lissajous", 0.6]];
const CRYSTAL: W = [["kaleido", 2], ["girih", 1.3], ["medallion", 1.1], ["murmuration", 1.2], ["ribbons", 1.0], ["rose", 0.8], ["harmonics", 0.8], ["fireflies", 0.6], ["rings", 0.6]];
const AIR: W = [["smoke", 2.2], ["duststorm", 1.6], ["murmuration", 1.6], ["ribbons", 1.2], ["ink", 1.0], ["vortex", 1.0], ["pollen", 0.8], ["girih", 0.6]];
const COSMOS: W = [["nebula", 2.2], ["vortex", 2.0], ["torus", 1.4], ["murmuration", 1.4], ["rings", 1.2], ["lissajous", 1.0], ["motes", 0.8], ["medallion", 0.8], ["kaleido", 0.7]];
const GEO: W = [["girih", 1.6], ["kaleido", 1.4], ["harmonics", 1.3], ["lissajous", 1.2], ["rose", 1.1], ["medallion", 1], ["torus", 1.0], ["ribbons", 0.9], ["rings", 0.8]];
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
  rising: [["blossom", 0.5], ["motes", 0.5], ["fountain", 0.4]],
  unfurling: [["blossom", 1]],
  rippling: [["waves", 1], ["rings", 0.6]],
  swirling: [["medallion", 0.6], ["kaleido", 0.5]],
  spiraling: [["medallion", 0.6], ["mandala", 0.5]],
  pulsing: [["mandala", 0.5], ["medallion", 0.5]],
  flowing: [["girih", 0.5]],
  streaming: [["girih", 0.5]],
  drifting: [["girih", 0.4], ["blossom", 0.3], ["pollen", 0.4], ["smoke", 0.3]],
  flickering: [["kaleido", 0.5], ["fireflies", 0.5], ["embers", 0.4]],
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
    .map(([id]) => id)
    // diversity (Karel 2026-10-07: "i just want such diversity in geometry and
    // shape users dont notice repetition"): two more organic forms per phase
    // (2026-10-08 expansion: three, from the full kept set)
    .concat(ORGANIC_SOULS.filter((x) => !score.has(x) && !IMAGERY_ONLY_SOULS.includes(x)).sort((a, b) => hash01(`${seed}:x:${a}`) - hash01(`${seed}:x:${b}`)).slice(0, 3));
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
