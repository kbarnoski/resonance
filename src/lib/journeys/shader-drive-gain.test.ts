/**
 * Per-shader drive gain (Karel 2026-10-13: "that amber shared web responds
 * too much to sound and over jiggles btw lol" — the amber web = magma).
 */
import { describe, expect, it } from "vitest";
import {
  SHADER_DRIVE_GAIN, shaderDriveGain, driveTarget, slewVisibleDrive, rateSmoothK, RATE_SMOOTH_K,
  frameAlpha, calmToward, type VisibleDrive,
} from "./shader-drive";
import { BAND_PROFILES } from "./kinetic";
import { FRAG as MAGMA } from "@/lib/shaders/magma";
import { SHADERS } from "@/lib/shaders";

describe("SHADER_DRIVE_GAIN", () => {
  it("calms magma (the amber web) to ×0.35; every other shader is unchanged", () => {
    expect(SHADER_DRIVE_GAIN.magma).toBe(0.35);
    expect(shaderDriveGain("magma")).toBe(0.35);
    for (const m of ["ember", "drift", "starfield", "", null, undefined]) expect(shaderDriveGain(m)).toBe(1);
    // every tuned entry names a real shader and stays within (0, 1]
    for (const [m, g] of Object.entries(SHADER_DRIVE_GAIN)) {
      expect(SHADERS[m as keyof typeof SHADERS], m).toBeTruthy();
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it("magma's band drive swings ≤ 35 % as far from rest as a normal shader's", () => {
    const prof = BAND_PROFILES.bass;
    for (const [raw, ema] of [[0.405, 0.4], [0.396, 0.4], [0.41, 0.402]] as const) {
      const full = driveTarget(raw, ema, prof.gain, 1, false) - 0.5;
      const calm = driveTarget(raw, ema, prof.gain * shaderDriveGain("magma"), 1, false) - 0.5;
      expect(Math.abs(full)).toBeLessThan(0.45); // unclamped
      expect(Math.abs(calm)).toBeCloseTo(Math.abs(full) * 0.35, 9);
    }
  });

  it("even a saturated onset only moves magma's clock within a calm band (not 0.08-3.2x)", () => {
    const g = shaderDriveGain("magma");
    for (const band of ["bass", "mid", "treble"] as const) {
      const p = BAND_PROFILES[band];
      const lo = calmToward(1, p.rateLo, g), hi = calmToward(1, p.rateHi, g);
      expect(lo).toBeGreaterThanOrEqual(0.65);
      expect(hi).toBeLessThanOrEqual(2.0);
      expect(hi - lo).toBeCloseTo((p.rateHi - p.rateLo) * 0.35, 9);
    }
    expect(calmToward(0.5, 1, g)).toBeCloseTo(0.675, 9); // a full kinetic kick -> a gentle swell
    expect(calmToward(1, 3, 1)).toBe(3); // gain 1 = unchanged
  });

  it("magma's visible uniforms and scale move slower (velocity-limited harder)", () => {
    const prev: VisibleDrive = { bass: 0.2, mid: 0.2, treble: 0.2, amplitude: 0.2, scale: 1 };
    const kick: VisibleDrive = { bass: 1, mid: 1, treble: 1, amplitude: 1, scale: 1.05 };
    const dt = 1 / 60;
    const normal = slewVisibleDrive(prev, kick, dt);
    const calm = slewVisibleDrive(prev, kick, dt, shaderDriveGain("magma"));
    expect(calm.bass - prev.bass).toBeCloseTo((normal.bass - prev.bass) * 0.35, 6);
    expect(calm.scale - prev.scale).toBeCloseTo((normal.scale - prev.scale) * 0.35, 6);
    // default gain keeps the old behaviour exactly
    expect(slewVisibleDrive(prev, kick, dt, 1)).toEqual(normal);
  });

  it("magma's clock-rate changes ease ~3x slower; others keep 0.045", () => {
    expect(rateSmoothK(1)).toBe(RATE_SMOOTH_K);
    expect(rateSmoothK(0.35)).toBeCloseTo(0.045 * 0.35, 9);
    // simulate a full rate step: magma reaches 63 % no sooner than ~1 s
    let r = 1, t = 0;
    while (r < 1 + 0.35 * 0.63) { r += (1.35 - r) * frameAlpha(rateSmoothK(0.35), 1 / 60); t += 1 / 60; }
    expect(t).toBeGreaterThan(0.9);
  });

  it("the magma GLSL has no fast clocks or re-seeding sparks (no jitter)", () => {
    // every u_time multiplier ≤ 0.6 (the old 1.2-4.0 warp/pulse/spark clocks jiggled)
    const mults = [...MAGMA.matchAll(/u_time\s*\*\s*([0-9.]+)/g)].map((m) => parseFloat(m[1]));
    expect(mults.length).toBeGreaterThan(0);
    for (const k of mults) expect(k).toBeLessThanOrEqual(0.6);
    expect(MAGMA).not.toMatch(/floor\(u_time/); // sparks re-seed only when their own life wraps
    // the audio uniforms only nudge it
    expect(MAGMA).toMatch(/paletteShift = u_amplitude \* 0\.08/);
  });
});
