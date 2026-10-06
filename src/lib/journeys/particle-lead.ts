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
import type { ParticlePalette } from "@/lib/particles/souls";
import { isMasteredJourney, MASTERED_JOURNEY_NAMES } from "./mastered";
import { castSet, type ParticleCast } from "./particle-casting";
import { phaseCharacters, type PhaseCharacter } from "./particle-motifs";
import type { SoulId } from "@/lib/particles/souls";
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
  /** Phases whose entry ALWAYS raises an emergence (journey signature), even
   *  when that boundary is a plain crossfade with no travel clip. */
  signatureMorphs?: readonly number[];
  /** What the signature forms: the real image the journey's flashes use. */
  signatureImage?: "angel";
  /** Per phase, from the vision-tagged imagery: forms, fire colour, motion. */
  phaseChars?: PhaseCharacter[];
}

function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const isMasteredId = (id: string, name: string) => isMasteredJourney(id) || MASTERED_JOURNEY_NAMES.has(name.trim().toLowerCase());

/** Theme signatures: a journey's own particle form at chosen travel morphs
 *  (index = the morph INTO that phase). Ghost (Karel 2026-10-05: "the
 *  particles should ghost like moving form at a couple points"): the spirit
 *  rises with the morph into transcendence (out of the tunnel toward the
 *  light) and again into integration (joining the light). */
export const JOURNEY_SIGNATURES: Readonly<Record<string, { image: "angel"; morphs: readonly number[] }>> = {
  // Karel 2026-10-06: "not into that figurative shape … if you can make that
  // look like an angel like in the images that would work" — the field forms
  // the ANGEL from the real angel image (as in the flashes), off-centre
  ghost: { image: "angel", morphs: [2, 5] },
};

/** Casts for the registry — built once, in loop order, neighbours differ. */
export const PARTICLE_LEADS: Readonly<Record<string, ParticleLeadCast>> = (() => {
  const ids = PARTICLE_JOURNEY_IDS;
  const casts = castSet(ids.map((id) => PARTICLE_PROFILES[id]));
  const out: Record<string, ParticleLeadCast> = {};
  ids.forEach((id, i) => {
    const cast: ParticleLeadCast = { ...casts[i], dissolve: true, mastered: isMasteredId(id, PARTICLE_PROFILES[id].name) };
    const sig = JOURNEY_SIGNATURES[id];
    if (sig) {
      cast.signatureMorphs = sig.morphs;
      cast.signatureImage = sig.image;
    }
    // the full-screen still-to-particles dissolve: BARELY EVER (Karel
    // 2026-10-06: "barely ever do i want that huge full screen particle
    // transition between big images") — about one journey in five
    if (!cast.mastered && hash01(id) < 0.2) cast.dissolve = true;
    else cast.dissolve = false;
    // presence budget (Karel 2026-10-06: "around 60% of the time"): the
    // morph law alone covers ~64 % on average, so between morphs only the
    // essentials remain — the summit, the solo-on-black breaks, the coda
    // (transition windows only where the rare dissolve lives)
    cast.windows = cast.windows.filter((w) => w.kind === "peak" || w.kind === "break" || w.kind === "coda" || (w.kind === "transition" && cast.dissolve));
    // IMAGE INTELLIGENCE (Karel 2026-10-06): the forms each phase shows come
    // from what that phase's imagery shows (vision-tagged) — fire → flames,
    // blossoms → unfurling floral patterns, water → caustic light …
    const chars = phaseCharacters(id);
    if (chars.some((c) => c.forms.length)) {
      cast.phaseChars = chars;
      const pbs = cast.phaseBounds ?? [];
      const phaseAt = (t: number) => Math.min(chars.length - 1, pbs.filter((b) => b <= t).length);
      const formsAt = (i: number) => (chars[i]?.forms.length ? chars[i].forms : cast.formCycle);
      const morphSouls: SoulId[] = [];
      for (let i = 0; i < Math.max(cast.morphSouls.length, chars.length); i++) {
        // successive morphs take successive forms — never the same one twice running
        const f = formsAt(Math.min(i, chars.length - 1));
        let pick = f[i % f.length];
        if (i > 0 && pick === morphSouls[i - 1]) pick = f[(i + 1) % f.length];
        morphSouls.push(pick);
      }
      cast.morphSouls = morphSouls;
      const kindIdx: Record<string, number> = { peak: 0, break: 1, coda: 2, transition: 1, build: 2 };
      cast.windows = cast.windows.map((w) => {
        const f = formsAt(phaseAt(w.start));
        return { ...w, soul: f[(kindIdx[w.kind] ?? 0) % f.length] };
      });
      cast.formCycle = [...new Set(chars.flatMap((c) => c.forms))];
      if (!cast.formCycle.length) cast.formCycle = casts[i].formCycle;
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
export const PARTICLES_ENABLED = false;

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
type RGB = [number, number, number];
function toHsv([r, g, b]: RGB): RGB {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h / 6) + 1) % 1, mx > 1e-6 ? d / mx : 0, mx];
}
function fromHsv([h, s, v]: RGB): RGB {
  const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}
/** Chroma floor (Karel 2026-10-06: "they should almost always have color"):
 *  grey / white palette stops borrow the palette's most saturated hue. */
function chroma(c: RGB, hueFrom: number, floor: number): RGB {
  const [h, sat, v] = toHsv(c);
  if (sat >= floor) return c;
  return fromHsv([sat < 0.08 ? hueFrom : h, floor, v]);
}

/** The journey's palette sampled FROM ITS IMAGES (journey-palettes.generated)
 *  — the particles' primary colour source (Karel 2026-10-06: "realized has
 *  a lot of amber … a color palette and key color theme per journey based on
 *  images"). Voicings move through the image colours, the KEY always present. */
export function particlePaletteFromImage(ip: { key: string; colors: string[] } | null | undefined, voice = 1): ParticlePalette | null {
  if (!ip || !ip.colors.length) return null;
  const chromatic = ip.colors.filter((c) => { const h = toHsv(hexToLinear(c)); return h[1] > 0.12 && h[2] > 0.02; });
  const cs = chromatic.length >= 2 ? chromatic : ip.colors;
  const K = ip.key;
  const c1 = cs.find((c) => c !== K) ?? K;
  const c2 = cs.filter((c) => c !== K)[1] ?? c1;
  const bright = [...cs].sort((a, b) => toHsv(hexToLinear(b))[2] - toHsv(hexToLinear(a))[2])[0] ?? K;
  const v = [[K, c1, c2], [c1, K, bright], [K, c2, bright], [c2, c1, K]][Math.max(0, Math.min(3, Math.round(voice)))];
  const keyHue = toHsv(hexToLinear(K))[0];
  return {
    low: lift(chroma(hexToLinear(v[0]), keyHue, 0.5)),
    mid: lift(chroma(hexToLinear(v[1]), keyHue, 0.45)),
    high: lift(chroma(hexToLinear(v[2]), keyHue, 0.35), 0.7),
  };
}

/** Fire imagery (Karel 2026-10-06: "colors of fire from a bit of blue through
 *  hot colors"): with height colour on, low = a hint of blue at the hearth,
 *  mid = the image's hottest light pushed toward white-gold, high = its deep
 *  ember/orange at the tips. Voices rotate which image colours burn. */
export function particlePaletteFire(ip: { key: string; colors: string[] } | null | undefined, voice = 1): ParticlePalette {
  const cols = ip?.colors?.length ? ip.colors : ["#ad4a1a", "#e5943d", "#602511"];
  const warm = cols.filter((c) => { const [h, sat] = toHsv(hexToLinear(c)); return sat > 0.25 && (h < 0.14 || h > 0.93); });
  const hot = (warm.length ? warm : cols).slice().sort((a, b) => toHsv(hexToLinear(b))[2] - toHsv(hexToLinear(a))[2]);
  const pick = (i: number) => hot[(i + Math.round(voice)) % hot.length];
  const white = (c: RGB, k: number): RGB => [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k];
  return {
    low: [0.12, 0.2, 0.75],
    mid: white(lift(hexToLinear(pick(0)), 0.85), 0.35),
    high: lift(chroma(hexToLinear(pick(1) ?? pick(0)), 0.05, 0.7)),
  };
}

/** Floral imagery (Karel 2026-10-06: Ghost's particles "should make pink
 *  flowers"): the palette's pinks and roses lead; a soft pink if it has none. */
export function particlePaletteFloral(ip: { key: string; colors: string[] } | null | undefined, voice = 1): ParticlePalette {
  const cols = ip?.colors?.length ? ip.colors : ["#c8aaa8", "#9d7276"];
  const pinkness = (c: string) => { const [h, sat, v] = toHsv(hexToLinear(c)); const d = Math.min(Math.abs(h - 0.93), 1 - Math.abs(h - 0.93)); return (1 - Math.min(1, d * 6)) * (0.3 + sat) * (0.3 + v); };
  const ranked = [...cols].sort((a, b) => pinkness(b) - pinkness(a));
  const pick = (i: number) => ranked[(i + Math.round(voice)) % Math.max(1, Math.min(3, ranked.length))];
  const pink = (c: string, floor: number) => {
    const [h, sat, v] = toHsv(hexToLinear(c));
    const d = Math.min(Math.abs(h - 0.93), 1 - Math.abs(h - 0.93));
    return lift(fromHsv([d < 0.12 ? h : 0.93, Math.max(sat, floor), v]));
  };
  return { low: pink(pick(0), 0.55), mid: pink(pick(1), 0.45), high: lift(chroma(hexToLinear(pick(2)), 0.93, 0.3), 0.75) };
}

export function particlePaletteFrom(p?: { primary: string; secondary: string; accent: string; glow: string } | null, voice = 1): ParticlePalette | null {
  if (!p) return null;
  // voicings of the journey's own palette (low / mid / high band), dark → bright
  const P = p.primary, S = p.secondary, A = p.accent, G = p.glow;
  const v = [[S, P, A], [P, A, G], [A, P, G], [P, G, A]][Math.max(0, Math.min(3, Math.round(voice)))];
  // the palette's own most colourful hue (cool violet if the palette is all grey)
  const hsvs = [P, S, A, G].map((x) => toHsv(hexToLinear(x)));
  const best = hsvs.reduce((a, b) => (b[1] > a[1] ? b : a));
  const hue = best[1] > 0.08 ? best[0] : 0.7;
  return {
    // the theme's colour, strongly (Karel 2026-10-06: "absorb color from
    // the journey theme more") — even the brightest stop stays tinted
    low: lift(chroma(hexToLinear(v[0]), hue, 0.78)),
    mid: lift(chroma(hexToLinear(v[1]), (hue + 0.04) % 1, 0.72)),
    high: lift(chroma(hexToLinear(v[2]), (hue + 0.96) % 1, 0.6), 0.7),
  };
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
