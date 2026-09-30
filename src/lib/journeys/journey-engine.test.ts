/**
 * Composition conductor + cross-layer exclusion (2026-09-27 review).
 *
 * The authored per-phase intensity arc must shape layer COUNT, not just
 * post-processing alphas: threshold/integration run a single shader, the
 * dual layer joins the build (>= DUAL_ON_INTENSITY), the tertiary layer is
 * reserved for the climax (>= TERTIARY_MIN_INTENSITY). And the same shader
 * must never render on two layers at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getJourneyEngine } from "./journey-engine";
import { defaultPhases } from "./journeys";
import type { Journey } from "./types";

function makeJourney(intensities: [number, number, number, number, number, number]): Journey {
  const ids = ["threshold", "expansion", "transcendence", "illumination", "return", "integration"] as const;
  const bounds: Array<[number, number]> = [[0, 0.1], [0.1, 0.3], [0.3, 0.6], [0.6, 0.75], [0.75, 0.9], [0.9, 1]];
  const overrides = Object.fromEntries(
    ids.map((id, i) => [id, { start: bounds[i][0], end: bounds[i][1], intensityMultiplier: intensities[i] }]),
  );
  return {
    id: "test-conductor",
    name: "Conductor Test",
    subtitle: "",
    description: "",
    realmId: "cosmos",
    aiEnabled: false,
    phases: defaultPhases("cosmos", overrides),
  };
}

/** Drive the engine across the whole journey, advancing the wall clock so
 *  shader/dual timers fire many times. Returns every emitted frame. */
function run(journey: Journey, steps = 400) {
  const engine = getJourneyEngine();
  let clock = 0;
  const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
  engine.start(journey, { seed: 42, trackDuration: 600 });
  const frames = [];
  for (let i = 0; i <= steps; i++) {
    clock += 1500; // 1.5s per step over a 600s track
    const f = engine.getFrame(i / steps);
    if (f) frames.push(f);
  }
  engine.stop();
  nowSpy.mockRestore();
  return frames;
}

describe("composition conductor", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => getJourneyEngine().stop());

  it("holds the dual layer back in quiet phases and engages it in the build", () => {
    const frames = run(makeJourney([0.4, 0.7, 1, 0.75, 0.5, 0.3]));
    const quietStart = frames.filter((f) => f.progress < 0.08);
    const climax = frames.filter((f) => f.progress > 0.35 && f.progress < 0.55);
    const quietEnd = frames.filter((f) => f.progress > 0.93);
    expect(quietStart.length).toBeGreaterThan(5);
    expect(quietStart.every((f) => !f.dualShaderMode)).toBe(true);
    expect(climax.some((f) => !!f.dualShaderMode)).toBe(true);
    expect(quietEnd.every((f) => !f.dualShaderMode)).toBe(true);
  });

  it("reserves the tertiary layer for the climax (activation-gated)", () => {
    const frames = run(makeJourney([0.4, 0.7, 1, 0.75, 0.5, 0.3]));
    // The tertiary may ride through a breath valley once active, but it
    // only ever ACTIVATES inside a climax-intent PHASE (2026-09-30: the
    // gate reads the composer's phase intensity, not the instantaneous
    // breath-modulated value — a breath dip must not veto the climax's
    // third layer, and equally must not admit one in a quiet phase).
    // Arc journey: only transcendence (0.3-0.6) carries intent >= 0.85.
    let prevTertiary = false;
    for (const f of frames) {
      const has = !!f.tertiaryShaderMode;
      if (has && !prevTertiary) {
        expect(f.progress).toBeGreaterThanOrEqual(0.3 - 1e-9);
        expect(f.progress).toBeLessThan(0.6 + 1e-9);
      }
      prevTertiary = has;
    }
    // and the climax actually gets its third layer at some point
    expect(frames.some((f) => !!f.tertiaryShaderMode)).toBe(true);
  });

  it("schedules stillness windows that drop the journey to a held sparse moment", () => {
    const frames = run(makeJourney([1, 1, 1, 1, 1, 1]));
    // Even a flat-max journey now breathes: some mid-journey frames sit
    // at the stillness level (one static image, one shader).
    const still = frames.filter((f) => f.progress > 0.15 && f.progress < 0.9 && f.intensityMultiplier <= 0.32);
    expect(still.length).toBeGreaterThan(0);
  });

  it("keeps a flat-max journey fully layered (legacy behavior preserved)", () => {
    const frames = run(makeJourney([1, 1, 1, 1, 1, 1]));
    expect(frames.some((f) => !!f.dualShaderMode)).toBe(true);
    expect(frames.some((f) => !!f.tertiaryShaderMode)).toBe(true);
  });

  it("never renders the same shader on two layers at once", () => {
    for (const seedJourney of [makeJourney([1, 1, 1, 1, 1, 1]), makeJourney([0.4, 0.7, 1, 0.75, 0.5, 0.3])]) {
      const frames = run(seedJourney, 600);
      for (const f of frames) {
        if (f.dualShaderMode) expect(f.dualShaderMode).not.toBe(f.shaderMode);
        if (f.tertiaryShaderMode) {
          expect(f.tertiaryShaderMode).not.toBe(f.shaderMode);
          expect(f.tertiaryShaderMode).not.toBe(f.dualShaderMode ?? "");
        }
      }
    }
  });
});
