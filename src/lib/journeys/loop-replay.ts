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
import { createLoopMemory, planCast, chooseNext, noteForm, recordUsage, blossomAllowed, type LoopMemory } from "./particle-rotation";

export interface PlayLog { journeyId: string; name: string; mastered: boolean; lead: SoulId | null; forms: { soul: SoulId; sec: number }[] }

/** The main loop as it plays (borrowing sets included), journeys with a cast only. */
export function loopOrder(): string[] {
  return TRAMOKYO_MAIN.sets.flatMap((s) => s.journeyIds).filter((id) => PARTICLE_LEADS[id]);
}

export function replayLoop(order: readonly string[] = loopOrder(), loops = 2, mem: LoopMemory = createLoopMemory()): PlayLog[] {
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
      const nt = Math.min(t + 13.5, nextFixed, end);
      if (nt >= end) break;
      if (nt === nextFixed) { show(ev[k].soul, nt); k++; }
      else {
        const fl = formsAt(nt);
        let pick: SoulId | undefined;
        if (!base.mastered) pick = chooseNext(fl, { recent, mem, blossomOk: blossomAllowed(mem, id, blossomShown), cycleIdx: cycleIdx++, jitter: 0.5 });
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

export function shares(logs: PlayLog[]): Map<SoulId, number> {
  const m = new Map<SoulId, number>();
  let tot = 0;
  for (const l of logs) for (const f of l.forms) { m.set(f.soul, (m.get(f.soul) ?? 0) + f.sec); tot += f.sec; }
  for (const [k, v] of m) m.set(k, v / tot);
  return new Map([...m.entries()].sort((a, b) => b[1] - a[1]));
}
