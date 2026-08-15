/**
 * Tests for the journey phase / shader-pool logic in journeys.ts.
 *
 * Covers the documented invariants:
 *  - phase contiguity: every journey's phases tile [0, 1] with no gaps
 *    or overlaps (the journey engine interpolates across phase edges)
 *  - blocklist honoring: globally-blocked and per-journey-blocked shader
 *    ids never survive into picked shader pools, and every pick comes
 *    from the live MODE_META registry (so removed shaders can't return)
 *  - determinism: a seeded random source reproduces the exact shader
 *    schedule (shared-playback contract)
 *
 * Device tier is mocked so the low-tier shader exclusion is testable
 * from Node (the real detector needs window/WebGL).
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const tierMock = vi.hoisted(() => ({ tier: "medium" as "high" | "medium" | "low" }));
vi.mock("@/lib/audio/device-tier", () => ({
  getDeviceTier: () => tierMock.tier,
}));

import {
  JOURNEYS,
  getJourney,
  defaultPhases,
  regenerateJourneyShaders,
} from "./journeys";
import { createSeededRandom } from "./seeded-random";
import { MODE_META } from "@/lib/shaders";

const REGISTRY = new Set<string>(MODE_META.map((m) => m.mode));

/** Sample of GLOBAL_SHADER_BLOCKLIST entries (list itself is module-private). */
const GLOBALLY_BLOCKED_SAMPLE = [
  "nebula", "depths", "fog", "terminus", "onyx", "estuary",
  "hollow", "dark-bloom", "abyss-light",
];

const LOW_TIER_BLOCKED = ["dark-nebula", "supernova", "quasar", "magma", "inferno"];

function allPickedShaders(phases: { shaderModes: string[] }[]): string[] {
  return phases.flatMap((p) => p.shaderModes);
}

afterEach(() => {
  tierMock.tier = "medium";
});

describe("phase contiguity invariant", () => {
  it("every built-in journey tiles [0, 1] with no gaps or overlaps", () => {
    expect(JOURNEYS.length).toBeGreaterThan(0);
    for (const journey of JOURNEYS) {
      const phases = journey.phases;
      expect(phases.length, journey.id).toBeGreaterThan(0);
      expect(phases[0].start, `${journey.id} first phase start`).toBeCloseTo(0, 6);
      expect(phases[phases.length - 1].end, `${journey.id} last phase end`).toBeCloseTo(1, 6);
      for (let i = 1; i < phases.length; i++) {
        expect(
          phases[i].start,
          `${journey.id}: ${phases[i - 1].id} → ${phases[i].id} must be contiguous`,
        ).toBeCloseTo(phases[i - 1].end, 6);
      }
    }
  });

  it("defaultPhases produces the canonical six-phase arc", () => {
    const phases = defaultPhases("garden");
    expect(phases.map((p) => p.id)).toEqual([
      "threshold", "expansion", "transcendence", "illumination", "return", "integration",
    ]);
    for (const p of phases) {
      // Minimum for shader layering
      expect(p.shaderModes.length, p.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("defaultPhases applies per-phase overrides", () => {
    const phases = defaultPhases("garden", { threshold: { shaderOpacity: 0.9 } });
    expect(phases.find((p) => p.id === "threshold")?.shaderOpacity).toBe(0.9);
    expect(phases.find((p) => p.id === "expansion")?.shaderOpacity).toBe(0.6);
  });
});

describe("shader pool blocklists", () => {
  it("globally-blocked and non-registry shader ids never survive into picks", () => {
    const picked = allPickedShaders(defaultPhases("garden"));
    for (const blocked of GLOBALLY_BLOCKED_SAMPLE) {
      expect(picked, `"${blocked}" must not be pickable`).not.toContain(blocked);
    }
    // Everything picked must exist in the live registry — removed shaders
    // (aurora, tesseract, wormhole, ...) can never come back via a stale pool.
    for (const mode of picked) {
      expect(REGISTRY.has(mode), `"${mode}" not in MODE_META registry`).toBe(true);
    }
  });

  it("regenerateJourneyShaders honors the journey's own blockedShaders (Ghost)", () => {
    const ghost = getJourney("ghost");
    expect(ghost).toBeDefined();
    const regenerated = regenerateJourneyShaders(ghost!, createSeededRandom(7), 300);
    const picked = allPickedShaders(regenerated.phases);
    for (const blocked of ghost!.blockedShaders ?? []) {
      expect(picked, `Ghost must never show "${blocked}"`).not.toContain(blocked);
    }
    expect(picked).not.toContain("nebula");
  });

  it("low device tier additionally drops the heavy fragment shaders", () => {
    tierMock.tier = "low";
    const journey = getJourney("cosmic-drift");
    expect(journey).toBeDefined();
    const regenerated = regenerateJourneyShaders(journey!, createSeededRandom(11), 600);
    const picked = allPickedShaders(regenerated.phases);
    for (const heavy of LOW_TIER_BLOCKED) {
      expect(picked, `low tier must exclude "${heavy}"`).not.toContain(heavy);
    }
  });
});

describe("regenerateJourneyShaders determinism and scaling", () => {
  it("same seed reproduces the identical shader schedule", () => {
    const journey = getJourney("the-crossing");
    expect(journey).toBeDefined();
    const a = regenerateJourneyShaders(journey!, createSeededRandom(42), 300);
    const b = regenerateJourneyShaders(journey!, createSeededRandom(42), 300);
    expect(a.phases.map((p) => p.shaderModes)).toEqual(b.phases.map((p) => p.shaderModes));
  });

  it("does not mutate the original journey's phases", () => {
    const journey = getJourney("the-crossing")!;
    const before = journey.phases.map((p) => [...p.shaderModes]);
    regenerateJourneyShaders(journey, createSeededRandom(3), 300);
    expect(journey.phases.map((p) => p.shaderModes)).toEqual(before);
  });

  it("longer tracks get bigger shader budgets so no shader overstays", () => {
    const journey = getJourney("the-crossing")!;
    const short = regenerateJourneyShaders(journey, createSeededRandom(5), 300);
    const long = regenerateJourneyShaders(journey, createSeededRandom(5), 1500);
    const shortTotal = allPickedShaders(short.phases).length;
    const longTotal = allPickedShaders(long.phases).length;
    expect(longTotal).toBeGreaterThan(shortTotal);
  });
});
