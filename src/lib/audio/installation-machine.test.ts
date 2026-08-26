/**
 * Tests for the pure helpers exported from
 * src/components/audio/installation-machine.ts.
 *
 * The actual state-machine logic lives in installation-loop-client
 * where it's tied to React + DOM timers; testing that needs jsdom +
 * RTL and is out of scope for this lib-only suite. What's covered
 * here is the deterministic stuff: timing constants form a sensible
 * sequence, and distributedTrackIndex actually distributes.
 */
import { describe, it, expect } from "vitest";
import {
  INTRO_MS,
  CREDITS_MS,
  MAX_JOURNEY_MS,
  JOURNEY_CAP_MARGIN_MS,
  STALLED_THRESHOLD_MS,
  MID_STALL_RELOAD_MS,
  CYCLE_INTRO_TIMINGS,
  distributedTrackIndex,
  journeyCapMs,
  QUARANTINED_RECORDING_IDS,
} from "../../components/audio/installation-machine";

describe("installation-machine timing constants", () => {
  it("has reasonable absolute durations", () => {
    expect(INTRO_MS).toBe(11_000);
    expect(CREDITS_MS).toBeGreaterThanOrEqual(10_000);
    expect(MAX_JOURNEY_MS).toBeGreaterThanOrEqual(5 * 60_000);
  });

  it("mid-stall reload fires before stalled-threshold gives up", () => {
    expect(MID_STALL_RELOAD_MS).toBeLessThan(STALLED_THRESHOLD_MS);
  });

  it("cycle intro stages are monotonically increasing", () => {
    const t = CYCLE_INTRO_TIMINGS;
    expect(t.cycleFadeOutStartMs).toBeGreaterThanOrEqual(t.cycleFadeInMs);
    expect(t.bgFadeStartMs).toBeGreaterThanOrEqual(t.cycleFadeOutStartMs);
    expect(t.journeyMountMs).toBeGreaterThanOrEqual(t.bgFadeStartMs);
    expect(t.journeyFadeOutStartMs).toBeGreaterThan(t.journeyMountMs);
    expect(t.phaseChangeMs).toBeGreaterThanOrEqual(
      t.journeyFadeOutStartMs + t.journeyFadeOutMs,
    );
  });

  it("bg fade and journey title mount run on the same clock", () => {
    // Live choreography (installation-intro.tsx): the bg-black layer
    // starts fading at the exact moment the journey title mounts, and
    // both run the same 3.8s fade so shader + title emerge together.
    const t = CYCLE_INTRO_TIMINGS;
    expect(t.bgFadeStartMs).toBe(t.journeyMountMs);
    expect(t.bgFadeOutMs).toBe(t.journeyFadeInMs);
  });
});

describe("journeyCapMs", () => {
  it("falls back to MAX_JOURNEY_MS when the duration is unknown", () => {
    expect(journeyCapMs(null)).toBe(MAX_JOURNEY_MS);
    expect(journeyCapMs(undefined)).toBe(MAX_JOURNEY_MS);
    expect(journeyCapMs(0)).toBe(MAX_JOURNEY_MS);
    expect(journeyCapMs(-30)).toBe(MAX_JOURNEY_MS);
    expect(journeyCapMs(Number.NaN)).toBe(MAX_JOURNEY_MS);
    expect(journeyCapMs(Number.POSITIVE_INFINITY)).toBe(MAX_JOURNEY_MS);
  });

  it("never drops below the fixed floor for short tracks", () => {
    // 3:20 track — duration + margin is well under 8 min; the floor
    // wins so suspect metadata can only widen the window.
    expect(journeyCapMs(200)).toBe(MAX_JOURNEY_MS);
  });

  it("extends to duration + margin for tracks past the floor", () => {
    // The audit's case: an 18:40 track was previously cut at 8:00.
    const eighteenForty = 18 * 60 + 40;
    expect(journeyCapMs(eighteenForty)).toBe(
      eighteenForty * 1_000 + JOURNEY_CAP_MARGIN_MS,
    );
    expect(journeyCapMs(eighteenForty)).toBeGreaterThan(MAX_JOURNEY_MS);
  });

  it("gives the margin real headroom above the stall detectors", () => {
    expect(JOURNEY_CAP_MARGIN_MS).toBeGreaterThan(STALLED_THRESHOLD_MS);
  });
});

describe("QUARANTINED_RECORDING_IDS", () => {
  it("covers all nine 17th St + Folsom St uploads", () => {
    // 5 × 17th St + 4 × Folsom St — mirrors the canonical quarantine
    // in src/app/dream/_shared/welcomeHome.ts (imported, not copied).
    expect(QUARANTINED_RECORDING_IDS.size).toBe(9);
    // The 18:40 "17th St 64" the audit flagged:
    expect(
      QUARANTINED_RECORDING_IDS.has("6a009894-d341-4f84-8a2e-b45a59b68b82"),
    ).toBe(true);
    // The contaminated "Folsom St 5":
    expect(
      QUARANTINED_RECORDING_IDS.has("808f253c-bca9-42e6-b0f7-5762b8d92a92"),
    ).toBe(true);
  });

  it("does not quarantine verified catalog tracks", () => {
    // "Snowflake" (verified Snowflake EP) must stay eligible.
    expect(
      QUARANTINED_RECORDING_IDS.has("734a09ce-84df-4f1f-93c1-11b08d303681"),
    ).toBe(false);
    // "Welcome Home" (verified album) too.
    expect(
      QUARANTINED_RECORDING_IDS.has("8dafed88-4761-4dd3-a0f4-93f310441093"),
    ).toBe(false);
  });
});

describe("distributedTrackIndex", () => {
  it("returns -1 for empty pool", () => {
    expect(distributedTrackIndex(0, 0)).toBe(-1);
    expect(distributedTrackIndex(5, 0)).toBe(-1);
  });

  it("returns a valid index for non-empty pool", () => {
    for (let i = 0; i < 20; i++) {
      const idx = distributedTrackIndex(i, 10);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(10);
    }
  });

  it("scatters picks (no two consecutive positions share an index for a small pool)", () => {
    // For the mapping ((i*7)+3) % 10 the consecutive deltas are 7
    // mod 10, so adjacent positions are 7 apart — never equal.
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const idx = distributedTrackIndex(i, 10);
      expect(seen.has(idx)).toBe(false);
      seen.add(idx);
    }
  });

  it("uses every slot at least once over a full cycle", () => {
    // For a coprime multiplier (7 vs 10) the orbit hits every index
    // exactly once before repeating.
    const seen = new Set<number>();
    for (let i = 0; i < 10; i++) seen.add(distributedTrackIndex(i, 10));
    expect(seen.size).toBe(10);
  });

  it("gives the same answer for the same input (deterministic)", () => {
    expect(distributedTrackIndex(3, 7)).toBe(distributedTrackIndex(3, 7));
    expect(distributedTrackIndex(42, 13)).toBe(distributedTrackIndex(42, 13));
  });

  it("handles a single-element pool", () => {
    expect(distributedTrackIndex(0, 1)).toBe(0);
    expect(distributedTrackIndex(7, 1)).toBe(0);
  });
});
