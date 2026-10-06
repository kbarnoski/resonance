/**
 * PARTICLE LEAD — registry of journeys that carry the GPU particle language
 * (src/lib/particles/ + particle-casting.ts). OPT-IN: every journey not
 * listed plays exactly as before.
 *
 * v2 (Karel 2026-10-05, after the Lantern pilot: "i do like how they
 * transition as part of imaging. having them always there and always part of
 * every transition gets too much … sometimes … particle against the black"):
 * particles are CONDUCTED from each journey's v2 deep analysis — present only
 * for chosen moments (a few section-change transitions, builds, the summit,
 * the coda), with 2–3 particle-only breaks (imagery + shaders veiled to
 * black), colour following the harmony, playfulness from the texture.
 *
 * Review set: Lantern (devotional waves), Stir Crazy (restless, circling,
 * rhythmic), Open Jam (brooding E-minor drone) — contrasting on purpose.
 * NEVER Snowflake / Ghost (mastered) until Karel says so.
 */
import type { ParticlePalette } from "@/lib/particles/souls";
import { isMasteredJourneyLike } from "./mastered";
import { castJourney, type ParticleCast } from "./particle-casting";
import { PARTICLE_PROFILES } from "./particle-profiles.generated";

export const LANTERN_ID = "910e6b62-abb8-40d1-bd31-ccdf6038f122";
export const STIR_CRAZY_ID = "cd517f5a-c4eb-4d50-8a53-044aa668d087";
export const OPEN_JAM_ID = "bd748991-a67b-41dc-af94-ac3f612a27c4";

/** Cast order (Lantern → Open Jam are loop neighbours in Vigil). */
export const PARTICLE_JOURNEY_IDS: readonly string[] = [LANTERN_ID, OPEN_JAM_ID, STIR_CRAZY_ID];

export interface ParticleLeadCast extends ParticleCast {
  /** Image dissolve ↔ reform on (some) transitions. */
  dissolve: boolean;
  /** Layer gain (energy) — 1 = engine default. */
  gain?: number;
}

/** Casts for the registry — built once; review set avoids sharing any soul. */
export const PARTICLE_LEADS: Readonly<Record<string, ParticleLeadCast>> = (() => {
  const out: Record<string, ParticleLeadCast> = {};
  const used = new Set<ParticleCast["souls"]["peak"]>();
  for (const id of PARTICLE_JOURNEY_IDS) {
    const prof = PARTICLE_PROFILES[id];
    if (!prof) continue;
    const cast = castJourney(prof, used);
    for (const s of Object.values(cast.souls)) used.add(s);
    out[id] = { ...cast, dissolve: true };
  }
  return out;
})();

/** The cast for a journey, or null (not opted in, or mastered — never). */
export function particleLeadFor(journey?: { id?: string | null; name?: string | null } | null): ParticleLeadCast | null {
  if (!journey?.id) return null;
  if (isMasteredJourneyLike(journey)) return null;
  return PARTICLE_LEADS[journey.id] ?? null;
}

/** Travel morphs ride the phase changes (and the journey handoff), so the
 *  particle system stays out of their way for this long after one. Hero
 *  clips inside a phase are imagery like the stills — not guarded (headless
 *  2026-10-05: a clip-guard held every dissolve and break in pack mode). */
export const MORPH_GUARD_SEC = 14;

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
export function particlePaletteFrom(p?: { primary: string; secondary: string; accent: string; glow: string } | null): ParticlePalette | null {
  if (!p) return null;
  return { low: lift(hexToLinear(p.primary)), mid: lift(hexToLinear(p.accent)), high: lift(hexToLinear(p.glow), 0.7) };
}

/** Strip dual + tertiary shaders while particles lead (one supporting shader). */
export function withParticleLeadSupports<T extends { dualShaderMode?: string; tertiaryShaderMode?: string }>(
  frame: T | null,
  lead: ParticleLeadCast | null,
): T | null {
  if (!frame || !lead) return frame;
  if (!frame.dualShaderMode && !frame.tertiaryShaderMode) return frame;
  return { ...frame, dualShaderMode: undefined, tertiaryShaderMode: undefined };
}
