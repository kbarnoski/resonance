/**
 * Tests for the anonymous path-progress store (localStorage-backed
 * Zustand persist). We run in Node, so localStorage is stubbed with an
 * in-memory map BEFORE the store module is imported — zustand/persist
 * reads storage during create().
 *
 * Path/culmination ids are pulled from JOURNEY_PATHS rather than
 * hardcoded, so these tests track the real path definitions.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const backing = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, String(v)),
  removeItem: (k: string) => void backing.delete(k),
  clear: () => backing.clear(),
});

// Dynamic import so the localStorage stub above is in place first.
const { usePathProgressStore } = await import("./path-progress-store");
const { JOURNEY_PATHS } = await import("./paths");

const firstPath = JOURNEY_PATHS[0];
const firstJourneyId = firstPath.journeyIds[0];
const allCulminationIds = JOURNEY_PATHS.map((p) => p.culminationJourneyId);

beforeEach(() => {
  usePathProgressStore.getState().resetProgress();
});

describe("initial state", () => {
  it("starts with nothing completed", () => {
    const s = usePathProgressStore.getState();
    expect(s.completedJourneyIds).toEqual([]);
    expect(s.completedCulminationIds).toEqual([]);
    expect(s.grandCulminationUnlocked).toBe(false);
    expect(s.grandCulminationCompleted).toBe(false);
    expect(s.isCompleted(firstJourneyId)).toBe(false);
  });

  it("reports zero progress for every real path and 0/0 for unknown paths", () => {
    const s = usePathProgressStore.getState();
    expect(s.getPathProgress(firstPath.id)).toEqual({
      completed: 0,
      total: firstPath.journeyIds.length,
    });
    expect(s.getPathProgress("no-such-path")).toEqual({ completed: 0, total: 0 });
  });
});

describe("completeJourney", () => {
  it("records a regular journey with a timestamp and updates path progress", () => {
    usePathProgressStore.getState().completeJourney(firstJourneyId);
    const s = usePathProgressStore.getState();
    expect(s.completedJourneyIds).toEqual([firstJourneyId]);
    expect(s.isCompleted(firstJourneyId)).toBe(true);
    expect(s.completionTimestamps[firstJourneyId]).toBeTruthy();
    expect(s.getPathProgress(firstPath.id)).toEqual({
      completed: 1,
      total: firstPath.journeyIds.length,
    });
  });

  it("is idempotent — completing twice records one entry", () => {
    usePathProgressStore.getState().completeJourney(firstJourneyId);
    const firstTimestamp =
      usePathProgressStore.getState().completionTimestamps[firstJourneyId];
    usePathProgressStore.getState().completeJourney(firstJourneyId);
    const s = usePathProgressStore.getState();
    expect(s.completedJourneyIds).toEqual([firstJourneyId]);
    expect(s.completionTimestamps[firstJourneyId]).toBe(firstTimestamp);
  });

  it("routes culmination journeys to completedCulminationIds, not journey ids", () => {
    const culminationId = firstPath.culminationJourneyId;
    usePathProgressStore.getState().completeJourney(culminationId);
    const s = usePathProgressStore.getState();
    expect(s.completedCulminationIds).toEqual([culminationId]);
    expect(s.completedJourneyIds).toEqual([]);
    expect(s.isCompleted(culminationId)).toBe(true);
    // One culmination alone doesn't unlock the grand culmination
    expect(s.grandCulminationUnlocked).toBe(JOURNEY_PATHS.length === 1);
  });

  it("unlocks the grand culmination once every path's culmination is done", () => {
    for (const id of allCulminationIds) {
      usePathProgressStore.getState().completeJourney(id);
    }
    const s = usePathProgressStore.getState();
    expect(s.completedCulminationIds).toEqual(allCulminationIds);
    expect(s.grandCulminationUnlocked).toBe(true);
  });

  it("routes DB/UUID culminations to completedCulminationIds via the isCulmination hint", () => {
    const uuid = "3f2c8a90-0000-4000-8000-000000000001";
    usePathProgressStore.getState().completeJourney(uuid, { isCulmination: true });
    const s = usePathProgressStore.getState();
    expect(s.completedCulminationIds).toContain(uuid);
    expect(s.completedJourneyIds).not.toContain(uuid);
    expect(s.isCompleted(uuid)).toBe(true);
  });

  it("migrates a legacy mis-bucketed culmination out of completedJourneyIds", () => {
    const uuid = "3f2c8a90-0000-4000-8000-000000000002";
    // Legacy call (no hint) — a UUID culmination lands in the journey bucket
    usePathProgressStore.getState().completeJourney(uuid);
    expect(usePathProgressStore.getState().completedJourneyIds).toContain(uuid);
    // Hinted call re-buckets it
    usePathProgressStore.getState().completeJourney(uuid, { isCulmination: true });
    const s = usePathProgressStore.getState();
    expect(s.completedJourneyIds).not.toContain(uuid);
    expect(s.completedCulminationIds).toContain(uuid);
    expect(s.isCompleted(uuid)).toBe(true);
  });

  it("records the grand culmination (the-spirit) as its own flag", () => {
    usePathProgressStore.getState().completeJourney("the-spirit");
    const s = usePathProgressStore.getState();
    expect(s.grandCulminationCompleted).toBe(true);
    expect(s.isCompleted("the-spirit")).toBe(true);
    expect(s.completedJourneyIds).toEqual([]);
    expect(s.completedCulminationIds).toEqual([]);
  });
});

describe("resetProgress", () => {
  it("returns everything to the initial state", () => {
    usePathProgressStore.getState().completeJourney(firstJourneyId);
    usePathProgressStore.getState().completeJourney(firstPath.culminationJourneyId);
    usePathProgressStore.getState().resetProgress();
    const s = usePathProgressStore.getState();
    expect(s.completedJourneyIds).toEqual([]);
    expect(s.completedCulminationIds).toEqual([]);
    expect(s.completionTimestamps).toEqual({});
    expect(s.grandCulminationUnlocked).toBe(false);
    expect(s.grandCulminationCompleted).toBe(false);
  });
});
