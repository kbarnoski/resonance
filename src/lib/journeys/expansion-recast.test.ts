import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPANSION_KINETIC_NAMES, expansionLayerGain } from "./kinetic";
import { TRAMOKYO_SETLIST } from "./installation-sequence";
import { SHADER_SUPPORT_GAIN, EXPANSION_LEADS } from "@/lib/shaders/shader-gain.generated";

// Karel 2026-10-04: "your responsive shaders need to have variety ...
// i see the same over and over" and 2026-10-05: "i swear that the pool
// of shaders used in expansion journeys seems super limited ... create a
// solution that ensures there is true diversity". Guards the Expansion
// recast data (scripts/recast-expansion.mjs) against the objective
// vetting pool (scripts/vet-shaders.mjs, brightness-normalized).
const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
type J = { id: string; title: string; lead: string; cast: Record<string, (string | null)[]>; intensity: number[] };
const recast = read("scripts/expansion-recast.json") as { journeys: J[] };
const vet = read("scripts/shader-vetting.json") as { pool: string[]; verdicts: Record<string, { gain: number; leadGain: number }> };
const POOL = new Set(vet.pool);
const MASTERED_LEADS = new Set(["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"]);
const KAREL_REJECTED = ["chakra", "redshift", "gnosis", "biolume", "coral", "r3-balllightning", "sparkler"];

const CAP = 5;

// The Expansion in kiosk setlist order.
const ids = new Set(recast.journeys.map((j) => j.id));
const ordered = TRAMOKYO_SETLIST.filter((id) => ids.has(id)).map((id) => recast.journeys.find((j) => j.id === id)!);
const N = ordered.length;
const supportsOf = (j: J) => [...new Set(Object.values(j.cast).flat().filter((m): m is string => !!m && m !== j.lead))];

describe("Expansion recast", () => {
  it("covers all 49 Expansion journeys, all in the kiosk setlist", () => {
    expect(recast.journeys).toHaveLength(49);
    expect(new Set(recast.journeys.map((j) => j.title.toLowerCase()))).toEqual(EXPANSION_KINETIC_NAMES);
    expect(N).toBe(49);
  });

  it("gives every journey its own lead: distinct as lead, in the pool, not a mastered journey's lead", () => {
    const leads = ordered.map((j) => j.lead);
    expect(new Set(leads).size).toBe(49);
    for (const l of leads) {
      expect(MASTERED_LEADS.has(l), l).toBe(false);
      expect(POOL.has(l), l).toBe(true);
    }
  });

  it("uses only shaders from the vetted (gain-normalized) pool, never a Karel-rejected one", () => {
    for (const j of ordered) for (const list of Object.values(j.cast)) for (const m of list) {
      expect(m, `${j.title}: empty layer slot`).toBeTruthy();
      expect(POOL.has(m!), `${j.title}: ${m}`).toBe(true);
      expect(KAREL_REJECTED.includes(m!), `${j.title}: ${m}`).toBe(false);
    }
  });

  it("never repeats a shader within a phase, and a support only persists across ADJACENT phases", () => {
    for (const j of ordered) {
      const phases = Object.values(j.cast);
      for (const list of phases) expect(new Set(list).size, j.title).toBe(list.length);
      for (const m of supportsOf(j)) {
        const idx = phases.map((l, i) => (l.includes(m) ? i : -1)).filter((i) => i >= 0);
        expect(idx.at(-1)! - idx[0] + 1, `${j.title}: ${m} returns after a gap`).toBe(idx.length);
      }
    }
  });

  it("caps every support at 5 uses across the Expansion", () => {
    const uses = new Map<string, number>();
    for (const j of ordered) for (const m of supportsOf(j)) uses.set(m, (uses.get(m) ?? 0) + 1);
    for (const [m, u] of uses) expect(u, m).toBeLessThanOrEqual(CAP);
  });

  // The casts were spaced (≥11 / lead ≥12) for the 10-05 order. Karel's
  // analysis-sequenced order (2026-10-09) keeps the casts untouched, so the
  // guard is now the one the eye reads: neighbours never share a shader.
  it("never shares a shader between neighbouring journeys in setlist order", () => {
    for (let i = 0; i + 1 < N; i++) {
      const a = ordered[i], b = ordered[i + 1];
      const A = new Set([a.lead, ...supportsOf(a)]);
      for (const m of [b.lead, ...supportsOf(b)]) expect(A.has(m), `${m}: ${a.title} / ${b.title}`).toBe(false);
    }
  });

  it("gives every journey 6-7 distinct shaders (lead + 5-6 supports)", () => {
    for (const j of ordered) {
      const n = supportsOf(j).length;
      expect(n, j.title).toBeGreaterThanOrEqual(5);
      expect(n, j.title).toBeLessThanOrEqual(8);
    }
  });

  it("derives a real arc: intensities in 0.3-1.0 with a 1.0 peak", () => {
    for (const j of ordered) {
      expect(Math.max(...j.intensity), j.title).toBe(1);
      for (const v of j.intensity) { expect(v).toBeGreaterThanOrEqual(0.3); expect(v).toBeLessThanOrEqual(1); }
    }
  });
});

describe("Expansion brightness-normalized layers", () => {
  it("generated gains match the vetting measurements and the recast leads", () => {
    for (const [m, g] of Object.entries(SHADER_SUPPORT_GAIN)) expect(g).toBe(vet.verdicts[m].gain);
    for (const j of ordered) expect(EXPANSION_LEADS[j.title.toLowerCase()]).toBe(j.lead);
  });

  it("applies gain only to Expansion journeys; a journey's lead uses its lead gain", () => {
    const bright = Object.keys(SHADER_SUPPORT_GAIN)[0];
    expect(expansionLayerGain("Rolling 2", bright)).toBe(1);
    expect(expansionLayerGain("Ghost", bright)).toBe(1);
    expect(expansionLayerGain("Chemiluminescence 1", bright)).toBe(1);
    expect(expansionLayerGain(ordered.find((j) => j.lead !== bright)!.title, bright)).toBe(SHADER_SUPPORT_GAIN[bright]);
    for (const j of ordered) expect(expansionLayerGain(j.title, j.lead)).toBe(vet.verdicts[j.lead].leadGain);
    for (const g of Object.values(SHADER_SUPPORT_GAIN)) { expect(g).toBeGreaterThanOrEqual(0.35); expect(g).toBeLessThan(1); }
  });
});
