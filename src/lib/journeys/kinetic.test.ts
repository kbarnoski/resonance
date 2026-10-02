import { describe, it, expect } from "vitest";
import { isKineticJourneyName, isWhisperImageryName, isExpansionKineticName, EXPANSION_KINETIC_NAMES } from "./kinetic";

describe("kinetic species flags", () => {
  it("keeps the mastered Kinetic Lab journeys kinetic with imaging paused", () => {
    for (const n of ["Chemiluminescence 1", "Rolling 2", "Stand 10", "Cabin Soul 8", "Cabin Soul 5"]) {
      expect(isKineticJourneyName(n)).toBe(true);
      expect(isWhisperImageryName(n)).toBe(true);
      expect(isExpansionKineticName(n)).toBe(false);
    }
  });

  it("makes every Expansion journey kinetic WITH imaging (Karel 2026-10-01)", () => {
    expect(EXPANSION_KINETIC_NAMES.size).toBe(49);
    for (const n of ["Surrounded by Light 6", "No question 8", "Tranquility 38", "Chemiluminescence", "Cabin Soul 6", "Rise 1", "Yellow Bird 3"]) {
      expect(isKineticJourneyName(n)).toBe(true);
      expect(isWhisperImageryName(n)).toBe(false);
    }
  });

  it("does not touch the album namesakes", () => {
    for (const n of ["Rise", "Yellow Bird", "Surrounded By Light", "Night Wind"]) {
      expect(isExpansionKineticName(n)).toBe(false);
      expect(isKineticJourneyName(n)).toBe(false);
    }
  });

  it("names carry no filename asterisks", () => {
    for (const n of EXPANSION_KINETIC_NAMES) expect(n).not.toMatch(/\*/);
  });
});
