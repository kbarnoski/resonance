import { describe, it, expect } from "vitest";
import { allocateByPhase, packImageIndexForProgress, packPhaseSliceForProgress, packSlotForProgress, nextSlotInSlice } from "./pack-image-allocation";
import { TRAMOKYO_PHASE_WEIGHT } from "./prompt-decoration";

// The "Ghost played backwards" bug family (2026-09-19): harvest and
// playback MUST agree on the phase→slot mapping, or the show plays its
// narrative out of order. These tests pin that contract.

const PHASES = [
  { id: "threshold", start: 0.0, end: 0.1 },
  { id: "expansion", start: 0.1, end: 0.3 },
  { id: "transcendence", start: 0.3, end: 0.6 },
  { id: "illumination", start: 0.6, end: 0.8 },
  { id: "return", start: 0.8, end: 0.92 },
  { id: "integration", start: 0.92, end: 1.0 },
] as Parameters<typeof allocateByPhase>[0];

describe("allocateByPhase", () => {
  it("distributes exactly N slots (largest remainder — no drift)", () => {
    for (const n of [12, 43, 90, 91]) {
      const counts = allocateByPhase(PHASES, n, TRAMOKYO_PHASE_WEIGHT);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(n);
      expect(counts).toHaveLength(PHASES.length);
    }
  });

  it("gives every phase at least one slot at pack scale (90)", () => {
    const counts = allocateByPhase(PHASES, 90, TRAMOKYO_PHASE_WEIGHT);
    for (const c of counts) expect(c).toBeGreaterThan(0);
  });

  it("is deterministic — harvest and playback compute identical layouts", () => {
    const a = allocateByPhase(PHASES, 90, TRAMOKYO_PHASE_WEIGHT);
    const b = allocateByPhase(PHASES, 90, TRAMOKYO_PHASE_WEIGHT);
    expect(a).toEqual(b);
  });
});

describe("packImageIndexForProgress", () => {
  it("maps progress monotonically — the story never plays backwards", () => {
    let last = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const idx = packImageIndexForProgress(PHASES, 90, Math.min(1, p));
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });

  it("start of playback maps into phase 0's slice; end into the last slice", () => {
    const counts = allocateByPhase(PHASES, 90, TRAMOKYO_PHASE_WEIGHT);
    const firstSliceEnd = counts[0];
    expect(packImageIndexForProgress(PHASES, 90, 0)).toBeLessThan(firstSliceEnd);
    const lastSliceStart = 90 - counts[counts.length - 1];
    expect(packImageIndexForProgress(PHASES, 90, 1)).toBeGreaterThanOrEqual(lastSliceStart);
    expect(packImageIndexForProgress(PHASES, 90, 1)).toBeLessThan(90);
  });

  it("bails to -1 when phases lack numeric bounds (sequential-cycle fallback)", () => {
    const boundless = [{ id: "a" }, { id: "b" }] as Parameters<typeof allocateByPhase>[0];
    expect(packImageIndexForProgress(boundless, 90, 0.5)).toBe(-1);
  });

  it("bails to -1 on invalid progress", () => {
    expect(packImageIndexForProgress(PHASES, 90, -1)).toBe(-1);
  });
});

describe("phase-bounded slots (arc law 2026-10-01)", () => {
  const phases = [
    { id: "threshold", start: 0, end: 0.14 },
    { id: "expansion", start: 0.14, end: 0.3 },
    { id: "transcendence", start: 0.3, end: 0.55 },
    { id: "illumination", start: 0.55, end: 0.72 },
    { id: "return", start: 0.72, end: 0.88 },
    { id: "integration", start: 0.88, end: 1 },
  ];
  it("jitter never leaves the phase slice and never skips a phase's first slot", () => {
    for (let jitter = 0; jitter <= 5; jitter++) {
      let prev = -1;
      let prevSliceStart = -1;
      for (let k = 0; k <= 1000; k++) {
        const p = k / 1000;
        const slice = packPhaseSliceForProgress(phases, 90, p)!;
        const idx = packSlotForProgress(phases, 90, p, jitter);
        expect(idx).toBeGreaterThanOrEqual(slice.start);
        expect(idx).toBeLessThan(slice.end);
        if (slice.start !== prevSliceStart) expect(idx).toBe(slice.start); // phase opens on its first image
        expect(idx).toBeGreaterThanOrEqual(prev);
        prev = idx;
        prevSliceStart = slice.start;
      }
    }
  });
  it("walks stay inside the slice and never wrap", () => {
    const slice = { start: 82, end: 90 };
    expect(nextSlotInSlice(89, slice, (i) => i !== 89)).toBe(88);
    expect(nextSlotInSlice(85, slice, (i) => i === 86)).toBe(86);
    expect(nextSlotInSlice(85, slice, () => false)).toBe(85);
  });
});
