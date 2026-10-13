import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVE_HOLD_MS, inBoundaryDriveHold, inBoundarySettle, markJourneyBoundary, resetVideoActivity } from "./video-activity";

describe("shader drive at a journey handoff (Karel 2026-10-13: no 10 s dead start)", () => {
  afterEach(() => { vi.useRealTimers(); resetVideoActivity(); });
  it("holds the drive only for the first 2.5 s of the 10.5 s settle", () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ["performance", "Date"] });
    expect(inBoundaryDriveHold()).toBe(false);
    markJourneyBoundary(10_500);
    expect(inBoundaryDriveHold()).toBe(true);
    vi.advanceTimersByTime(DRIVE_HOLD_MS - 50);
    expect(inBoundaryDriveHold()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(inBoundaryDriveHold()).toBe(false);
    expect(inBoundarySettle()).toBe(true); // parallax / clips / flags still wait out the window
    expect(DRIVE_HOLD_MS).toBeLessThanOrEqual(3000);
  });
});
