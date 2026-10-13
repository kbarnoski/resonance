/**
 * LOOP-WIDE VARIETY BUDGET (Karel 2026-10-13, a still of four rows of amber
 * swaying tendrils: "you use this pattern too much it seems … dont get lazy
 * with particle patterns"). Replays the real Rise Above set (loop-replay.ts,
 * the layer's own planCast / chooseNext) and locks the budget:
 *  • no soul > 6 % of loop form time; the tendrils ≤ 3 % and in few journeys;
 *  • the same soul never in two journeys running (a mastered successor plays
 *    its scripted cast — it cannot yield, so those pairs are exempt);
 *  • inside a journey a soul returns only once its own fresh cast is spent;
 *  • the opening / underlay form is a quiet soul, rotated loop-wide;
 *  • deterministic; Snowflake + Ghost untouched.
 */
import { describe, it, expect } from "vitest";
import { PARTICLE_LEADS } from "./particle-lead";
import { TRAMOKYO_RISE_ABOVE } from "./installation-sequence";
import { loopOrder, replayLoop, shares, type PlayLog } from "./loop-replay";
import {
  createLoopMemory, planCast, chooseNext, noteForm, recordUsage, QUIET_POOL, capOf, spacingCost,
  journeyAvoidSet, quietCandidates, NEIGHBOUR_COST, NEVER_OPENS, OPENER_POOL,
} from "./particle-rotation";
import { formVariant } from "@/lib/particles/form-variety";
import type { SoulId } from "@/lib/particles/souls";

const RA = TRAMOKYO_RISE_ABOVE.filter((id) => PARTICLE_LEADS[id]);
const runs = (l: PlayLog) => l.forms.filter((f, i, a) => i === 0 || a[i - 1].soul !== f.soul).map((f) => f.soul);

for (const phrase of [false, true]) {
  describe(`variety budget — Rise Above × 2${phrase ? " (phrase conductor)" : ""}`, () => {
    const logs = replayLoop(RA, 2, createLoopMemory(), { phrase });

    it("covers the whole set, both mastered journeys included", () => {
      expect(logs.length).toBe(RA.length * 2);
      expect(logs.some((l) => l.journeyId === "ghost")).toBe(true);
      expect(logs.some((l) => l.journeyId === "first-snow")).toBe(true);
    });

    it("no soul holds more than 6 % of loop form time; the catalogue is used wide", () => {
      const sh = shares(logs);
      for (const [soul, v] of sh) expect(v, soul).toBeLessThanOrEqual(0.06);
      expect([...sh.values()].filter((v) => v > 0.02).length).toBeGreaterThanOrEqual(20);
    });

    it("the tendrils: ≤ 3 % of form time, in at most a quarter of the journeys", () => {
      expect(shares(logs).get("tendrils") ?? 0).toBeLessThanOrEqual(0.03);
      expect(logs.filter((l) => l.forms.some((f) => f.soul === "tendrils")).length).toBeLessThanOrEqual(Math.ceil(logs.length / 4));
    });

    it("the same soul never shows in two journeys running (unless the second is mastered)", () => {
      for (let i = 1; i < logs.length; i++) {
        if (logs[i].mastered) continue;
        const before = new Set(logs[i - 1].forms.map((f) => f.soul));
        const shared = [...new Set(logs[i].forms.map((f) => f.soul))].filter((s) => before.has(s));
        expect(shared, `${logs[i - 1].name} → ${logs[i].name}`).toEqual([]);
      }
    });

    it("inside a journey a soul returns only once the journey's own fresh cast is spent", () => {
      for (let i = 1; i < logs.length; i++) {
        const l = logs[i];
        if (l.mastered) continue;
        const before = new Set(logs[i - 1].forms.map((f) => f.soul));
        const r = runs(l);
        const fresh = new Set(PARTICLE_LEADS[l.journeyId].formCycle.filter((x) => !before.has(x) && x !== "blossom"));
        // (≤ 2 slack: a soul over its loop cap may sit out while the journey revisits one)
        expect(new Set(r).size, `${l.name}: ${r.join(" ")}`).toBeGreaterThanOrEqual(Math.min(r.length, fresh.size) - 2);
      }
    });

    it("the opening / underlay form is a quiet soul, rotated: never the same in 3 journeys running, ≥ 10 souls share the role", () => {
      const leads = logs.filter((l) => !l.mastered).map((l) => l.lead as SoulId);
      for (const s of leads) expect(QUIET_POOL).toContain(s);
      for (let i = 0; i < leads.length; i++) expect(leads.slice(Math.max(0, i - 2), i), `lead #${i}`).not.toContain(leads[i]);
      const counts = new Map<SoulId, number>();
      for (const s of leads) counts.set(s, (counts.get(s) ?? 0) + 1);
      expect(counts.size).toBeGreaterThanOrEqual(10);
      for (const [s, n] of counts) expect(n / leads.length, s).toBeLessThanOrEqual(0.18);
    });
  });
}

describe("variety budget — determinism + mastered", () => {
  it("the replay is deterministic (same set, same memory → same forms)", () => {
    const a = replayLoop(RA, 2, createLoopMemory());
    const b = replayLoop(RA, 2, createLoopMemory());
    expect(b).toEqual(a);
  });
  it("Snowflake + Ghost play their scripted casts whatever the loop showed before", () => {
    const logs = replayLoop(RA, 2);
    for (const id of ["ghost", "first-snow"]) {
      const plays = logs.filter((l) => l.journeyId === id);
      expect(plays.length).toBe(2);
      expect(plays[1].forms).toEqual(plays[0].forms);
      const mem = createLoopMemory();
      noteForm(mem, "x", "murmuration");
      recordUsage(mem, "murmuration", 9000);
      expect(planCast(PARTICLE_LEADS[id], id, mem)).toBe(PARTICLE_LEADS[id]);
    }
  });
  it("the quiet pool is the calm kept souls — several of them, never the blossom or a banned soul", () => {
    expect(QUIET_POOL.length).toBeGreaterThanOrEqual(10);
    for (const s of ["smoke", "pollen", "nebula", "aurora", "smokering", "fireflies", "ink", "rose"] as SoulId[]) expect(QUIET_POOL).toContain(s);
    for (const s of ["blossom", "wisp", "spirit", "starburst", "duststorm"] as SoulId[]) expect(QUIET_POOL).not.toContain(s);
  });
});

describe("variety budget — the conductor's rules", () => {
  it("a soul the journey already showed (or will show in a planned window) yields to a fresh one", () => {
    const mem = createLoopMemory();
    noteForm(mem, "j", "rose");
    const shown = journeyAvoidSet(mem, "j", { morphSouls: ["rings"], windows: [{ soul: "girih" } as never] });
    expect([...shown].sort()).toEqual(["girih", "rings", "rose"]);
    expect(chooseNext(["rose", "rings", "girih", "mandala"], { recent: [], mem, blossomOk: false, cycleIdx: 0, shown })).toBe("mandala");
  });
  it("…but a journey whose fresh forms are spent revisits its own before borrowing its neighbour's", () => {
    const mem = createLoopMemory();
    // (family-less ids, so no imagery sibling steps in)
    expect(chooseNext(["spirit", "wisp"], { recent: [], mem, blossomOk: false, cycleIdx: 0, shown: new Set<SoulId>(["spirit"]), neighbour: new Set<SoulId>(["wisp"]) })).toBe("spirit");
  });
  it("the journey's other phases' forms take a slot before a repeat", () => {
    const mem = createLoopMemory();
    expect(chooseNext(["spirit"], { recent: [], mem, blossomOk: false, cycleIdx: 0, shown: new Set<SoulId>(["spirit"]), pool: ["spirit", "flame"] })).toBe("flame");
    // a fresh imagery sibling still reads as what the phase asked for
    expect(chooseNext(["rose"], { recent: [], mem, blossomOk: false, cycleIdx: 0, shown: new Set<SoulId>(["rose"]) })).not.toBe("rose");
  });
  it("the tendrils: a tight cap and a 4-journey spacing", () => {
    expect(capOf("tendrils")).toBeLessThanOrEqual(0.03);
    const mem = createLoopMemory();
    noteForm(mem, "a", "tendrils");
    noteForm(mem, "b", "rose");
    expect(spacingCost(mem, "tendrils", "c")).toBe(NEIGHBOUR_COST);
    for (const id of ["c", "d", "e", "f"]) noteForm(mem, id, "rose");
    expect(spacingCost(mem, "tendrils", "g")).toBe(0);
    expect(spacingCost(mem, "rose", "g")).toBe(0); // only the capped souls are spaced
  });
  it("quiet candidates: the phase's quiet forms first, else the cast's, else the phase's own", () => {
    expect(quietCandidates(["vortex", "nebula"], ["pollen"])).toEqual(["nebula", "pollen"]);
    expect(quietCandidates(["vortex", "starburst"], ["pollen", "duststorm"])).toEqual(["pollen"]);
    expect(quietCandidates(["vortex"], ["duststorm"])).toEqual(["vortex"]);
  });
});

describe("variety budget — the tendrils' own designs", () => {
  it("never the plain upright row again: every row leans (sheaf), arcs, or is a ring", () => {
    const labels = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const v = formVariant("tendrils", `t${i}`)!;
      const [fan, arc, stagger] = v.c;
      const ring = v.b[1] > 0.5;
      expect(ring || fan > 0 || arc !== 0, v.label).toBe(true);
      expect(fan).toBeGreaterThanOrEqual(0);
      expect(fan).toBeLessThanOrEqual(0.4);
      expect(Math.abs(arc)).toBeLessThanOrEqual(0.14);
      expect(stagger).toBeLessThanOrEqual(0.55);
      labels.add(v.label.replace(/ sway\d/, ""));
    }
    // layouts × modifiers: a wide family, not one look
    expect(labels.size).toBeGreaterThanOrEqual(60);
    for (const layout of ["ring", "smile", "arch", "row"]) expect([...labels].some((l) => l.includes(` ${layout}`)), layout).toBe(true);
  });
});

describe("variety budget — the fresh-start opener (a ?start= film, a reload: empty loop memory)", () => {
  // the opener is the underlay the opening emblem is drawn with and the first
  // form the field wears (Karel 2026-10-13 flagged the tendrils opening Yellow
  // Bird and Grasshopper twice)
  const opener = (id: string) => planCast(PARTICLE_LEADS[id], id, createLoopMemory()).morphSouls[0];
  const ids = Object.keys(PARTICLE_LEADS).filter((id) => !PARTICLE_LEADS[id].mastered && !PARTICLE_LEADS[id].signatureImage);

  it("no journey ever opens on the tendrils (or any capped soul)", () => {
    for (const id of Object.keys(PARTICLE_LEADS)) expect(NEVER_OPENS.has(opener(id)), `${id}: ${opener(id)}`).toBe(false);
    expect(NEVER_OPENS.has("tendrils")).toBe(true);
    expect(OPENER_POOL).not.toContain("tendrils");
  });
  it("Yellow Bird + Grasshopper (the filmed ones) open on a calm soul", () => {
    for (const id of ["c80a89bc-2c88-4bde-bec8-4be6916acb62", "fdc6470e-5c7e-43b4-968c-3e907f1fa88f"]) expect(OPENER_POOL).toContain(opener(id));
  });
  it("every journey whose cast offers a calm soul opens on one", () => {
    for (const id of ids) {
      const c = PARTICLE_LEADS[id];
      if (c.formCycle.some((x) => OPENER_POOL.includes(x))) expect(OPENER_POOL, id).toContain(opener(id));
    }
  });
  it("seeded rotation: deterministic, never one opener for 3 journeys running in the loop, none opens > 25 % of journeys", () => {
    for (const id of ids) expect(opener(id)).toBe(opener(id));
    for (const order of [RA, loopOrder()]) {
      const xs = order.filter((id) => ids.includes(id)).map(opener);
      for (let i = 2; i < xs.length; i++) expect(xs[i] === xs[i - 1] && xs[i] === xs[i - 2], `#${i} ${xs[i]} ${order.filter((id) => ids.includes(id)).slice(i - 2, i + 1).map((id) => PARTICLE_LEADS[id].formCycle.filter((x) => OPENER_POOL.includes(x)).join("+")).join(" | ")}`).toBe(false);
    }
    const counts = new Map<SoulId, number>();
    for (const id of ids) counts.set(opener(id), (counts.get(opener(id)) ?? 0) + 1);
    for (const [s, n] of counts) expect(n / ids.length, s).toBeLessThanOrEqual(0.25);
    expect(counts.size).toBeGreaterThanOrEqual(10);
  });
});
