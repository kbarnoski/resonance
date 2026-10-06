/**
 * PARTICLE LEAD — registry of journeys that carry the GPU particle language
 * (src/lib/particles/ + particle-casting.ts).
 *
 * v3 ROLLOUT (Karel 2026-10-05: "roll particles out … to all including
 * snowflake and ghost and all expansion and other journeys. its critical
 * they are elegant and perfectly integrate into each journey"): every
 * journey with a v2 deep-analysis profile (particle-profiles.generated.ts,
 * baked by scripts/build-particle-profiles.mjs in kiosk-loop order) is cast,
 * neighbours never sharing a form.
 *
 * MASTERED journeys (Snowflake, Ghost) get the particle layer ONLY: their
 * shader stack is never stripped (withParticleLeadSupports refuses them) —
 * nothing else about how they play changes (mastered-lock fingerprints the
 * cast so any later change is deliberate).
 */
import type { ParticlePalette, SoulId } from "@/lib/particles/souls";
import { isMasteredJourney, MASTERED_JOURNEY_NAMES } from "./mastered";
import { castSet, type ParticleCast } from "./particle-casting";
import { PARTICLE_PROFILES } from "./particle-profiles.generated";

export const LANTERN_ID = "910e6b62-abb8-40d1-bd31-ccdf6038f122";
export const STIR_CRAZY_ID = "cd517f5a-c4eb-4d50-8a53-044aa668d087";
export const OPEN_JAM_ID = "bd748991-a67b-41dc-af94-ac3f612a27c4";

/** Cast order = the generated profile order (kiosk loop first). */
export const PARTICLE_JOURNEY_IDS: readonly string[] = Object.keys(PARTICLE_PROFILES);

export interface ParticleLeadCast extends ParticleCast {
  /** Image dissolve ↔ reform on (some) transitions. */
  dissolve: boolean;
  /** Mastered journey: particle layer only, shader stack never touched. */
  mastered: boolean;
  /** Layer gain (energy) — 1 = engine default. */
  gain?: number;
}

const isMasteredId = (id: string, name: string) => isMasteredJourney(id) || MASTERED_JOURNEY_NAMES.has(name.trim().toLowerCase());

/** Theme signatures: a journey's own particle form at chosen travel morphs
 *  (index = the morph INTO that phase). Ghost (Karel 2026-10-05: "the
 *  particles should ghost like moving form at a couple points"): the spirit
 *  rises with the morph into transcendence (out of the tunnel toward the
 *  light) and again into integration (joining the light). */
export const JOURNEY_SIGNATURES: Readonly<Record<string, { soul: SoulId; morphs: readonly number[] }>> = {
  ghost: { soul: "spirit", morphs: [2, 5] },
};

/** Casts for the registry — built once, in loop order, neighbours differ. */
export const PARTICLE_LEADS: Readonly<Record<string, ParticleLeadCast>> = (() => {
  const ids = PARTICLE_JOURNEY_IDS;
  const casts = castSet(ids.map((id) => PARTICLE_PROFILES[id]));
  const out: Record<string, ParticleLeadCast> = {};
  ids.forEach((id, i) => {
    const cast = { ...casts[i], dissolve: true, mastered: isMasteredId(id, PARTICLE_PROFILES[id].name) };
    const sig = JOURNEY_SIGNATURES[id];
    if (sig) {
      const morphSouls = [...cast.morphSouls];
      for (const k of sig.morphs) if (k < morphSouls.length) morphSouls[k] = sig.soul;
      cast.morphSouls = morphSouls;
    }
    out[id] = cast;
  });
  return out;
})();

/** The cast for a journey (by id), or null if it has no analysis profile. */
/** KILL SWITCH (2026-10-05): particle v3 froze the real kiosk Chrome on
 *  Snowflake right as particles first emerged (~0:08-0:09; 1.1s frame gap
 *  then a hang), reproducibly. Headless GPU checks never caught it. Off
 *  everywhere until the hang is root-caused and verified in kiosk Chrome. */
export const PARTICLES_ENABLED = true;

/** On-kiosk A/B (2026-10-05): the remote's "particles-on" sets this for the
 *  kiosk tab only (sessionStorage), so particles can be measured on the real
 *  GPU while the shipped default stays off. */
export const PARTICLES_SESSION_KEY = "resonance-particles-ab";
export function particlesForcedThisSession(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(PARTICLES_SESSION_KEY) === "1";
  } catch { return false; }
}

export function particleLeadFor(journey?: { id?: string | null; name?: string | null } | null): ParticleLeadCast | null {
  if (!PARTICLES_ENABLED && !particlesForcedThisSession()) return null;
  if (!journey?.id) return null;
  const cast = PARTICLE_LEADS[journey.id] ?? null;
  if (!cast) return null;
  // a shared/path row wrapping a mastered built-in plays under its name
  if (!cast.mastered && journey.name && MASTERED_JOURNEY_NAMES.has(journey.name.trim().toLowerCase())) return { ...cast, mastered: true };
  return cast;
}

/** Travel morphs ride the phase changes (and the journey handoff), so the
 *  particle system stays out of their way for this long after one. Hero
 *  clips inside a phase are imagery like the stills — not guarded (headless
 *  2026-10-05: a clip-guard held every dissolve and break in pack mode). */
export const MORPH_GUARD_SEC = 14;

/** Full-screen particle moments are RARE (Karel 2026-10-05: "only rarely do
 *  the full screen particle effect its too over the top"): one still-to-
 *  particles dissolve per journey at most. */
export const MAX_DISSOLVES_PER_JOURNEY = 1;

export function morphGuard(sincePhaseChange: number, boundarySettle: boolean): boolean {
  return boundarySettle || sincePhaseChange < MORPH_GUARD_SEC;
}

/** Dissolve gate: only inside a conducted transition window, once per window,
 *  and never against a travel morph / handoff. */
export function dissolveAllowed(o: {
  inTransitionWindow: boolean;
  windowAlreadyDissolved: boolean;
  sincePhaseChange: number;
  boundarySettle: boolean;
  /** seconds until the next phase change (Infinity if none) */
  untilPhaseChange?: number;
}): boolean {
  if (morphGuard(o.sincePhaseChange, o.boundarySettle)) return false;
  if ((o.untilPhaseChange ?? Infinity) < 12) return false; // a 10.5 s dissolve must finish before the morph
  return o.inTransitionWindow && !o.windowAlreadyDissolved;
}

function hexToLinear(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.6, 0.6, 0.7];
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return [c[0], c[1], c[2]];
}

/** Lift a colour so its brightest channel is at least `floor` (keeps hue). */
function lift(c: [number, number, number], floor = 0.55): [number, number, number] {
  const mx = Math.max(c[0], c[1], c[2], 1e-4);
  const k = mx < floor ? floor / mx : 1;
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
}

/** The journey's phase palette → particle palette: bass motes wear the
 *  primary, mid motes the accent, the finest treble dust the glow. */
export function particlePaletteFrom(p?: { primary: string; secondary: string; accent: string; glow: string } | null, voice = 1): ParticlePalette | null {
  if (!p) return null;
  // voicings of the journey's own palette (low / mid / high band), dark → bright
  const P = p.primary, S = p.secondary, A = p.accent, G = p.glow;
  const v = [[S, P, A], [P, A, G], [A, P, G], [P, G, A]][Math.max(0, Math.min(3, Math.round(voice)))];
  return { low: lift(hexToLinear(v[0])), mid: lift(hexToLinear(v[1])), high: lift(hexToLinear(v[2]), 0.7) };
}

/** Strip dual + tertiary shaders while particles are PRESENT (one supporting
 *  shader) — never on a mastered journey. */
export function withParticleLeadSupports<T extends { dualShaderMode?: string; tertiaryShaderMode?: string }>(
  frame: T | null,
  lead: ParticleLeadCast | null,
  present = true,
): T | null {
  if (!frame || !lead || lead.mastered || !present) return frame;
  if (!frame.dualShaderMode && !frame.tertiaryShaderMode) return frame;
  return { ...frame, dualShaderMode: undefined, tertiaryShaderMode: undefined };
}
