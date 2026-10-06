/**
 * Shader drive + crossfade scheduling (glitch RCA 2026-10-06: "sometimes a
 * shader kind of moves in a glitch maybe from sound to no sound").
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  frameAlpha, isSilentLevel, driveTarget, stepDriveEnvelope, easedEnvelope,
  readSharedDriveEnvelope, __resetSharedDriveEnvelope, shouldRelatchDriveFlags,
  crossfadeRetarget, dequeueAfterFade, tertiaryStep, DRIVE_FALL_SEC, DRIVE_RISE_SEC,
  type DriveFlags,
} from "./shader-drive";
import { getJourneyEngine } from "./journey-engine";
import { defaultPhases } from "./journeys";
import type { Journey } from "./types";

describe("frameAlpha (time-based smoothing)", () => {
  it("equals the tuned per-frame constant at 60 fps", () => {
    expect(frameAlpha(0.045, 1 / 60)).toBeCloseTo(0.045, 6);
    expect(frameAlpha(0.6, 1 / 60)).toBeCloseTo(0.6, 6);
  });
  it("keeps the same time constant at 30 fps and 120 fps", () => {
    // two 60 fps steps == one 30 fps step
    const two60 = 1 - (1 - 0.04) ** 2;
    expect(frameAlpha(0.04, 1 / 30)).toBeCloseTo(two60, 6);
    const half = 1 - Math.sqrt(1 - 0.04);
    expect(frameAlpha(0.04, 1 / 120)).toBeCloseTo(half, 6);
  });
  it("is bounded", () => {
    expect(frameAlpha(1, 0.01)).toBe(1);
    expect(frameAlpha(0.3, 0)).toBe(0);
  });
});

describe("silence-aware drive", () => {
  it("detects analyser silence (the -100 dB floor reads as 0)", () => {
    expect(isSilentLevel(0)).toBe(true);
    expect(isSilentLevel(0.003)).toBe(true);
    expect(isSilentLevel(0.05)).toBe(false);
    expect(isSilentLevel(Number.NaN)).toBe(true);
  });
  it("silence parks the drive at neutral instead of braking to the floor", () => {
    // old behaviour: raw 0 against a 0.4 running mean clamped to 0.05 (brake)
    expect(driveTarget(0, 0.4, 19.2, 1, false)).toBe(0.05);
    expect(driveTarget(0, 0.4, 19.2, 1, true)).toBe(0.5);
  });
  it("a closed envelope gives neutral drive — no surge on the first note after silence", () => {
    // first note against a near-zero mean: full surge with the envelope open…
    expect(driveTarget(0.3, 0.0, 19.2, 1, false)).toBe(1);
    // …and neutral while the envelope is closed (handoff / just resumed)
    expect(driveTarget(0.3, 0.0, 19.2, 0, false)).toBe(0.5);
    const half = driveTarget(0.3, 0.29, 19.2, 0.5, false);
    expect(half).toBeGreaterThan(0.5);
    expect(half).toBeLessThan(driveTarget(0.3, 0.29, 19.2, 1, false));
  });
});

describe("drive envelope", () => {
  afterEach(() => __resetSharedDriveEnvelope());
  it("falls to 0 in ~1.5 s and rises back in ~3 s, linearly", () => {
    let v = 1;
    for (let i = 0; i < 15; i++) v = stepDriveEnvelope(v, false, 0.1);
    expect(v).toBeCloseTo(0, 6);
    expect(stepDriveEnvelope(1, false, DRIVE_FALL_SEC / 2)).toBeCloseTo(0.5, 6);
    expect(stepDriveEnvelope(0, true, DRIVE_RISE_SEC / 2)).toBeCloseTo(0.5, 6);
    let r = 0;
    for (let i = 0; i < 30; i++) r = stepDriveEnvelope(r, true, 0.1);
    expect(r).toBeCloseTo(1, 6);
  });
  it("is eased (smoothstep) and continuous", () => {
    expect(easedEnvelope(0)).toBe(0);
    expect(easedEnvelope(1)).toBe(1);
    expect(easedEnvelope(0.5)).toBeCloseTo(0.5, 6);
    let prev = 0;
    for (let x = 0; x <= 1.0001; x += 0.01) {
      const e = easedEnvelope(x);
      expect(e - prev).toBeLessThan(0.016);
      prev = e;
    }
  });
  it("shared envelope advances by wall time once, however many layers read it", () => {
    __resetSharedDriveEnvelope(1);
    expect(readSharedDriveEnvelope(1000, false)).toBe(1); // first read anchors the clock
    // three layers read in the same frame: one step, not three
    readSharedDriveEnvelope(1750, false);
    readSharedDriveEnvelope(1750, false);
    const e = readSharedDriveEnvelope(1750, false);
    expect(e).toBeCloseTo(easedEnvelope(0.5), 6);
    expect(readSharedDriveEnvelope(4000, false)).toBe(0);
  });
});

describe("per-layer drive flags latch", () => {
  const snow: DriveFlags = { smoothMotion: true, tempoFlow: false, bandFocus: undefined, bandDriveOnly: false };
  const realized: DriveFlags = { smoothMotion: true, tempoFlow: false, bandFocus: "bass", bandDriveOnly: true };
  it("an outgoing shader on screen keeps its flags through the handoff", () => {
    expect(shouldRelatchDriveFlags(snow, realized, false, true)).toBe(false);
  });
  it("adopts the new journey's flags while parked or after the handoff", () => {
    expect(shouldRelatchDriveFlags(snow, realized, true, true)).toBe(true);
    expect(shouldRelatchDriveFlags(snow, realized, false, false)).toBe(true);
  });
  it("never re-latches identical flags", () => {
    expect(shouldRelatchDriveFlags(realized, { ...realized }, true, false)).toBe(false);
  });
});

describe("crossfade re-target queue", () => {
  it("queues a target that arrives while a fade is in flight", () => {
    expect(crossfadeRetarget("b", "a", true)).toBe("queue");
    expect(crossfadeRetarget(null, "a", true)).toBe("queue");
  });
  it("starts immediately when idle or still compiling at opacity 0", () => {
    expect(crossfadeRetarget("b", "a", false)).toBe("start");
    expect(crossfadeRetarget("a", "a", false)).toBe("noop");
  });
  it("starts the queued target when the fade completes — unless it is what just landed", () => {
    expect(dequeueAfterFade(undefined, "b")).toEqual({ start: false, target: "b" });
    expect(dequeueAfterFade("c", "b")).toEqual({ start: true, target: "c" });
    expect(dequeueAfterFade("b", "b")).toEqual({ start: false, target: "b" });
    expect(dequeueAfterFade(null, "b")).toEqual({ start: true, target: null });
  });
});

describe("tertiary single-layer scheduling", () => {
  it("never swaps a visible shader in place — fades it out first", () => {
    expect(tertiaryStep("y", "x", 0.6, "shown")).toBe("fade-out");
    expect(tertiaryStep("y", "x", 0.3, "shown")).toBe("fade-out");
    expect(tertiaryStep(null, "x", 0.6, "shown")).toBe("fade-out");
  });
  it("waits for a running fade-out to finish", () => {
    expect(tertiaryStep("y", "x", 0.2, "out")).toBe("none");
  });
  it("swaps freely while nothing is visible", () => {
    expect(tertiaryStep("y", "x", 0, "waiting")).toBe("load");
    expect(tertiaryStep("y", null, 0, "idle")).toBe("load");
    expect(tertiaryStep(null, "x", 0, "waiting")).toBe("unmount");
    expect(tertiaryStep("x", "x", 0.6, "shown")).toBe("none");
    expect(tertiaryStep(null, null, 0, "idle")).toBe("none");
  });
});

describe("take script is edge-triggered", () => {
  afterEach(() => { getJourneyEngine().stop(); vi.restoreAllMocks(); });
  it("a finale-forced primary stands until the next script entry", () => {
    const journey: Journey = {
      id: "test-script-edge",
      name: "Script Edge Test",
      subtitle: "",
      description: "",
      realmId: "cosmos",
      aiEnabled: false,
      phases: defaultPhases("cosmos"),
    };
    const engine = getJourneyEngine();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const pool = journey.phases.flatMap((p) => p.shaderModes);
    const a = pool[0];
    const b = pool.find((m) => m !== a)!;
    engine.start(journey, { seed: 7, trackDuration: 300, script: [
      { p: 0, role: "primary", mode: a },
      { p: 0.95, role: "primary", mode: b },
    ] });
    clock += 1000;
    // the scripted primary (or its allowed substitute) is on
    const scripted = engine.getFrame(0.5)?.shaderMode;
    expect(scripted).toBeTruthy();
    engine.forceShaderSwitch();
    const forced = engine.getCurrentShaderMode();
    expect(forced).not.toBe(scripted);
    // level-triggering reverted this on the very next frame
    for (let i = 0; i < 20; i++) {
      clock += 100;
      expect(engine.getFrame(0.9 + i * 0.001)?.shaderMode).toBe(forced);
    }
    // the NEXT script entry still lands
    clock += 1000;
    const next = engine.getFrame(0.96)?.shaderMode;
    expect(next).not.toBe(forced);
  });
});
