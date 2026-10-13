import { describe, expect, it } from "vitest";
import { mastersFeaturesEnabled, MASTERS_FEATURES_DEFAULT, MASTERS_SESSION_KEY } from "./mastered-features";
import { conductCurrents } from "./harmonic-currents";
import { conductPhrases } from "./phrase-conductor";
import { PARTICLE_PROFILES } from "@/lib/journeys/particle-profiles.generated";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };

describe("particle features on the mastered journeys", () => {
  it("is a lab switch, on by default (Karel kept it), remembered per tab", () => {
    expect(MASTERS_FEATURES_DEFAULT).toBe(true);
    const s = mem();
    expect(mastersFeaturesEnabled("", s)).toBe(true);
    expect(mastersFeaturesEnabled("?masters=1", s)).toBe(true);
    expect(s.m.get(MASTERS_SESSION_KEY)).toBe("1");
    expect(mastersFeaturesEnabled("", s)).toBe(true);
    expect(mastersFeaturesEnabled("?masters=0", s)).toBe(false);
  });
  for (const id of ["first-snow", "ghost"]) {
    const p = PARTICLE_PROFILES[id];
    it(`${id}: locked unless allowed`, () => {
      if (!p) return;
      expect(conductCurrents(p, id)).toBeNull();
      expect(conductCurrents(p, id, true)).not.toBeNull();
      expect(conductPhrases(p, { journeyId: id }).events.length).toBe(0);
      expect(conductPhrases(p, { journeyId: id, allowLocked: true }).events.length).toBeGreaterThan(0);
    });
  }
});
