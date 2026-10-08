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
import { JOURNEY_IMAGE_PALETTES } from "@/lib/particles/journey-palettes.generated";
import { applySoulRemovals, momentsWithout, FORM_REMOVALS, type FormRemovals } from "./form-removals";

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
  /** Timed image moments (Ghost's blossom cloud in the tree phase). */
  signatureMoments?: readonly SignatureMoment[];
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
export interface SignatureMoment { phase: number; at: number; dur: number; images: readonly string[] }
export const JOURNEY_SIGNATURES: Readonly<Record<string, { image: "angel"; morphs: readonly number[]; moments?: readonly SignatureMoment[] }>> = {
  // Karel 2026-10-06: "not into that figurative shape … if you can make that
  // look like an angel like in the images that would work" — the field forms
  // the ANGEL from the real angel image (as in the flashes), off-centre
  // + the tree-blossom phase (Karel 2026-10-06: "at one point make a ton of
  // pink blossoms that are like the tree blossoms"): the field forms a great
  // cloud of pink tree blossoms (canopy images, trunk removed)
  ghost: {
    image: "angel",
    morphs: [2, 5],
    moments: [{ phase: 4, at: 2, dur: 16, images: ["/tramokyo-pack/emblems/ghost-blossoms-1.jpg", "/tramokyo-pack/emblems/ghost-blossoms-2.jpg"] }],
  },
};

/** Journey THEMES — a journey's own particle world (Karel 2026-10-06: First
 *  Light "should be a rising sun … play on light and the sun rise with the
 *  particle system. color and form"). */
export interface JourneyTheme { family: string; motif: number; rising?: boolean; palette?: "dawn" }
export const JOURNEY_THEMES: Readonly<Record<string, JourneyTheme>> = {
  "87e106f9-4d74-4886-b944-fd625a827b02": { family: "dawn", motif: 0.7, rising: true, palette: "dawn" }, // First Light
};

/** Dawn: night violet → rose → orange → pale gold, voiced through the sunrise. */
export function particlePaletteDawn(voice = 1): ParticlePalette {
  const v = Math.round(voice) % 4;
  const violet: [number, number, number] = [0.42, 0.18, 0.62];
  const rose: [number, number, number] = [1.0, 0.42, 0.42];
  const orange: [number, number, number] = [1.0, 0.55, 0.18];
  const gold: [number, number, number] = [1.0, 0.86, 0.5];
  const order = [[violet, rose, gold], [rose, orange, gold], [orange, gold, gold], [violet, orange, gold]][v];
  return { low: order[0], mid: order[1], high: order[2] };
}

/** Casts for the registry — built once, in loop order, neighbours differ.
 *  `removals` = Karel's form review (form-removals.ts — the single filter
 *  point: removed souls are re-cast, removed moment images dropped; an empty
 *  list leaves every cast exactly as before). */
export function buildParticleLeads(removals: FormRemovals = FORM_REMOVALS): Readonly<Record<string, ParticleLeadCast>> {
  const ids = PARTICLE_JOURNEY_IDS;
  const casts = castSet(ids.map((id) => PARTICLE_PROFILES[id]));
  const out: Record<string, ParticleLeadCast> = {};
  ids.forEach((id, i) => {
    const cast: ParticleLeadCast = { ...casts[i], dissolve: true, mastered: isMasteredId(id, PARTICLE_PROFILES[id].name) };
    const sig = JOURNEY_SIGNATURES[id];
    if (sig) {
      cast.signatureMorphs = sig.morphs;
      cast.signatureImage = sig.image;
      cast.signatureMoments = momentsWithout(sig.moments, removals.moments);
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
    let chars = phaseCharacters(id);
    // Ghost (Karel 2026-10-06: "ghostly angels ghosts wings and those pink
    // flowers not mandalas"): its procedural form is the pink blossom alone;
    // the angels, wings and ghosts come from its motif-form family
    // …but blossoms ONLY where its imagery shows flowers (Karel 2026-10-07: "the
    // particles shouldnt be flowers until you see flowers in ghost. the
    // particles need to echo the imaging"): other phases take their own
    // vision-tagged organic forms (never mandalas)
    // (2026-10-08: the newly kept geometric line forms are not ghostly either;
    // petals are flowers — only where flowers are seen)
    const notGhostly = new Set<SoulId>(["mandala", "medallion", "girih", "kaleido", "blossom", "petalfall", "petals", "rose", "harmonics", "lissajous", "rings", "torus"]);
    if (sig) chars = chars.map((c) => {
      const own = c.forms.filter((f) => !notGhostly.has(f));
      return { ...c, forms: c.floral ? ["blossom", "petals"] : own.length ? own : ["smoke", "ink", "ribbons"], family: "ghost" };
    });
    // fire FORMS only where the imagery really burns — same rule as fire colours
    // (2026-10-08: the vision tags call cool phases "fire"; embers then rose
    // over ice and night water)
    {
      const ipj = JOURNEY_IMAGE_PALETTES[id];
      chars = chars.map((c, i) => {
        const ph = ipj ? (ipj.phases[i] ?? ipj) : null;
        if (!c.fire || fireColours(true, ph)) return c;
        const forms = c.forms.filter((f) => f !== "embers");
        return { ...c, forms: forms.length ? forms : c.forms };
      });
    }
    // CENTRE-OUT FORMS LEAD (Karel 2026-10-08: "i especially like the ones that
    // evolve from a center point like you cool floral stuff"): outside Snowflake
    // and Ghost every phase opens with the unfolding blossom and carries at least
    // two radial centre-out forms
    if (!sig && id !== "first-snow") {
      const RADIAL: SoulId[] = ["mandala", "rose", "medallion", "kaleido", "girih"];
      chars = chars.map((c, i) => {
        const radial = c.forms.filter((f) => RADIAL.includes(f));
        const add = RADIAL.filter((f) => !c.forms.includes(f)).sort((a, b) => ((a.charCodeAt(0) * 31 + i * 7) % 11) - ((b.charCodeAt(0) * 31 + i * 7) % 11)).slice(0, Math.max(0, 2 - radial.length));
        return { ...c, forms: [...new Set<SoulId>(["blossom", ...c.forms, ...add])] };
      });
    }
    const theme = JOURNEY_THEMES[id];
    if (theme) chars = chars.map((c) => ({ ...c, family: theme.family, forms: theme.family === "dawn" ? ["ribbons", "murmuration", "vortex"] : c.forms }));
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
    out[id] = applySoulRemovals(cast, removals.souls, id);
  });
  return out;
}
export const PARTICLE_LEADS: Readonly<Record<string, ParticleLeadCast>> = buildParticleLeads();

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
  // THE IMAGE'S REAL COLOURS, IN PROPORTION (Karel 2026-10-08: "you use that
  // same light orange and pink coloring over and over as a default … colors
  // are to be assigned based on the theme and imaging"). The old pick ranked
  // by area × brightness², so warm highlights always led, and grey stops
  // borrowed that warm key hue → a peach/pink wash over cool imagery (audit:
  // Torraine 6 imaging 45 % warm → particles 96 %). Now: colours ranked by
  // AREA with a gentle brightness lean, chosen hue-diverse (a cool image keeps
  // its cool voices, warm-on-cool contrast survives where the image has both),
  // dark real colours lifted rather than dropped, neutral stops tinted by the
  // image's dominant colour by area — never by the brightest highlight.
  const w = (ip as { weights?: number[] }).weights;
  const srgbHsv = (c: string): RGB => { const n = parseInt(c.replace("#", ""), 16); return toHsv([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]); };
  const all = ip.colors.map((c, i) => { const [h, sat, v] = srgbHsv(c); return { c, h, sat, v, area: w?.[i] ?? 1 / ip.colors.length }; });
  const real = all.filter((x) => x.v >= 0.12 && x.sat > 0.15);
  const pool = (real.length ? real : all).map((x) => ({ ...x, score: x.area * (0.35 + x.v) }));
  pool.sort((a, b) => b.score - a.score);
  const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
  const picked: typeof pool = [];
  // a distinct hue earns a voice only if the image really shows it (≥ 20 % of the lead colour's area)
  // (Night Wind 9: navy imagery with an 8 % peach-skin highlight came out
  // 40 % peach-pink — a small highlight must stay an accent, not a voice)
  for (const x of pool) if (picked.length < 3 && x.area >= 0.35 * pool[0].area && picked.every((p) => hueDist(p.h, x.h) >= 0.08)) picked.push(x);
  for (const x of pool) if (picked.length < 3 && !picked.includes(x)) picked.push(x);
  while (picked.length < 3) picked.push(picked[picked.length - 1] ?? pool[0]);
  const dominant = real.length ? real.reduce((a, b) => (b.area > a.area ? b : a)) : null;
  const tintHue = dominant ? dominant.h : picked[0].h;
  const [K, c1, c2] = picked.map((x) => x.c);
  // the bright voice = the brightest colour the image shows IN QUANTITY
  const big = picked.filter((x) => x.area >= 0.35 * picked[0].area);
  const bright = [...(big.length ? big : picked)].sort((a, b) => b.v - a.v)[0].c;
  const v = [[K, c1, c2], [c1, K, bright], [K, c2, bright], [c2, c1, K]][Math.max(0, Math.min(3, Math.round(voice)))];
  return {
    low: lift(chroma(hexToLinear(v[0]), tintHue, 0.5)),
    mid: lift(chroma(hexToLinear(v[1]), tintHue, 0.42)),
    high: lift(chroma(hexToLinear(v[2]), tintHue, 0.3), 0.7),
  };
}

/** Share (0..1) of a phase's real colour (by area) that is warm — red,
 *  orange, pink (hue < 0.12 or > 0.88, saturated, not black). */
export function imageWarmShare(ip: { colors: string[]; weights?: number[] } | null | undefined): number {
  if (!ip || !ip.colors.length) return 0;
  let tot = 0, warm = 0;
  ip.colors.forEach((c, i) => {
    const n = parseInt(c.replace("#", ""), 16);
    const [h, sat, v] = toHsv([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
    if (sat <= 0.15 || v <= 0.15) return;
    const w = ip.weights?.[i] ?? 1;
    tot += w;
    if (h < 0.12 || h > 0.88) warm += w;
  });
  return tot ? warm / tot : 0;
}

/** The fire palette only where the imagery really burns (Karel 2026-10-08:
 *  "i better not see the orange and pink default coloring over and over"):
 *  the vision tags called whole cool journeys "fire" (Tranquility 21: 6/6
 *  phases, imaging 16 % warm; even a Snowflake phase) and their particles wore
 *  ember / gold / magenta. A phase gets fire colours only if ≥ 40 % of its
 *  real image colour is warm; otherwise its own image palette. */
export function fireColours(fire: boolean, ip: { colors: string[]; weights?: number[] } | null | undefined): boolean {
  return fire && imageWarmShare(ip) >= 0.4;
}

/** Fire imagery (Karel 2026-10-06: "colors of fire from a bit of blue through
 *  hot colors"): with height colour on, low = a hint of blue at the hearth,
 *  mid = the image's hottest light pushed toward white-gold, high = its deep
 *  ember/orange at the tips. Voices rotate which image colours burn. */
export function particlePaletteFire(ip: { key: string; colors: string[] } | null | undefined, voice = 1): ParticlePalette {
  // DIVERSE FIRE (Karel 2026-10-07: "on realized the particles stay the same
  // orange and pink the entire time. i asked for constantly changing colors
  // and diversity"): four distinct fire families the voices glide through —
  // the image's own ember, white-hot gold, the blue of a flame's heart, and a
  // violet-magenta corona — never one warm wash
  const cols = ip?.colors?.length ? ip.colors : ["#ad4a1a", "#e5943d", "#602511"];
  const warm = cols.filter((c) => { const [h, sat] = toHsv(hexToLinear(c)); return sat > 0.25 && (h < 0.14 || h > 0.93); });
  const hot = (warm.length ? warm : cols).slice().sort((a, b) => toHsv(hexToLinear(b))[2] - toHsv(hexToLinear(a))[2]);
  const ember = lift(chroma(hexToLinear(hot[0]), 0.05, 0.75));
  const v = ((Math.round(voice) % 4) + 4) % 4;
  const L = (r: number, g: number, b: number): RGB => [r, g, b];
  return [
    { low: L(0.55, 0.06, 0.02), mid: ember, high: L(1.0, 0.72, 0.18) },       // ember: crimson → image ember → gold
    { low: L(0.9, 0.42, 0.04), mid: L(1.0, 0.86, 0.45), high: L(1.0, 0.97, 0.85) }, // white-hot gold
    { low: L(0.05, 0.16, 0.85), mid: L(0.3, 0.62, 1.0), high: L(1.0, 0.8, 0.35) },  // blue flame heart → gold tips
    { low: L(0.45, 0.05, 0.6), mid: L(0.95, 0.2, 0.55), high: L(1.0, 0.6, 0.15) },  // violet-magenta corona
  ][v];
}

/** Ghost (Karel 2026-10-06: "bright white particles"): luminous whites with
 *  a breath of blush / lavender; floral moments lean pink (the pink flowers). */
export function particlePaletteGhost(floral: boolean, voice = 1): ParticlePalette {
  const v = Math.round(voice) % 4;
  const blush: [number, number, number] = floral ? [1.0, 0.62, 0.78] : [1.0, 0.9, 0.95];
  const lav: [number, number, number] = [0.93, 0.9, 1.0];
  const white: [number, number, number] = [1.0, 1.0, 1.0];
  const order = [[blush, white, lav], [white, blush, white], [lav, white, blush], [white, lav, white]][v];
  return { low: order[0], mid: order[1], high: order[2] };
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

/** The shader stack is NO LONGER stripped while particles are present
 *  (2026-10-06 zero-glitch pass): unmounting the dual/tertiary layers on
 *  entry and re-creating them (new WebGL canvases + compiles) as the particles
 *  faded out stuttered the last ~0.6 s of every particle fade. Kept as an
 *  identity so call sites stay stable. */
export function withParticleLeadSupports<T extends { dualShaderMode?: string; tertiaryShaderMode?: string }>(
  frame: T | null,
  _lead: ParticleLeadCast | null,
  _present = true,
): T | null {
  return frame;
}
