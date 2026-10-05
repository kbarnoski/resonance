/**
 * PARTICLE LEAD — the real GPU particle engine (src/lib/particles/) cast as a
 * journey's lead actor (Karel 2026-10-05: "i had wanted you to explore a
 * particle engine as part of the app"). OPT-IN per journey via this map —
 * every journey not listed plays exactly as before.
 *
 * Casting:
 *  - souls: the soul sequence, one per journey PHASE in arc order (wraps);
 *    at each phase change the field FLOWS into the next soul (8 s blend —
 *    never a cut).
 *  - palette: always the journey's own phase palette (frame.palette, which
 *    comes from its analysis-derived theme) — never derived from the title.
 *
 * While particles lead, the shader stack drops to ONE supporting shader
 * (the primary; dual + tertiary stripped) — the perf budget, and so the
 * lead reads as the lead.
 *
 * NEVER on mastered journeys (Snowflake, Ghost) — particleLeadFor() refuses
 * them even if listed, and particle-lead.test.ts guards the map.
 */
import type { SoulId, ParticlePalette } from "@/lib/particles/souls";
import type { JourneyPhaseId } from "./types";
import { isMasteredJourneyLike } from "./mastered";

export interface ArcKey {
  /** seconds into the track */
  t: number;
  soul: SoulId;
  /** world visibility fraction (0 = only the last ember, 1 = all) */
  density: number;
}

export interface ParticleLeadCast {
  /** Journey name (for logs/review — matching is by id). */
  name: string;
  /** Soul per phase, arc order; wraps if shorter than the phase list.
   *  Ignored when `arc` is present. */
  souls: readonly SoulId[];
  /** World-element arc keyed to the track's own timeline (from its v2 deep
   *  analysis). Soul = the last key at or before now; density interpolates. */
  arc?: readonly ArcKey[];
  /** Image dissolve ↔ reform between stills inside phases. */
  dissolve?: boolean;
  /** Layer gain (energy) — 1 = engine default. */
  gain?: number;
}

/**
 * The PILOT (Karel 2026-10-05: "build the particle engine into ONE journey
 * for joint review"): Vigil · Lantern. Its v2 deep analysis (recording
 * 4516fc4b…, 308.6 s, "a warm, glowing devotion that swells and recedes in
 * waves … settling into an open, unresolved calm"): quiet opening 0–25 s;
 * waves cresting ~55 s / ~100 s / ~160 s; valleys ~85 s / ~140 s / ~185 s;
 * the build 195→ the D♭maj13 summit at 221 s (intensity 0.85); a second
 * wave to 270 s; fading to the quietest moment at 303 s.
 * World element = seed-lantern motes: sparse in the opening and the valleys,
 * a swarm on each build, a full cosmic swirl at the summit, one ember at
 * the end.
 */
export const LANTERN_ID = "910e6b62-abb8-40d1-bd31-ccdf6038f122";

export const LANTERN_ARC: readonly ArcKey[] = [
  { t: 0, soul: "motes", density: 0.0015 }, // a few hundred lantern motes
  { t: 22, soul: "motes", density: 0.004 },
  { t: 30, soul: "murmuration", density: 0.12 }, // first wave — a swarm gathers
  { t: 58, soul: "murmuration", density: 0.15 },
  { t: 70, soul: "motes", density: 0.004 }, // valley ~85 s
  { t: 88, soul: "motes", density: 0.004 },
  { t: 94, soul: "murmuration", density: 0.3 }, // wave to ~100 s
  { t: 128, soul: "murmuration", density: 0.22 },
  { t: 136, soul: "motes", density: 0.003 }, // valley ~140 s
  { t: 150, soul: "murmuration", density: 0.3 }, // build 150–177 s
  { t: 176, soul: "murmuration", density: 0.25 },
  { t: 182, soul: "motes", density: 0.004 }, // the breath before the summit
  { t: 197, soul: "murmuration", density: 0.5 }, // the build
  { t: 210, soul: "vortex", density: 1.0 }, // cosmic swirl — summit 221 s
  { t: 236, soul: "vortex", density: 0.85 },
  { t: 250, soul: "vortex", density: 0.45 }, // dip ~250 s
  { t: 262, soul: "vortex", density: 0.7 }, // second wave ~270 s
  { t: 278, soul: "motes", density: 0.02 }, // the long fade
  { t: 292, soul: "motes", density: 0.003 },
  { t: 302, soul: "motes", density: 0 }, // one ember
];

export const PARTICLE_LEADS: Readonly<Record<string, ParticleLeadCast>> = {
  [LANTERN_ID]: {
    name: "Lantern",
    souls: ["motes"],
    arc: LANTERN_ARC,
    dissolve: true,
  },
};

/** Arc state at time t (seconds). */
export function arcAt(arc: readonly ArcKey[], t: number): { soul: SoulId; density: number } {
  if (!arc.length) return { soul: "motes", density: 1 };
  if (t <= arc[0].t) return { soul: arc[0].soul, density: arc[0].density };
  for (let i = 0; i < arc.length - 1; i++) {
    const a = arc[i], b = arc[i + 1];
    if (t < b.t) {
      const k = (t - a.t) / (b.t - a.t);
      return { soul: a.soul, density: a.density + (b.density - a.density) * k };
    }
  }
  const last = arc[arc.length - 1];
  return { soul: last.soul, density: last.density };
}

/** Dissolve gate: restraint rules for image dissolve ↔ reform. */
export function dissolveAllowed(o: {
  t: number;
  duration: number;
  density: number;
  sinceLastDissolve: number;
  sincePhaseChange: number;
  morphActive: boolean;
  boundarySettle: boolean;
}): boolean {
  if (o.morphActive || o.boundarySettle) return false; // never fight a travel morph / handoff
  if (o.sincePhaseChange < 8) return false; // phase changes belong to the morphs
  if (o.t < 12 || (o.duration > 0 && o.t > o.duration - 15)) return false; // opening + the last ember
  if (o.density > 0.35) return false; // the summit belongs to the swirl
  return o.sinceLastDissolve >= 18; // ~every other still, never wallpaper
}

export const PHASE_ORDER: readonly JourneyPhaseId[] = [
  "threshold",
  "expansion",
  "transcendence",
  "illumination",
  "return",
  "integration",
];

/** The cast for a journey, or null (not opted in, or mastered — never). */
export function particleLeadFor(journey?: { id?: string | null; name?: string | null } | null): ParticleLeadCast | null {
  if (!journey?.id) return null;
  if (isMasteredJourneyLike(journey)) return null;
  return PARTICLE_LEADS[journey.id] ?? null;
}

export function soulForPhase(cast: ParticleLeadCast, phase?: string | null): SoulId {
  const i = Math.max(0, PHASE_ORDER.indexOf((phase ?? "threshold") as JourneyPhaseId));
  return cast.souls[i % cast.souls.length];
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

/** Lift a colour so its brightest channel is at least `floor` (keeps hue).
 *  A theme's "primary" can be a deep tone that would vanish as light. */
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
