import { describe, it, expect } from "vitest";
import { isKineticJourneyName, isWhisperImageryName, isExpansionKineticName, EXPANSION_KINETIC_NAMES } from "./kinetic";

describe("kinetic species flags", () => {
  it("keeps the Kinetic Lab journeys kinetic, now WITH imaging (Karel 2026-10-05)", () => {
    for (const n of ["Chemiluminescence 1", "Rolling 2", "Stand 10", "Cabin Soul 8", "Cabin Soul 5"]) {
      expect(isKineticJourneyName(n)).toBe(true);
      expect(isWhisperImageryName(n)).toBe(false);
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

import { BAND_PROFILES, isAudioReactiveJourney, driveOnlyRate, imageryDprCeil } from "./kinetic";
import { MASTERED_JOURNEYS } from "./mastered";

describe("+20% band response (Karel 2026-10-05)", () => {
  // Pre-bump profiles — the +20% is measured against these.
  const BEFORE = {
    bass:   { gain: 16, scale: 0.035, rateLo: 0.30, rateHi: 2.30, decay: 0.88 },
    mid:    { gain: 11, scale: 0.015, rateLo: 0.55, rateHi: 1.50, decay: 0.945 },
    treble: { gain: 22, scale: 0.010, rateLo: 0.50, rateHi: 2.60, decay: 0.78 },
  } as const;
  it("gain and scale are x1.2 again (2026-10-06), the rate swing widens 20% around 1.0, slew unchanged", () => {
    // the 2026-10-05 values, then +20 % (Karel 2026-10-06: "shaders another 20% more responsive")
    const PREV = {
      bass: { gain: 19.2, decay: 0.88, scale: 0.042, rateLo: 0.16, rateHi: 2.56 },
      mid: { gain: 13.2, decay: 0.945, scale: 0.018, rateLo: 0.46, rateHi: 1.6 },
      treble: { gain: 26.4, decay: 0.78, scale: 0.012, rateLo: 0.4, rateHi: 2.92 },
    };
    void BEFORE;
    for (const b of ["bass", "mid", "treble"] as const) {
      const p = BAND_PROFILES[b], o = PREV[b];
      expect(p.gain).toBeCloseTo(o.gain * 1.2, 6);
      expect(p.scale).toBeCloseTo(Math.min(0.0499, o.scale * 1.2), 6);
      expect(p.rateLo).toBeCloseTo(Math.max(0.08, 1 - (1 - o.rateLo) * 1.2), 6);
      expect(p.rateHi).toBeCloseTo(1 + (o.rateHi - 1) * 1.2, 6);
      expect(p.rateLo).toBeGreaterThan(0); // never freezes or reverses
      expect(p.decay).toBe(o.decay);       // release slew untouched — no jitter
      expect(p.scale).toBeLessThan(0.05);  // mass breath, not a zoom
    }
  });
});

describe("audio-reactive gate: all journeys except the mastered three", () => {
  it("drives a featured journey and a Vigil journey", () => {
    expect(isAudioReactiveJourney({ id: "79e33115-7f1e-44bc-b950-7adf5055dd55", name: "Welcome Home" })).toBe(true);
    expect(isAudioReactiveJourney({ id: "910e6b62-abb8-40d1-bd31-ccdf6038f122", name: "Lantern" })).toBe(true);
    expect(isAudioReactiveJourney({ id: "01c987f6-17de-469b-b155-000922b479a1", name: "Vespers 3" })).toBe(true);
    expect(isAudioReactiveJourney({ id: "the-bloom", name: "The Bloom" })).toBe(true);
    // featured, non-kinetic: drive WITHOUT kinetic mode (no whisper etc.)
    expect(isKineticJourneyName("Lantern")).toBe(false);
    expect(isWhisperImageryName("Welcome Home")).toBe(false);
  });
  it("never touches a mastered journey (by id or by live name)", () => {
    for (const j of [
      { id: "ghost", name: "Ghost" }, { id: "first-snow", name: "Snowflake" },
      { id: "some-path-uuid", name: "Snowflake" }, { id: "ghost" }, { name: "ghost" },
    ]) expect(isAudioReactiveJourney(j)).toBe(false);
    // Follows the lock list — whatever is mastered is excluded, nothing else.
    for (const id of MASTERED_JOURNEYS) expect(isAudioReactiveJourney({ id })).toBe(false);
  });
  it("needs an active journey", () => {
    expect(isAudioReactiveJourney(null)).toBe(false);
    expect(isAudioReactiveJourney({})).toBe(false);
  });
  it("drive-only clock rests at the journey's own pace and stays inside the band profile", () => {
    for (const b of ["bass", "mid", "treble"] as const) {
      const p = BAND_PROFILES[b];
      expect(driveOnlyRate(p, 0.5)).toBe(1);
      expect(driveOnlyRate(p, 1)).toBeGreaterThan(1.3);
      expect(driveOnlyRate(p, 0.05)).toBeGreaterThanOrEqual(p.rateLo);
      expect(driveOnlyRate(p, 1)).toBeLessThanOrEqual(p.rateHi);
    }
  });
});

describe("imagery native resolution", () => {
  it("renders a DPR-2 MacBook at native 2x, a 4K surface and mastered journeys at 1.5x", () => {
    expect(imageryDprCeil(1512, 982, { id: "the-bloom" }, 2)).toBe(2);
    expect(imageryDprCeil(1920, 1080, { id: "the-bloom" }, 2)).toBe(1.5); // 8.3Mpx
    expect(imageryDprCeil(1512, 982, { id: "the-bloom" }, 1)).toBe(1.5);   // min(dpr) applied by caller
    expect(imageryDprCeil(1512, 982, { id: "ghost" }, 2)).toBe(1.5);
    expect(imageryDprCeil(1512, 982, { name: "Snowflake" }, 2)).toBe(1.5);
    for (const id of MASTERED_JOURNEYS) expect(imageryDprCeil(1512, 982, { id }, 2)).toBe(1.5);
  });
});

describe("steady-clock shaders (Karel 2026-10-11: graphic swirls must not lurch with the music)", () => {
  it("the big graphic spirals run steady; the dark hurricane stays reactive", async () => {
    const { isSteadyClockShader, STEADY_CLOCK_SHADERS } = await import("./kinetic");
    for (const m of ["r2-spiralgal", "r3-fernunfurl", "fibonacci-spiral", "whirlpool"]) expect(isSteadyClockShader(m)).toBe(true);
    for (const m of ["maelstrom", "maelstrom-dark", "magma", null, undefined]) expect(isSteadyClockShader(m)).toBe(false);
    const { SHADERS } = await import("@/lib/shaders");
    for (const m of STEADY_CLOCK_SHADERS) expect(SHADERS).toHaveProperty(m);
  });
  it("a steady shader pulses with the band but its clock never rides it", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/audio/visualizer.tsx", "utf8");
    expect(src).toMatch(/const steadyClock = isSteadyClockShader\(syncTag\);/);
    expect(src).toMatch(/steadyClock \? \{ band: f\.bandFocus \? 1 : 0, driveOnly: 0, fft: 0, kin: 0, pres: 0, tempo: 0 \}/);
    // they still PULSE (band -> scale breath) but the band never drives the clock
    expect(src).toMatch(/if \(lastBand && mix\.band > 0\.001 && !steadyClock\) \{/);
    // …and the pulse is a GLOW, never a scale (a scaled log spiral reads as rotating)
    expect(src).toMatch(/if \(!steadyClock && \(bandActive \|\| Math\.abs\(shown\.scale - 1\) > 0\.0001\)\) \{/);
    expect(src).toMatch(/canvas\.style\.opacity = \(0\.85 \+ 0\.15 \* breath\)\.toFixed\(3\);/);
  });
});
