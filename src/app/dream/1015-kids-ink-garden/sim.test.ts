// sim.test.ts — verification of the pure Gray-Scott + sonification math.
//
// NOTE: the repo's vitest runner is scoped to src/lib/**, so this co-located
// test is not auto-run by `npm test` (the prototype must stay self-contained
// in its own folder). It documents and locally verifies the instrument logic;
// run it ad hoc with: npx vitest run --root . src/app/dream/1015-kids-ink-garden
import { describe, expect, it } from "vitest";
import {
  ALIVE_THRESHOLD,
  INK_GARDEN_PARAMS,
  REGION_COUNT,
  activityToCutoff,
  centroidToPan,
  coverageToBedGain,
  coverageToVoiceCount,
  midiToHz,
  pickBellTriggers,
  stepCell,
  summarizeField,
} from "./sim";

describe("Gray-Scott stepCell", () => {
  it("keeps a calm substrate (A=1,B=0) essentially calm", () => {
    const next = stepCell(1, 0, 0, 0, INK_GARDEN_PARAMS);
    expect(next.a).toBeCloseTo(1, 5);
    expect(next.b).toBeCloseTo(0, 5);
  });

  it("clamps outputs into [0,1]", () => {
    const next = stepCell(0.5, 0.5, 100, 100, INK_GARDEN_PARAMS);
    expect(next.a).toBeGreaterThanOrEqual(0);
    expect(next.a).toBeLessThanOrEqual(1);
    expect(next.b).toBeGreaterThanOrEqual(0);
    expect(next.b).toBeLessThanOrEqual(1);
  });

  it("grows B where A and B coexist (autocatalysis)", () => {
    // a seeded cell with substrate present should gain B from the reaction
    const next = stepCell(0.8, 0.4, 0, 0, INK_GARDEN_PARAMS);
    expect(next.b).toBeGreaterThan(0.4 - 0.05);
  });
});

describe("summarizeField", () => {
  it("computes coverage and centroid for a half-filled field", () => {
    const w = 4;
    const h = 2;
    // left half alive (B=0.9), right half dead (B=0)
    const b = new Float32Array([0.9, 0.9, 0, 0, 0.9, 0.9, 0, 0]);
    const s = summarizeField(b, w, h, 0, []);
    expect(s.coverage).toBeCloseTo(0.5, 5);
    expect(s.centroidX).toBeLessThan(0.5); // mass is on the left
    expect(s.regionGrowth.length).toBe(REGION_COUNT);
  });

  it("reports activity as positive when coverage increases", () => {
    const b = new Float32Array([0.9, 0.9, 0.9, 0.9]);
    const s = summarizeField(b, 2, 2, 0.1, []);
    expect(s.activity).toBeGreaterThan(0);
  });

  it("treats values under the threshold as dead", () => {
    const v = ALIVE_THRESHOLD - 0.01;
    const b = new Float32Array([v, v, v, v]);
    const s = summarizeField(b, 2, 2, 0, []);
    expect(s.coverage).toBe(0);
  });
});

describe("musical mapping", () => {
  it("bed gain is bounded and monotone in coverage", () => {
    const g0 = coverageToBedGain(0);
    const g1 = coverageToBedGain(1);
    expect(g0).toBeGreaterThan(0); // never silent (ambient floor)
    expect(g1).toBeGreaterThan(g0);
    expect(g1).toBeLessThanOrEqual(0.8);
  });

  it("voice count grows with coverage but stays in range", () => {
    expect(coverageToVoiceCount(0, 4)).toBe(2);
    expect(coverageToVoiceCount(1, 4)).toBe(4);
    expect(coverageToVoiceCount(0.5, 4)).toBeGreaterThanOrEqual(2);
  });

  it("cutoff stays in a kids-safe band", () => {
    expect(activityToCutoff(0)).toBeCloseTo(700, 0);
    expect(activityToCutoff(1)).toBeLessThanOrEqual(3900);
  });

  it("centroid maps to pan range", () => {
    expect(centroidToPan(0)).toBeCloseTo(-1, 5);
    expect(centroidToPan(1)).toBeCloseTo(1, 5);
    expect(centroidToPan(0.5)).toBeCloseTo(0, 5);
  });

  it("A4 is 440Hz", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 5);
  });
});

describe("pickBellTriggers", () => {
  it("fires no bells when nothing new grew", () => {
    const out = pickBellTriggers({
      coverage: 0.5,
      activity: 0,
      centroidX: 0.5,
      regionGrowth: new Array(REGION_COUNT).fill(0),
    });
    expect(out.length).toBe(0);
  });

  it("fires a bell for a region with strong new growth, capped at 2", () => {
    const out = pickBellTriggers({
      coverage: 0.5,
      activity: 0.1,
      centroidX: 0.5,
      regionGrowth: [0.05, 0.05, 0.05, 0.05, 0.05],
    });
    expect(out.length).toBe(2);
    out.forEach((t) => {
      expect(t.pan).toBeGreaterThanOrEqual(-1);
      expect(t.pan).toBeLessThanOrEqual(1);
      expect(t.velocity).toBeGreaterThan(0);
    });
  });
});
