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
  "flame", "wisp", "blossom", "caustic", "petalfall", "bloom", "rose", "mandala", "kaleido",
  "spirograph", "vortex", "nebula", "murmuration", "ribbons", "ink", "tendrils",
];

/** Banned in journeys (Karel 2026-10-06): 3-D ellipses, squares/grids, the tree, the cube. */
export const BANNED_SOULS: readonly SoulId[] = [
  "orbitals", "rings", "arcs", "lissajous", "knot", "harmonics", "polyhedron", "superformula",
  "torus", "cymatics", "geometry", "branches", "spirit", "threads", "helix",
];

type W = [SoulId, number][];
const MOTIF_FORMS: Record<string, W> = {
  // fire is a FAMILY, not one shape (Karel 2026-10-06: Realized "had the flame
  // in some form the entire time … there needs to be numerous forms")
  fire: [["flame", 2.4], ["wisp", 1.6], ["vortex", 1.4], ["bloom", 1.2], ["mandala", 1.1], ["rose", 1]],
  lava: [["ink", 2], ["flame", 1.8], ["ribbons", 1.4], ["vortex", 1.2], ["wisp", 1]],
  embers: [["murmuration", 1.8], ["flame", 1.8], ["wisp", 1.4], ["nebula", 1.2], ["bloom", 1]],
  sun: [["flame", 1.5], ["bloom", 1.5], ["mandala", 1], ["vortex", 1]],
  "light-rays": [["bloom", 1.5], ["mandala", 1], ["wisp", 1], ["nebula", 0.8]],
  "golden-light": [["bloom", 1.5], ["wisp", 1], ["nebula", 1], ["blossom", 0.8]],
  flowers: [["blossom", 3], ["rose", 2], ["mandala", 1.5], ["bloom", 1.5], ["petalfall", 1]],
  blossoms: [["blossom", 3], ["petalfall", 2], ["rose", 1.5], ["bloom", 1.2]],
  petals: [["petalfall", 2.5], ["blossom", 2.5], ["rose", 1.2]],
  butterflies: [["murmuration", 2], ["petalfall", 1.5], ["blossom", 1]],
  leaves: [["tendrils", 2], ["petalfall", 1.5], ["bloom", 1]],
  forest: [["tendrils", 2], ["wisp", 1], ["murmuration", 1]],
  mushrooms: [["bloom", 2], ["tendrils", 1.5], ["nebula", 1]],
  vines: [["tendrils", 2.5], ["ribbons", 1], ["rose", 0.8]],
  water: [["caustic", 3], ["ink", 1.5], ["ribbons", 1.5]],
  "ocean-waves": [["caustic", 2], ["ribbons", 2], ["ink", 1]],
  rain: [["caustic", 2], ["petalfall", 1], ["ink", 1]],
  "pool-ripples": [["caustic", 3], ["blossom", 1], ["ink", 1]],
  underwater: [["caustic", 2], ["tendrils", 2], ["ink", 1.5]],
  "ice-snow": [["kaleido", 2], ["spirograph", 1.2], ["mandala", 1.2], ["nebula", 1]],
  crystal: [["kaleido", 2.5], ["spirograph", 1.5], ["mandala", 1]],
  clouds: [["wisp", 2], ["nebula", 2], ["ribbons", 1]],
  mist: [["wisp", 2.5], ["nebula", 1.5], ["ink", 1]],
  smoke: [["wisp", 3], ["ink", 1.5], ["ribbons", 1]],
  wind: [["ribbons", 2.5], ["wisp", 1.5], ["murmuration", 1]],
  "sand-desert": [["ribbons", 2], ["wisp", 1.5], ["vortex", 1]],
  stone: [["wisp", 1.5], ["nebula", 1], ["mandala", 1]],
  "cave-tunnel": [["vortex", 2], ["wisp", 1.5], ["nebula", 1]],
  stars: [["vortex", 2], ["nebula", 1.5], ["murmuration", 1.5]],
  nebula: [["nebula", 3], ["vortex", 1.5], ["ink", 1]],
  galaxy: [["vortex", 3], ["nebula", 1.5]],
  planet: [["vortex", 1.5], ["nebula", 1.5], ["mandala", 1]],
  aurora: [["ribbons", 3], ["wisp", 1.5], ["nebula", 1]],
  figure: [["bloom", 1.5], ["wisp", 1.5], ["ribbons", 1]],
  "wings-feathers": [["ribbons", 2], ["murmuration", 1.5], ["petalfall", 1], ["blossom", 1]],
  "birds-flock": [["murmuration", 3], ["ribbons", 1]],
  fireflies: [["murmuration", 2], ["nebula", 1], ["bloom", 1]],
  "city-neon": [["spirograph", 2], ["kaleido", 1.5], ["ribbons", 1.5]],
  "silk-fabric": [["ribbons", 3], ["wisp", 1]],
  geometric: [["kaleido", 2], ["mandala", 2], ["spirograph", 1.5]],
};
const MOVE_FORMS: Record<string, W> = {
  rising: [["flame", 0.6], ["wisp", 0.8]],
  falling: [["petalfall", 1]],
  swirling: [["vortex", 0.8], ["rose", 0.5]],
  spiraling: [["vortex", 0.8], ["spirograph", 0.5]],
  unfurling: [["blossom", 1], ["bloom", 0.5]],
  rippling: [["caustic", 1]],
  flowing: [["ribbons", 0.8], ["ink", 0.4]],
  streaming: [["ribbons", 0.8], ["murmuration", 0.4]],
  drifting: [["nebula", 0.5], ["wisp", 0.4]],
  flickering: [["flame", 0.5]],
  pulsing: [["mandala", 0.5], ["bloom", 0.5]],
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
  /** motion multiplier from the imagery's movement (flicker livelier, drift calmer) */
  motion: number;
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
    return { forms, fire, floral, motion };
  });
}

/** Forms that read beautifully as a FIELD of many small copies. */
export const FIELD_FORMS: ReadonlySet<SoulId> = new Set(["blossom", "flame", "rose", "bloom", "mandala", "kaleido", "spirograph", "vortex", "wisp"]);

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
