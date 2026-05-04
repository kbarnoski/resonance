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
  STALLED_THRESHOLD_MS,
  MID_STALL_RELOAD_MS,
  CYCLE_INTRO_TIMINGS,
  distributedTrackIndex,
} from "../../components/audio/installation-machine";

describe("installation-machine timing constants", () => {
  it("has reasonable absolute durations", () => {
    expect(INTRO_MS).toBe(7_000);
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
    expect(t.journeyMountMs).toBeGreaterThan(t.bgFadeStartMs);
    expect(t.journeyFadeOutStartMs).toBeGreaterThan(t.journeyMountMs);
    expect(t.phaseChangeMs).toBeGreaterThanOrEqual(
      t.journeyFadeOutStartMs + t.journeyFadeOutMs,
    );
  });

  it("bg is fully gone before journey title mounts", () => {
    const t = CYCLE_INTRO_TIMINGS;
    const bgGoneAt = t.bgFadeStartMs + t.bgFadeOutMs;
    expect(t.journeyMountMs).toBeGreaterThanOrEqual(bgGoneAt);
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
