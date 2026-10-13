/**
 * Deterministic replay of the kiosk loop's particle FORM choices (no GPU):
 * the conductor's schedule reduced to its form decisions — the opening form
 * (lead) under the emblem, a morph form at every phase boundary, the
 * conducted windows, and the evolving cycle every ~13.5 s in between — with
 * the real planCast / chooseNext / loop memory the layer uses.
 */
import type { SoulId } from "@/lib/particles/souls";
import { PARTICLE_LEADS } from "./particle-lead";
import { PARTICLE_PROFILES } from "./particle-profiles.generated";
import { TRAMOKYO_MAIN } from "./installation-sequence";
import { conductPhrases, PHRASE_LAWS, PHRASE_LOCKED_JOURNEYS, type PhraseTimeline } from "@/lib/particles/phrase-conductor";
import { createLoopMemory, planCast, chooseNext, noteForm, recordUsage, blossomAllowed, previousJourney, journeyAvoidSet, type LoopMemory } from "./particle-rotation";

export interface PlayLog { journeyId: string; name: string; mastered: boolean; lead: SoulId | null; forms: { soul: SoulId; sec: number }[] }

/** The main loop as it plays (borrowing sets included), journeys with a cast only. */
export function loopOrder(): string[] {
  return TRAMOKYO_MAIN.sets.flatMap((s) => s.journeyIds).filter((id) => PARTICLE_LEADS[id]);
}

/** `phrase`: the phrase conductor's form events (phrase-conductor.ts) time the
 *  evolving forms instead of the ~13.5 s clock (never the locked journeys).
 *  Off (default) = the replay exactly as before. */
export function replayLoop(order: readonly string[] = loopOrder(), loops = 2, mem: LoopMemory = createLoopMemory(), opts: { phrase?: boolean } = {}): PlayLog[] {
  const out: PlayLog[] = [];
  for (let l = 0; l < loops; l++) for (const id of order) {
    const base = PARTICLE_LEADS[id];
    const cast = planCast(base, id, mem);
    const D = PARTICLE_PROFILES[id]?.duration ?? 240;
    const pbs = cast.phaseBounds ?? [];
    const phaseAt = (t: number) => pbs.filter((b) => b <= t).length;
    const chars = cast.phaseChars ?? [];
    const formsAt = (t: number) => { const f = chars[Math.min(phaseAt(t), chars.length - 1)]?.forms; return f && f.length ? f : cast.formCycle; };
    // fixed events: opening (lead), morphs at boundaries, windows
    const ev: { t: number; soul: SoulId }[] = [{ t: 3, soul: cast.morphSouls[0] ?? cast.souls.transition }];
    pbs.forEach((b, i) => ev.push({ t: b, soul: cast.morphSouls[Math.min(i + 1, cast.morphSouls.length - 1)] ?? cast.souls.transition }));
    for (const w of cast.windows) ev.push({ t: w.start, soul: w.soul });
    ev.sort((a, b) => a.t - b.t);
    const end = D - 17; // the closing emblem owns the end
    const prof = PARTICLE_PROFILES[id];
    const tl = opts.phrase && prof && !base.mastered && !PHRASE_LOCKED_JOURNEYS.has(id)
      ? conductPhrases({ ...prof, phaseBounds: pbs }, { journeyId: id, formChanges: cast.windows.map((w) => w.start) })
      : null;
    const log: PlayLog = { journeyId: id, name: PARTICLE_PROFILES[id]?.name ?? id, mastered: base.mastered, lead: null, forms: [] };
    const recent: SoulId[] = [];
    let blossomShown = false, cycleIdx = 0, oldIdx = 0;
    let cur: SoulId | null = null, curAt = 0;
    const show = (s: SoulId, t: number) => {
      if (cur) { const sec = Math.max(0, t - curAt); log.forms.push({ soul: cur, sec }); recordUsage(mem, cur, sec); }
      if (s === cur) { curAt = t; return; }
      cur = s; curAt = t;
      if (!log.lead) log.lead = s;
      noteForm(mem, id, s);
      if (s === "blossom") blossomShown = true;
      recent.unshift(s); if (recent.length > 4) recent.length = 4;
    };
    let t = 16; // the field wears the opening emblem until ~16 s
    let k = 0;
    show(ev[0].soul, 16);
    while (k < ev.length && ev[k].t <= 16) k++;
    while (t < end) {
      const nextFixed = k < ev.length ? ev[k].t : Infinity;
      const nt = Math.min(tl ? nextPhraseChange(tl, t, curAt) : t + 13.5, nextFixed, end);
      if (nt >= end) break;
      if (nt === nextFixed) { show(ev[k].soul, nt); k++; }
      else {
        const fl = formsAt(nt);
        let pick: SoulId | undefined;
        if (!base.mastered) pick = chooseNext(fl, { recent, mem, blossomOk: blossomAllowed(mem, id, blossomShown), cycleIdx: cycleIdx++, jitter: 0.5, neighbour: previousJourney(mem, id)?.forms, shown: journeyAvoidSet(mem, id, cast), pool: cast.formCycle, journeyId: id });
        else {
          // the mastered conductor (unchanged): next in phase order, not one of the last shown
          for (let i = 1; i <= fl.length && !pick; i++) { const c = fl[(oldIdx + i) % fl.length]; if (!recent.includes(c)) { oldIdx += i; pick = c; } }
          pick ??= fl[(++oldIdx) % Math.max(1, fl.length)];
        }
        if (pick) show(pick, nt);
      }
      t = nt;
    }
    if (cur) { const sec = Math.max(0, end - curAt); log.forms.push({ soul: cur, sec }); recordUsage(mem, cur, sec); }
    out.push(log);
  }
  return out;
}

/** The next phrase-conducted change after t: a form / refigure event once the
 *  current form has held ≥ 10 s, else the layer's fallback clock (13.5 × 2.2). */
export function nextPhraseChange(tl: PhraseTimeline, t: number, curAt: number): number {
  const e = tl.events.find((x) => (x.action === "form" || x.action === "refigure") && x.t > t && x.t - curAt >= PHRASE_LAWS.MIN_FORM_HOLD_SEC);
  return Math.min(e ? e.t : Infinity, Math.max(t, curAt) + 13.5 * 2.2);
}

export function shares(logs: PlayLog[]): Map<SoulId, number> {
  const m = new Map<SoulId, number>();
  let tot = 0;
  for (const l of logs) for (const f of l.forms) { m.set(f.soul, (m.get(f.soul) ?? 0) + f.sec); tot += f.sec; }
  for (const [k, v] of m) m.set(k, v / tot);
  return new Map([...m.entries()].sort((a, b) => b[1] - a[1]));
}
