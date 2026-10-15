/**
 * PARTICLE ROTATION — loop-wide form diversity (Karel 2026-10-09, watching the
 * kiosk: "you use the unfolding flower from ghost all over and over and over.
 * i thought we designed a ton of options …").
 *
 * Measured before (flight recorder, 2 days): blossom on screen 15–17 % of all
 * procedural time and in 83 of 92 non-Ghost journeys, opening most of them;
 * vortex / murmuration / ribbons another ~35 %; 18 of 25 kept forms < 3 % each.
 *
 * The loop now remembers what it showed (module memory — survives journey
 * hand-offs in the kiosk page, resets on reload, which is fine):
 *  • a journey's LEAD form (its first procedural form) differs from the
 *    previous journey's lead;
 *  • the unfolding blossom shows at most once per journey, never in two
 *    journeys running (and only where the cast offers it — ≤ 1 floral phase);
 *  • every pick leans away from forms that already hold more than their share
 *    of on-screen time (soft cap ~15 %), toward the under-used ones the phase's
 *    IMAGERY still calls for (the candidates are always the phase's own list).
 *
 * Mastered journeys (Snowflake, Ghost) and signature journeys are never
 * re-planned (identity) — they only REPORT what they showed, so the journey
 * after them still differs.
 */
import { SOULS, IMAGERY_ONLY_SOULS, type SoulId } from "@/lib/particles/souls";
import type { ParticleLeadCast } from "./particle-lead";
import { ORGANIC_SOULS } from "./particle-motifs";

export interface LoopEntry { journeyId: string; lead: SoulId | null; blossom: boolean; /** every procedural form it showed */ forms?: Set<SoulId> }
export interface LoopMemory {
  history: LoopEntry[];
  /** on-screen seconds per procedural form, loop-wide */
  usage: Map<SoulId, number>;
}

export function createLoopMemory(): LoopMemory {
  return { history: [], usage: new Map() };
}
/** The kiosk page's loop memory. */
export const LOOP_MEMORY: LoopMemory = createLoopMemory();

/** Soft cap on any one form's share of on-screen time, loop-wide.
 *  2026-10-11 rebalance (Karel: "the particle system is pretty boring once
 *  youve seen a few journeys … the pattern where the particles turn into
 *  swaying lines happens a lot"): measured on the kiosk vortex 11.5 %,
 *  murmuration 10.6 %, ribbons 9.4 %, the swaying-lines family ~20 % — the
 *  15 % cap never engaged. Now ~6.5 % per form; the swaying-lines family ~10 %. */
// …then 5 % (Karel 2026-10-12: "be careful not to over use this floating ribbons
// kind of thing … truly expand your particles pool and make sure you arent
// lazily repeating"): recent plays still had vortex 7.7 %, murmuration 7.3 %,
// ribbons 6.2 % with 86 % of neighbouring journeys sharing a form
export const MAX_SHARE = 0.05;
/** Soft cap on a FAMILY's share (forms that read alike on screen). The
 *  swaying-lines family is held tighter — Karel named it: "the pattern where
 *  the particles turn into swaying lines happens a lot". */
export const MAX_FAMILY_SHARE = 0.24; // a guard: five-member families sit ~20 % naturally
const FAMILY_CAP: Readonly<Record<string, number>> = { lines: 0.08, rising: 0.1 };
/** NEIGHBOURS (Karel 2026-10-12, "like we have done with shaders … neighboring
 *  journeys dont over do reuse"): a form the previous journey showed costs this
 *  much — more than any imagery preference, less than the hard avoid (10), so a
 *  phase whose imagery allows nothing else still gets a form. */
// …8 (Karel 2026-10-13, a still of four rows of swaying tendrils: "you use this
// pattern too much it seems … dont get lazy with particle patterns"): the same
// soul never in two journeys running — above any in-journey repeat, so a
// journey would sooner revisit its own form than borrow its neighbour's
export const NEIGHBOUR_COST = 8;

// ── LOOP-WIDE VARIETY BUDGET (Karel 2026-10-13) ──────────────────────────────
// Measured before (loop replay, Rise Above × 2): every soul ≤ 5.2 %, yet 84 of
// 86 journeys showed some soul twice (Yellow Bird: tendrils as the opening
// underlay AND again at its close — the very look Karel filmed), and the
// opening / underlay form fell on whatever the first phase ranked first
// (vortex 18 of 41, tendrils 4) instead of rotating.
/** Per-soul caps tighter than MAX_SHARE (Karel named the swaying tendrils). */
export const SOUL_SHARE_CAPS: Readonly<Partial<Record<SoulId, number>>> = { tendrils: 0.012 };
export function capOf(soul: SoulId): number { return SOUL_SHARE_CAPS[soul] ?? MAX_SHARE; }
/** …and SPACING for them: a capped soul shown in any of the last N journeys
 *  costs like a neighbour's form (seconds alone let it slip into a third of all
 *  journeys as a 3-5 s fill — rare in time, frequent to the eye). */
export const SOUL_SPACING: Readonly<Partial<Record<SoulId, number>>> = { tendrils: 4 };
export function spacingCost(mem: LoopMemory, soul: SoulId, journeyId?: string | null): number {
  const k = SOUL_SPACING[soul];
  if (!k) return 0;
  let n = 0;
  for (let i = mem.history.length - 1; i >= 0 && n < k; i--) {
    const e = mem.history[i];
    if (journeyId && e.journeyId === journeyId && i === mem.history.length - 1) continue;
    if (e.forms?.has(soul)) return NEIGHBOUR_COST;
    n++;
  }
  return 0;
}
/** A soul this journey already showed: costs more than any imagery
 *  preference, less than a neighbour's form (so a long journey whose own forms
 *  are spent revisits one before it borrows from the journey before). */
export const JOURNEY_REPEAT_COST = 5;
/** The journey's OTHER phases' forms (its whole imagery-matched cast) may take
 *  a slot when the phase's own list is spent — a small cost keeps the phase's
 *  own imagery first. */
export const CAST_POOL_COST = 0.6;
/** The quiet / opening forms (the underlay under the opening emblem, the lead):
 *  the calm souls of the kept set — low energy, never Ghost's blossom. Drawn
 *  from the phase's own imagery forms where it offers any, rotated loop-wide so
 *  no calm soul becomes the default. */
export const QUIET_POOL: readonly SoulId[] = SOULS
  .filter((s) => s.traits.energy <= 0.45 && ORGANIC_SOULS.includes(s.id) && s.id !== "blossom")
  .map((s) => s.id);
/** A quiet soul that opened one of the last N journeys yields to the others. */
export const LEAD_ROTATION = 8;
const LEAD_ROTATION_COST = 2.5;

/** The procedural forms THIS journey has shown so far (empty before its first). */
export function shownThisJourney(mem: LoopMemory, journeyId: string): ReadonlySet<SoulId> {
  const last = mem.history[mem.history.length - 1];
  return last && last.journeyId === journeyId ? (last.forms ?? new Set()) : new Set();
}

/** What the journey's conductor should not pick again: every form it showed so
 *  far plus the forms its planned morphs / windows will show (a cycle pick of
 *  a soul a later window brings back would show it twice). */
export function journeyAvoidSet(mem: LoopMemory, journeyId: string, cast: Pick<ParticleLeadCast, "morphSouls" | "windows">): Set<SoulId> {
  const s = new Set<SoulId>(shownThisJourney(mem, journeyId));
  for (const m of cast.morphSouls) s.add(m);
  for (const w of cast.windows) s.add(w.soul);
  return s;
}

/** Rotation cost of a quiet soul as an opening form: how recently it led. */
export function leadRotationCost(mem: LoopMemory, journeyId: string, soul: SoulId): number {
  let n = 0;
  for (let i = mem.history.length - 1; i >= 0 && n < LEAD_ROTATION; i--) {
    const e = mem.history[i];
    if (e.journeyId === journeyId) continue;
    if (e.lead === soul) return LEAD_ROTATION_COST * (1 - n / LEAD_ROTATION);
    n++;
  }
  return 0;
}

/** Forms that read alike (one family each) — all within the session's warm set,
 *  so a sibling swap never builds a program on show. A phase's imagery asks
 *  for a form; an under-used sibling keeps that character while the loop
 *  stays varied. The blossom is never a sibling (its own rules). */
export const FORM_FAMILIES: Readonly<Record<string, readonly SoulId[]>> = {
  swirl: ["vortex", "torus", "lissajous", "harmonics", "rings", "attractor", "smokering"],
  swarm: ["murmuration", "fireflies", "pollen", "duststorm"],
  // RISING FROM THE BOTTOM (Karel 2026-10-12: "you really love using that kind of
  // fountain from the bottom particle animation. seems often") — each ~4 %, but
  // together ~17 % of all forms in pass 7: one look, so one family, capped
  rising: ["fountain", "motes", "embers", "smoke"],
  lines: ["ribbons", "waves", "tendrils", "ink"],
  vapour: ["nebula", "aurora", "starburst"],
  geometric: ["medallion", "girih", "mandala", "kaleido", "rose"],
};
const FAMILY_OF = new Map<SoulId, string>();
for (const [fam, xs] of Object.entries(FORM_FAMILIES)) for (const x of xs) FAMILY_OF.set(x, fam);
export function familyOf(soul: SoulId): string | undefined { return FAMILY_OF.get(soul); }

export function previousJourney(mem: LoopMemory, journeyId: string): LoopEntry | null {
  for (let i = mem.history.length - 1; i >= 0; i--) if (mem.history[i].journeyId !== journeyId) return mem.history[i];
  return null;
}

function entryFor(mem: LoopMemory, journeyId: string): LoopEntry {
  const last = mem.history[mem.history.length - 1];
  if (last && last.journeyId === journeyId) return last;
  const e: LoopEntry = { journeyId, lead: null, blossom: false, forms: new Set() };
  mem.history.push(e);
  if (mem.history.length > 16) mem.history.shift();
  return e;
}

/** A journey just showed `soul` (procedural form): the first one is its lead. */
export function noteForm(mem: LoopMemory, journeyId: string, soul: SoulId): void {
  const e = entryFor(mem, journeyId);
  if (!e.lead) e.lead = soul;
  if (soul === "blossom") e.blossom = true;
  (e.forms ??= new Set()).add(soul);
}

/** Seconds a form was on screen. Halves the ledger every ~2 h so it tracks the recent loop. */
export function recordUsage(mem: LoopMemory, soul: SoulId, dt: number): void {
  if (!(dt > 0)) return;
  mem.usage.set(soul, (mem.usage.get(soul) ?? 0) + dt);
  let tot = 0;
  for (const v of mem.usage.values()) tot += v;
  if (tot > 7200) for (const [k, v] of mem.usage) mem.usage.set(k, v * 0.5);
}

export function shareOf(mem: LoopMemory, soul: SoulId): number {
  let tot = 0;
  for (const v of mem.usage.values()) tot += v;
  return tot < 60 ? 0 : (mem.usage.get(soul) ?? 0) / tot;
}

/** May this journey show the blossom now? */
export function blossomAllowed(mem: LoopMemory, journeyId: string, shownThisJourney: boolean): boolean {
  return !shownThisJourney && !previousJourney(mem, journeyId)?.blossom;
}

function familyShare(mem: LoopMemory, soul: SoulId): number {
  const fam = FAMILY_OF.get(soul);
  if (!fam) return 0;
  let s = 0;
  for (const x of FORM_FAMILIES[fam]) s += shareOf(mem, x);
  return s;
}

/** How much a form is over-used (0 when under its share). */
function overusePenalty(mem: LoopMemory, soul: SoulId): number {
  const sh = shareOf(mem, soul);
  const fs = familyShare(mem, soul);
  const cap = FAMILY_CAP[FAMILY_OF.get(soul) ?? ""] ?? MAX_FAMILY_SHARE;
  const own = capOf(soul);
  // a soul over its OWN tighter cap (tendrils) yields like a neighbour's form
  const tight = own < MAX_SHARE ? (sh > own ? 6 : sh > own * 0.7 ? 1.5 : 0) : 0;
  return 4 * sh + tight + (sh > own ? 3 : sh > own * 0.75 ? 0.8 : 0) + (fs > cap ? 2.5 : fs > cap * 0.8 ? 0.6 : 0);
}

/** What chooseNext weighs besides the candidates themselves. */
export interface ChooseOpts {
  recent: readonly SoulId[];
  mem: LoopMemory;
  blossomOk: boolean;
  cycleIdx: number;
  jitter?: number;
  avoid?: SoulId | null;
  /** every form the previous journey showed (NEIGHBOUR_COST each) */
  neighbour?: ReadonlySet<SoulId> | null;
  /** every form THIS journey already showed (JOURNEY_REPEAT_COST each) */
  shown?: ReadonlySet<SoulId> | null;
  /** the journey's whole imagery-matched cast (its formCycle): offered when the
   *  phase's own forms are spent (CAST_POOL_COST) */
  pool?: readonly SoulId[] | null;
  /** the journey choosing (spacing of capped souls skips its own entry) */
  journeyId?: string | null;
  /** a filter on the souls reached BEYOND the phase's own list (siblings, the
   *  cast pool, the release valve): the opener stays a quiet soul even when
   *  every quiet candidate is spent */
  only?: ((s: SoulId) => boolean) | null;
  /** an extra per-soul cost (the quiet-lead rotation) */
  cost?: ((s: SoulId) => number) | null;
}

/**
 * Choose among a phase's candidate forms (imagery-ranked, best first):
 * not one of the last two shown, the blossom only when allowed, leaning away
 * from over-used forms, from the previous journey's forms and from forms this
 * journey already showed; ties keep the rotation order after `cycleIdx`.
 */
export function chooseNext(cands: readonly SoulId[], o: ChooseOpts): SoulId | undefined {
  const n = cands.length;
  if (!n) return undefined;
  const nb = (c: SoulId) => (o.neighbour?.has(c) ? NEIGHBOUR_COST : 0);
  const rep = (c: SoulId) => (o.shown?.has(c) ? JOURNEY_REPEAT_COST : 0);
  const extra = (c: SoulId) =>
    nb(c) + rep(c) + spacingCost(o.mem, c, o.journeyId) + (o.cost?.(c) ?? 0) + (o.recent.slice(0, 2).includes(c) ? 10 : 0) + (o.avoid && c === o.avoid ? 10 : 0);
  let best: SoulId | undefined;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    const c = cands[i];
    if (c === "blossom" && !o.blossomOk) continue;
    const score = overusePenalty(o.mem, c) + extra(c) + (((i - o.cycleIdx - 1) % n) + n) % n * 0.05 + i * 0.02 + (o.jitter ?? 0) * ((i * 0.6180339) % 1) * 0.1;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  // Family siblings of the imagery's forms (2026-10-11 rebalance): a sibling
  // reads like what the phase asked for; it wins only when it is clearly
  // fresher than every own candidate (a small bias keeps the imagery first).
  const seen = new Set<SoulId>(cands);
  for (let i = 0; i < n; i++) {
    const fam = FAMILY_OF.get(cands[i]);
    if (!fam) continue;
    for (const sib of FORM_FAMILIES[fam]) {
      if (seen.has(sib) || (o.only && !o.only(sib))) continue;
      seen.add(sib);
      const score = 0.35 + overusePenalty(o.mem, sib) + extra(sib) + i * 0.02 + (o.jitter ?? 0) * 0.05;
      if (score < bestScore) { bestScore = score; best = sib; }
    }
  }
  // The journey's own cast (2026-10-13 variety budget): when the phase's forms
  // are spent (shown already, the neighbour's, or over their cap), the forms its
  // OTHER phases' imagery called for come next — still this journey's world.
  const spent = (s: SoulId | undefined) => !!s && (nb(s) > 0 || rep(s) > 0 || shareOf(o.mem, s) > capOf(s));
  if (o.pool?.length && spent(best)) {
    o.pool.forEach((x, i) => {
      if (seen.has(x) || (x === "blossom" && !o.blossomOk) || (o.only && !o.only(x))) return;
      seen.add(x);
      const score = CAST_POOL_COST + overusePenalty(o.mem, x) + extra(x) + i * 0.01 + (o.jitter ?? 0) * 0.05;
      if (score < bestScore) { bestScore = score; best = x; }
    });
  }
  // Release valve: when even the siblings sit in an over-capped family (a
  // phase whose imagery only asks for swaying lines), any form of an
  // under-used family may take the slot — a clear cost keeps imagery first.
  // (…and when the best left is one the previous journey showed, any fresher
  // form of another family may take it.) Imagery-only souls (embers, motes,
  // petals) never come through the valve — only where the imagery shows them.
  const bf = best ? FAMILY_OF.get(best) : undefined;
  if (best && bf && (familyShare(o.mem, best) > (FAMILY_CAP[bf] ?? MAX_FAMILY_SHARE) || nb(best) > 0 || shareOf(o.mem, best) > capOf(best))) {
    for (const [fam, xs] of Object.entries(FORM_FAMILIES)) {
      if (fam === bf || familyShare(o.mem, xs[0]) > (FAMILY_CAP[fam] ?? MAX_FAMILY_SHARE) * 0.9) continue;
      for (const x of xs) {
        if (seen.has(x) || IMAGERY_ONLY_SOULS.includes(x) || (o.only && !o.only(x))) continue;
        const score = 1 + overusePenalty(o.mem, x) + extra(x) + (o.jitter ?? 0) * 0.05;
        if (score < bestScore) { bestScore = score; best = x; }
      }
    }
  }
  return best;
}

/** The opening / underlay form's candidates: the phase's quiet imagery forms,
 *  else the journey's quiet cast forms, else the phase's own forms. */
export function quietCandidates(phaseForms: readonly SoulId[], castForms: readonly SoulId[]): SoulId[] {
  const q = (xs: readonly SoulId[]) => xs.filter((x) => OPENER_POOL.includes(x));
  const own = q(phaseForms);
  if (own.length) return [...own, ...q(castForms).filter((x) => !own.includes(x))];
  const cast = q(castForms);
  if (cast.length) return cast;
  const any = phaseForms.filter((x) => !NEVER_OPENS.has(x));
  return any.length ? any : [...phaseForms];
}

/** Souls that never OPEN a journey (the opening form is what the emblem is
 *  drawn with and what the field wears first — Karel flagged the tendrils
 *  twice on 2026-10-13, both times opening Yellow Bird / Grasshopper): the
 *  capped souls. They may still appear later, inside their budget. */
export const NEVER_OPENS: ReadonlySet<SoulId> = new Set(Object.keys(SOUL_SHARE_CAPS) as SoulId[]);
/** The calm souls that may open a journey. */
export const OPENER_POOL: readonly SoulId[] = QUIET_POOL.filter((s) => !NEVER_OPENS.has(s));
/** FRESH-START ROTATION: a deterministic per-journey lean (hash of the journey
 *  id) across its quiet candidates — larger than the imagery rank steps, smaller
 *  than the loop rotation / neighbour costs. Without it an empty loop memory
 *  (a ?start= film, a reload) always opened on the phase's first quiet form:
 *  smoke 41, motes 21, tendrils 15 of 111 journeys. */
export const LEAD_SEED_SPREAD = 0.4;
function seed01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function leadSeedCost(journeyId: string, soul: SoulId): number {
  return LEAD_SEED_SPREAD * seed01(`${journeyId}|opener|${soul}${OPENER_SEED_SALT[journeyId] ?? ""}`);
}
/** Re-seeds a journey's fresh-start opener when a set order lines up three
 *  identical ones (the variety budget's reload case): Rise Above 2026-10-15
 *  (Karel: Chemiluminescence after Testimony 3, then The Summit) put three
 *  smoke openers in a row. */
export const OPENER_SEED_SALT: Readonly<Record<string, string>> = {
  "1f5e3884-5317-4146-ba18-4742eaf74ce9": "|ra-2026-10-15c", // Chemiluminescence
};

/**
 * The cast as THIS loop position plays it: morph + window forms re-chosen so
 * the lead differs from the previous journey's, over-used forms yield to the
 * phase's other imagery forms, and the blossom is withdrawn after a journey
 * that showed one. The OPENING form (the underlay under the opening emblem)
 * is a quiet soul from the journey's own imagery, rotated loop-wide; the
 * planned forms never repeat inside the journey while its cast has others.
 * Mastered / signature journeys: the cast itself (identity).
 */
export function planCast(cast: ParticleLeadCast, journeyId: string, mem: LoopMemory): ParticleLeadCast {
  if (cast.mastered || cast.signatureImage || !cast.phaseChars?.length) return cast;
  const prev = previousJourney(mem, journeyId);
  const noBlossom = !!prev?.blossom;
  const phaseChars = noBlossom ? cast.phaseChars.map((c) => (c.forms.includes("blossom") && c.forms.length > 1 ? { ...c, forms: c.forms.filter((f) => f !== "blossom") } : c)) : cast.phaseChars;
  const formsAt = (i: number) => {
    const f = phaseChars[Math.min(Math.max(0, i), phaseChars.length - 1)]?.forms ?? [];
    const nb = f.filter((x) => x !== "blossom");
    return nb.length ? nb : cast.formCycle.filter((x) => x !== "blossom");
  };
  const pool = cast.formCycle.filter((x) => x !== "blossom");
  const pbs = cast.phaseBounds ?? [];
  const phaseAt = (t: number) => pbs.filter((b) => b <= t).length;
  // a planning ledger: this journey's own picks count too, so it spreads itself
  const plan: LoopMemory = { history: mem.history, usage: new Map(mem.usage) };
  const take = (s: SoulId, sec: number) => recordUsage(plan, s, sec);
  const planned = new Set<SoulId>();
  const morphSouls: SoulId[] = [];
  for (let i = 0; i < cast.morphSouls.length; i++) {
    const avoid = i === 0 ? prev?.lead ?? null : morphSouls[i - 1];
    const lead = i === 0;
    // the opener's candidates in a SEEDED order (the phase's own calm forms
    // first, then the cast's): the imagery rank alone put smoke first in every
    // air / fire phase, so a fresh start opened three journeys running on it
    const seeded = (xs: SoulId[]) => [...xs].sort((a, b) => seed01(`${journeyId}|o|${a}`) - seed01(`${journeyId}|o|${b}`));
    const qc = lead ? quietCandidates(formsAt(0), pool) : [];
    const f0: readonly SoulId[] = formsAt(0);
    const own0 = qc.filter((x) => f0.includes(x));
    const cands = lead ? [...seeded(own0), ...seeded(qc.filter((x) => !own0.includes(x)))] : formsAt(i);
    const pick = chooseNext(cands, {
      recent: i > 0 ? [morphSouls[i - 1]] : [], mem: plan, blossomOk: false, cycleIdx: -1, avoid, neighbour: prev?.forms,
      shown: planned, pool, journeyId,
      // the opener is ALWAYS a quiet soul when the journey offers one: with more,
      // shorter forms per journey (the figure cap, figure-motion.ts) the previous
      // journey spends more of the quiet pool, and an unfiltered sibling / valve
      // pick (girih beside mandala) used to take the opening slot
      only: lead ? (cands.some((c) => OPENER_POOL.includes(c)) ? (s) => OPENER_POOL.includes(s) : (s) => !NEVER_OPENS.has(s)) : null,
      cost: lead ? (s) => leadRotationCost(mem, journeyId, s) + leadSeedCost(journeyId, s) + (OPENER_POOL.includes(s) ? 0 : 2) + (NEVER_OPENS.has(s) ? 20 : 0) : null,
    }) ?? cast.morphSouls[i];
    morphSouls.push(pick);
    planned.add(pick);
    take(pick, 14);
  }
  const windows = cast.windows.map((w) => {
    const ph = phaseAt(w.start);
    const soul = chooseNext(formsAt(ph), { recent: [morphSouls[Math.min(ph, morphSouls.length - 1)]], mem: plan, blossomOk: false, cycleIdx: -1, neighbour: prev?.forms, shown: planned, pool, journeyId }) ?? w.soul;
    planned.add(soul);
    take(soul, Math.max(0, w.end - w.start));
    return soul === w.soul ? w : { ...w, soul };
  });
  const formCycle = noBlossom ? cast.formCycle.filter((f) => f !== "blossom") : cast.formCycle;
  return { ...cast, morphSouls, windows, phaseChars, formCycle: formCycle.length ? formCycle : cast.formCycle };
}
