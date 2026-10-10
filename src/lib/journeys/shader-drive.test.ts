/**
 * Shader drive + crossfade scheduling (glitch RCA 2026-10-06: "sometimes a
 * shader kind of moves in a glitch maybe from sound to no sound").
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  frameAlpha, isSilentLevel, driveTarget, stepDriveEnvelope, easedEnvelope,
  readSharedDriveEnvelope, __resetSharedDriveEnvelope, shouldRelatchDriveFlags,
  crossfadeRetarget, dequeueAfterFade, tertiaryStep, DRIVE_FALL_SEC, DRIVE_RISE_SEC,
  slewToward, slewVisibleDrive, UNIFORM_SLEW_PER_SEC, SCALE_SLEW_PER_SEC,
  type DriveFlags, type VisibleDrive,
} from "./shader-drive";
import { getJourneyEngine } from "./journey-engine";
import { BAND_PROFILES } from "./kinetic";
import { createSeededRandom } from "./seeded-random";
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
  // Determinism (flake RCA 2026-10-10): defaultPhases() draws its shader
  // pools from Math.random, so every run scripted a different `a`/`b`, and
  // ~1 pool in 130 had the finale-forced pick land on `b` itself — the
  // "next entry lands" check then saw no change. The pools are now drawn
  // from a fixed seed, the clock is fully mocked, and `b` is chosen (from
  // a dry run of the same seeded take) to differ from the forced pick.
  const buildJourney = (): Journey => {
    const rnd = createSeededRandom(20261010);
    const spy = vi.spyOn(Math, "random").mockImplementation(rnd);
    try {
      return {
        id: "test-script-edge",
        name: "Script Edge Test",
        subtitle: "",
        description: "",
        realmId: "cosmos",
        aiEnabled: false,
        phases: defaultPhases("cosmos"),
      };
    } finally {
      spy.mockRestore();
    }
  };
  const runTake = (journey: Journey, a: string, b: string) => {
    const engine = getJourneyEngine();
    engine.stop();
    let clock = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
    engine.start(journey, { seed: 7, trackDuration: 300, script: [
      { p: 0, role: "primary", mode: a },
      { p: 0.95, role: "primary", mode: b },
    ] });
    clock += 1000;
    const scripted = engine.getFrame(0.5)?.shaderMode;
    engine.forceShaderSwitch();
    const forced = engine.getCurrentShaderMode();
    const held: (string | undefined)[] = [];
    for (let i = 0; i < 20; i++) {
      clock += 100;
      held.push(engine.getFrame(0.9 + i * 0.001)?.shaderMode);
    }
    clock += 1000;
    const next = engine.getFrame(0.96)?.shaderMode;
    engine.stop();
    now.mockRestore();
    return { scripted, forced, held, next };
  };

  it("a finale-forced primary stands until the next script entry", () => {
    const journey = buildJourney();
    // the pools are a pure function of the seed (no ambient Math.random)
    expect(buildJourney().phases.map((p) => p.shaderModes)).toEqual(journey.phases.map((p) => p.shaderModes));
    const pool = journey.phases.flatMap((p) => p.shaderModes);
    const a = pool[0];
    // dry run: learn which shader the finale forces for this seeded take
    const dry = runTake(journey, a, pool.find((m) => m !== a)!);
    const b = pool.find((m) => m !== a && m !== dry.scripted && m !== dry.forced)!;
    expect(b).toBeTruthy();

    const { scripted, forced, held, next } = runTake(journey, a, b);
    // the scripted primary (or its allowed substitute) is on
    expect(scripted).toBeTruthy();
    expect(forced).toBe(dry.forced); // the take is deterministic
    expect(forced).not.toBe(scripted);
    // level-triggering reverted this on the very next frame
    expect(held).toEqual(Array(20).fill(forced));
    // the NEXT script entry still lands
    expect(next).toBeTruthy();
    expect(next).not.toBe(forced);
  });
});

describe("visible drive never steps on an audio onset (snap RCA 2026-10-10)", () => {
  // Frame-by-frame replica of the kinetic primary (bass) layer's drive in
  // visualizer.tsx: FFT smoothing k=0.3 (kinetic), eqLv fast attack 0.6 /
  // banded release, u_amplitude = eqLv, band scale = 1 + eqLv * 0.0499.
  // Input: Spectre @22.17 s — bass energy x6 within one 30 ms window.
  const simulate = (fps: number, slew: boolean) => {
    const dt = 1 / fps;
    const prof = BAND_PROFILES.bass;
    let fft = 0.1, slowEma = 0.1, eqLv = 0.5;
    let shown: VisibleDrive | null = null;
    const out: VisibleDrive[] = [];
    for (let f = 0; f < fps * 3; f++) {
      const tSec = f * dt;
      const raw = tSec < 1 ? 0.1 : 0.6 - 0.25 * Math.min(1, (tSec - 1) / 0.5);
      fft += (raw - fft) * frameAlpha(0.3, dt);
      slowEma += (raw - slowEma) * frameAlpha(0.04, dt);
      const target = driveTarget(raw, slowEma, prof.gain, 1, false);
      eqLv += (target - eqLv) * frameAlpha(target > eqLv ? 0.6 : 1 - prof.decay, dt);
      const v: VisibleDrive = { bass: fft, mid: fft * 0.5, treble: fft * 0.3, amplitude: eqLv, scale: 1 + eqLv * prof.scale };
      shown = slew ? slewVisibleDrive(shown, v, dt) : v;
      out.push(shown);
    }
    return out;
  };
  const maxStep = (frames: VisibleDrive[], key: keyof VisibleDrive) =>
    frames.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v[key] - frames[i][key])), 0);

  it("reproduces the snap without the slew (one-frame uniform + zoom jumps)", () => {
    const raw = simulate(60, false);
    expect(maxStep(raw, "amplitude")).toBeGreaterThan(0.2);   // eqLv 0.5 -> ~0.8 in a frame
    expect(maxStep(raw, "bass")).toBeGreaterThan(0.1);
    expect(maxStep(raw, "scale")).toBeGreaterThan(0.01);      // > 1 % zoom in a frame
  });

  for (const fps of [30, 60, 120]) {
    it(`caps every visible output's per-frame change at ${fps} fps`, () => {
      const frames = simulate(fps, true);
      for (const k of ["bass", "mid", "treble", "amplitude"] as const) {
        expect(maxStep(frames, k)).toBeLessThanOrEqual(UNIFORM_SLEW_PER_SEC / fps + 1e-9);
      }
      expect(maxStep(frames, "scale")).toBeLessThanOrEqual(SCALE_SLEW_PER_SEC / fps + 1e-9);
    });
  }

  it("still answers the onset quickly (responsiveness kept)", () => {
    const fps = 60;
    const raw = simulate(fps, false);
    const sl = simulate(fps, true);
    const onset = fps; // frame of the onset (t = 1 s)
    // within 0.25 s the shown values reach >= 90 % of the unslewed peak rise
    const win = Math.round(0.25 * fps);
    for (const k of ["amplitude", "bass", "scale"] as const) {
      const base = raw[onset - 1][k];
      const peakRaw = Math.max(...raw.slice(onset, onset + win).map((v) => v[k]));
      const peakSl = Math.max(...sl.slice(onset, onset + win).map((v) => v[k]));
      expect(peakSl - base).toBeGreaterThanOrEqual(0.9 * (peakRaw - base));
    }
  });

  it("first drawn frame adopts the target; slow synthetic waves pass unchanged (mastered journeys)", () => {
    const t0: VisibleDrive = { bass: 0.3, mid: 0.25, treble: 0.2, amplitude: 0.28, scale: 1 };
    expect(slewVisibleDrive(null, t0, 1 / 60)).toEqual(t0);
    // smooth-motion uniforms (visualizer synBass etc.) at the fastest clock
    // the drive can run (rate 3x) never reach the cap: output == input
    const fps = 60;
    let shown: VisibleDrive | null = null;
    let time = 0;
    for (let f = 0; f < fps * 600; f++) {
      time += (1 / fps) * 3;
      const v: VisibleDrive = {
        bass: 0.3 + 0.12 * Math.sin(time * 0.13),
        mid: 0.25 + 0.1 * Math.sin(time * 0.17 + 1.0),
        treble: 0.2 + 0.08 * Math.sin(time * 0.23 + 2.0),
        amplitude: 0.28 + 0.1 * Math.sin(time * 0.11 + 0.5),
        scale: 1,
      };
      shown = slewVisibleDrive(shown, v, 1 / fps);
      expect(shown).toEqual(v);
    }
  });

  it("a hitch never licenses a jump; non-finite input holds", () => {
    expect(slewToward(0, 1, UNIFORM_SLEW_PER_SEC, 2)).toBeCloseTo(UNIFORM_SLEW_PER_SEC * 0.05, 9);
    expect(slewToward(0.4, Number.NaN, UNIFORM_SLEW_PER_SEC, 1 / 60)).toBe(0.4);
    expect(slewToward(0.4, 0.41, UNIFORM_SLEW_PER_SEC, 1 / 60)).toBe(0.41);
  });
});
