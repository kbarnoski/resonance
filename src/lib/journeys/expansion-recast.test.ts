import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPANSION_KINETIC_NAMES } from "./kinetic";

// Karel 2026-10-04: "your responsive shaders need to have variety ...
// i see the same over and over". Guards the Expansion recast data
// (scripts/recast-expansion.mjs) against the objective vetting pool
// (scripts/vet-shaders.mjs).
const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const recast = read("scripts/expansion-recast.json") as {
  journeys: { title: string; lead: string; cast: Record<string, string[]>; intensity: number[] }[];
};
const vet = read("scripts/shader-vetting.json") as { pass: string[] };
const VETTED = new Set(vet.pass);
const MASTERED_LEADS = new Set(["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"]);

describe("Expansion recast", () => {
  it("covers all 49 Expansion journeys", () => {
    expect(recast.journeys).toHaveLength(49);
    expect(new Set(recast.journeys.map((j) => j.title.toLowerCase()))).toEqual(EXPANSION_KINETIC_NAMES);
  });

  it("gives every journey its own lead: distinct, vetted, not a mastered journey's lead", () => {
    const leads = recast.journeys.map((j) => j.lead);
    expect(new Set(leads).size).toBe(49);
    for (const l of leads) {
      expect(MASTERED_LEADS.has(l), l).toBe(false);
      expect(VETTED.has(l), l).toBe(true);
    }
  });

  it("keeps leads exclusive (no journey's lead supports another journey)", () => {
    const leads = new Set(recast.journeys.map((j) => j.lead));
    for (const j of recast.journeys) for (const list of Object.values(j.cast)) for (const m of list) {
      if (m !== j.lead) expect(leads.has(m), `${j.title}: ${m}`).toBe(false);
    }
  });

  it("never repeats a support shader within a journey; every support is vetted", () => {
    for (const j of recast.journeys) {
      const supports = Object.values(j.cast).flat().filter((m) => m !== j.lead);
      expect(new Set(supports).size, j.title).toBe(supports.length);
      for (const m of supports) expect(VETTED.has(m), `${j.title}: ${m}`).toBe(true);
    }
  });

  it("derives a real arc: intensities in 0.3-1.0 with a 1.0 peak", () => {
    for (const j of recast.journeys) {
      expect(Math.max(...j.intensity), j.title).toBe(1);
      for (const v of j.intensity) { expect(v).toBeGreaterThanOrEqual(0.3); expect(v).toBeLessThanOrEqual(1); }
    }
  });
});
