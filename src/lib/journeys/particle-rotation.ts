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
import type { SoulId } from "@/lib/particles/souls";
import type { ParticleLeadCast } from "./particle-lead";

export interface LoopEntry { journeyId: string; lead: SoulId | null; blossom: boolean }
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

/** Soft cap on any one form's share of on-screen time, loop-wide. */
export const MAX_SHARE = 0.15;

export function previousJourney(mem: LoopMemory, journeyId: string): LoopEntry | null {
  for (let i = mem.history.length - 1; i >= 0; i--) if (mem.history[i].journeyId !== journeyId) return mem.history[i];
  return null;
}

function entryFor(mem: LoopMemory, journeyId: string): LoopEntry {
  const last = mem.history[mem.history.length - 1];
  if (last && last.journeyId === journeyId) return last;
  const e: LoopEntry = { journeyId, lead: null, blossom: false };
  mem.history.push(e);
  if (mem.history.length > 16) mem.history.shift();
  return e;
}

/** A journey just showed `soul` (procedural form): the first one is its lead. */
export function noteForm(mem: LoopMemory, journeyId: string, soul: SoulId): void {
  const e = entryFor(mem, journeyId);
  if (!e.lead) e.lead = soul;
  if (soul === "blossom") e.blossom = true;
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

/** How much a form is over-used (0 when under its share). */
function overusePenalty(mem: LoopMemory, soul: SoulId): number {
  const sh = shareOf(mem, soul);
  return 2 * sh + (sh > MAX_SHARE * 0.8 ? 0.6 : 0);
}

/**
 * Choose among a phase's candidate forms (imagery-ranked, best first):
 * not one of the last two shown, the blossom only when allowed, leaning away
 * from over-used forms; ties keep the rotation order after `cycleIdx`.
 */
export function chooseNext(cands: readonly SoulId[], o: { recent: readonly SoulId[]; mem: LoopMemory; blossomOk: boolean; cycleIdx: number; jitter?: number; avoid?: SoulId | null }): SoulId | undefined {
  const n = cands.length;
  if (!n) return undefined;
  let best: SoulId | undefined;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    const c = cands[i];
    if (c === "blossom" && !o.blossomOk) continue;
    let score = overusePenalty(o.mem, c) + (((i - o.cycleIdx - 1) % n) + n) % n * 0.05 + i * 0.02 + (o.jitter ?? 0) * ((i * 0.6180339) % 1) * 0.1;
    if (o.recent.slice(0, 2).includes(c)) score += 10;
    if (o.avoid && c === o.avoid) score += 10;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/**
 * The cast as THIS loop position plays it: morph + window forms re-chosen so
 * the lead differs from the previous journey's, over-used forms yield to the
 * phase's other imagery forms, and the blossom is withdrawn after a journey
 * that showed one. Mastered / signature journeys: the cast itself (identity).
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
  const pbs = cast.phaseBounds ?? [];
  const phaseAt = (t: number) => pbs.filter((b) => b <= t).length;
  // a planning ledger: this journey's own picks count too, so it spreads itself
  const plan: LoopMemory = { history: mem.history, usage: new Map(mem.usage) };
  const take = (s: SoulId, sec: number) => recordUsage(plan, s, sec);
  const morphSouls: SoulId[] = [];
  for (let i = 0; i < cast.morphSouls.length; i++) {
    const avoid = i === 0 ? prev?.lead ?? null : morphSouls[i - 1];
    const pick = chooseNext(formsAt(i), { recent: i > 0 ? [morphSouls[i - 1]] : [], mem: plan, blossomOk: false, cycleIdx: -1, avoid }) ?? cast.morphSouls[i];
    morphSouls.push(pick);
    take(pick, 14);
  }
  const windows = cast.windows.map((w) => {
    const ph = phaseAt(w.start);
    const soul = chooseNext(formsAt(ph), { recent: [morphSouls[Math.min(ph, morphSouls.length - 1)]], mem: plan, blossomOk: false, cycleIdx: -1 }) ?? w.soul;
    take(soul, Math.max(0, w.end - w.start));
    return soul === w.soul ? w : { ...w, soul };
  });
  const formCycle = noBlossom ? cast.formCycle.filter((f) => f !== "blossom") : cast.formCycle;
  return { ...cast, morphSouls, windows, phaseChars, formCycle: formCycle.length ? formCycle : cast.formCycle };
}
