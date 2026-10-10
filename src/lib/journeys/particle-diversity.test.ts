/**
 * FORM DIVERSITY (Karel 2026-10-09: "you use the unfolding flower from ghost all
 * over and over … i figured you would have dozens of unfolding flower designs,
 * endless shapes"). Locks: Snowflake + Ghost untouched; the blossom rare
 * outside Ghost; consecutive journeys lead with different forms; no form hogs
 * the loop; every appearance of a varied form is its own design.
 */
import { describe, it, expect } from "vitest";
import { PARTICLE_LEADS } from "./particle-lead";
import { createLoopMemory, planCast, chooseNext, noteForm, recordUsage, blossomAllowed, MAX_SHARE } from "./particle-rotation";
import { loopOrder, replayLoop, shares } from "./loop-replay";
import { formVariant, freshVariant, VARIED_SOULS } from "@/lib/particles/form-variety";
import type { SoulId } from "@/lib/particles/souls";

const MASTERED = ["first-snow", "ghost"];

describe("form diversity — mastered journeys untouched", () => {
  it("Snowflake + Ghost: planCast is the identity (same object), whatever the loop showed before", () => {
    const mem = createLoopMemory();
    noteForm(mem, "x", "blossom");
    recordUsage(mem, "kaleido", 5000);
    for (const id of MASTERED) expect(planCast(PARTICLE_LEADS[id], id, mem)).toBe(PARTICLE_LEADS[id]);
  });
  it("Snowflake + Ghost casts keep their original form lists (no diversity widening, Ghost keeps its blossom)", () => {
    const g = PARTICLE_LEADS.ghost;
    expect(g.mastered).toBe(true);
    expect((g.phaseChars ?? []).some((p) => p.forms[0] === "blossom")).toBe(true);
    expect(PARTICLE_LEADS["first-snow"].mastered).toBe(true);
    expect((PARTICLE_LEADS["first-snow"].phaseChars ?? []).flatMap((p) => p.forms)).not.toContain("blossom");
  });
});

describe("form diversity — the blossom is Ghost's", () => {
  const others = Object.entries(PARTICLE_LEADS).filter(([, c]) => !c.mastered && !c.signatureImage);
  it("outside Ghost it is never a morph / window form, never a phase's default, and offered in ≤ 1 phase", () => {
    for (const [id, c] of others) {
      expect(c.morphSouls, id).not.toContain("blossom");
      expect(c.windows.map((w) => w.soul), id).not.toContain("blossom");
      const phases = (c.phaseChars ?? []).filter((p) => p.forms.includes("blossom"));
      expect(phases.length, id).toBeLessThanOrEqual(1);
      for (const p of c.phaseChars ?? []) expect(p.forms[0], id).not.toBe("blossom");
    }
  });
  it("the conductor never offers it twice in a journey, nor right after a journey that showed it", () => {
    const mem = createLoopMemory();
    noteForm(mem, "a", "blossom");
    expect(blossomAllowed(mem, "b", false)).toBe(false);
    noteForm(mem, "b", "rose");
    expect(blossomAllowed(mem, "c", false)).toBe(true);
    expect(blossomAllowed(mem, "c", true)).toBe(false);
    expect(chooseNext(["blossom"], { recent: [], mem, blossomOk: false, cycleIdx: 0 })).toBeUndefined();
  });
  it("loop replay: ≤ 1 blossom per non-Ghost journey, never two journeys running, < 5 % of on-screen time", () => {
    const logs = replayLoop(loopOrder(), 2);
    let prevHad = false;
    for (const l of logs) {
      const n = l.forms.filter((f, i, a) => f.soul === "blossom" && (i === 0 || a[i - 1].soul !== "blossom")).length;
      if (l.journeyId !== "ghost") {
        expect(n, l.name).toBeLessThanOrEqual(1);
        if (n) expect(prevHad, `${l.name} after a blossom journey`).toBe(false);
      }
      prevHad = n > 0;
    }
    const sh = shares(logs.filter((l) => l.journeyId !== "ghost"));
    expect(sh.get("blossom") ?? 0).toBeLessThan(0.05);
  });
});

describe("form diversity — loop-wide rotation", () => {
  const logs = replayLoop(loopOrder(), 2);
  it("a journey's lead form differs from the previous journey's", () => {
    for (let i = 1; i < logs.length; i++) {
      if (logs[i].mastered) continue; // mastered journeys play as mastered
      expect(logs[i].lead, `${logs[i - 1].name} → ${logs[i].name}`).not.toBe(logs[i - 1].lead);
    }
  });
  it(`no form holds more than ~${Math.round(MAX_SHARE * 100)} % of on-screen time, and the catalogue is used wide`, () => {
    const sh = shares(logs);
    for (const [soul, v] of sh) expect(v, soul).toBeLessThan(MAX_SHARE + 0.02);
    expect([...sh.values()].filter((v) => v > 0.01).length).toBeGreaterThanOrEqual(14);
  });
  it("every planned form is one the session pre-warms (no program built on show)", () => {
    const warm = new Set<SoulId>();
    for (const c of Object.values(PARTICLE_LEADS)) for (const x of [...c.morphSouls, ...Object.values(c.souls), ...c.windows.map((w) => w.soul), ...(c.formCycle ?? [])]) warm.add(x);
    for (const l of logs) for (const f of l.forms) expect(warm.has(f.soul), `${l.name}: ${f.soul}`).toBe(true);
  });
});

describe("form diversity — every appearance its own design", () => {
  it("each varied form draws 12 distinct designs in a row (loop memory of recent designs)", () => {
    for (const soul of VARIED_SOULS) {
      const recent: string[] = [];
      for (let i = 0; i < 12; i++) {
        const v = freshVariant(soul, `j:${i}`, recent)!;
        expect(recent, `${soul} repeated ${v.label}`).not.toContain(v.label);
        recent.unshift(v.label);
      }
    }
  });
  it("design parameters really differ between appearances, and stay in their safe ranges", () => {
    for (const soul of VARIED_SOULS) {
      const vs = Array.from({ length: 24 }, (_, i) => formVariant(soul, `seed${i}`)!);
      const keys = new Set(vs.map((v) => JSON.stringify([v.a, v.b, v.c])));
      expect(keys.size, soul).toBe(24);
      for (const v of vs) for (const x of [...v.a, ...v.b, ...v.c]) expect(Number.isFinite(x), soul).toBe(true);
    }
    const bl = Array.from({ length: 200 }, (_, i) => formVariant("blossom", `b${i}`)!);
    const petals = new Set(bl.map((v) => v.a[0]));
    expect(Math.min(...petals)).toBe(3);
    expect(Math.max(...petals)).toBe(13);
    // the infinite unfolding draws its layers from the centre in thirds: 3 layers whenever it unfolds
    for (const v of bl) if (v.unfold) expect(v.a[1]).toBe(3);
    // whole-number symmetries only (a fractional one tears the seam)
    for (const v of bl) { expect(Number.isInteger(v.a[0])).toBe(true); expect(Number.isInteger(v.a[1])).toBe(true); }
    for (let i = 0; i < 100; i++) { const r = formVariant("ribbons", `r${i}`)!; expect(Number.isInteger(r.a[0]) && Number.isInteger(r.a[2])).toBe(true); }
    for (let i = 0; i < 100; i++) { const v = formVariant("vortex", `v${i}`)!; expect(v.a[0]).toBeGreaterThanOrEqual(2); expect(Math.sign(v.a[1])).toBe(Math.sign(v.b[0])); }
  });
  it("unvaried (field) forms get no design — null variant = the shader constants", () => {
    expect(formVariant("spirit" as SoulId, "x")).toBeNull();
  });
});
