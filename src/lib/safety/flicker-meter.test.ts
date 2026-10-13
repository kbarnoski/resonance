/**
 * Photosensitive flicker meter — synthetic-signal tests for the pure core
 * (src/lib/safety/flicker-analysis.mjs, shared with scripts/flicker-meter.mjs).
 * Thresholds: WCAG 2.3.1 / ITU-R BT.1702 / Ofcom — see docs/flicker-safety.md.
 */
import { describe, expect, it } from "vitest";
import { analyzeFrames } from "./flicker-analysis.mjs";

const W = 128;
const H = 72;
const FPS = 30;
const geom = { width: W, height: H, fps: FPS };

type RGB = [number, number, number];
type Painter = (frame: number, x: number, y: number) => RGB;

function film(seconds: number, paint: Painter): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let f = 0; f < seconds * FPS; f++) {
    const buf = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [r, g, b] = paint(f, x, y);
        const p = (y * W + x) * 3;
        buf[p] = r; buf[p + 1] = g; buf[p + 2] = b;
      }
    }
    frames.push(buf);
  }
  return frames;
}

/** Square wave at `hz` (full cycle = one flash). */
const square = (hz: number) => (f: number) => Math.floor((f * 2 * hz) / FPS) % 2 === 0;
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const DARK: RGB = [12, 10, 14]; // show-like near-black ground

describe("flicker meter — general flash (WCAG 2.3.1 / BT.1702)", () => {
  it("steady frame passes with zero flashes", () => {
    const r = analyzeFrames(film(3, () => DARK), geom);
    expect(r.verdict).toBe("PASS");
    expect(r.general.maxFlashesPerSec).toBe(0);
    expect(r.local.peakFieldPct).toBe(0);
  });

  it("5 Hz full-screen black/white fails", () => {
    const on = square(5);
    const r = analyzeFrames(film(3, (f) => (on(f) ? WHITE : BLACK)), geom);
    expect(r.verdict).toBe("FAIL");
    expect(r.general.fail).toBe(true);
    expect(r.general.maxFlashesPerSec).toBeGreaterThanOrEqual(4.5);
    expect(r.ofcomWholeScreen.fail).toBe(true);
  });

  it("4 Hz fails, 3 Hz is at the limit and passes", () => {
    const four = square(4), three = square(3);
    expect(analyzeFrames(film(3, (f) => (four(f) ? WHITE : BLACK)), geom).general.fail).toBe(true);
    const r3 = analyzeFrames(film(3, (f) => (three(f) ? WHITE : BLACK)), geom);
    expect(r3.general.maxFlashesPerSec).toBe(3);
    expect(r3.general.fail).toBe(false);
  });

  it("2 Hz full-screen black/white passes the general-flash rule", () => {
    const on = square(2);
    const r = analyzeFrames(film(3, (f) => (on(f) ? WHITE : BLACK)), geom);
    expect(r.general.fail).toBe(false);
    expect(r.general.maxFlashesPerSec).toBeLessThanOrEqual(2);
    expect(r.verdict).not.toBe("FAIL");
  });

  it("slow 1 s fades (black <-> white) pass with no local warning", () => {
    const r = analyzeFrames(film(4, (f) => {
      const ph = (f % (2 * FPS)) / FPS; // 0..2
      const v = Math.round(255 * (ph < 1 ? ph : 2 - ph));
      return [v, v, v];
    }), geom);
    expect(r.verdict).toBe("PASS");
    expect(r.general.maxFlashesPerSec).toBeLessThanOrEqual(1);
    expect(r.local.warn).toBe(false);
  });

  it("transitions where the darker state is >= 0.80 luminance are not flashes", () => {
    // 235 <-> 255 sRGB: both states above 0.8 relative luminance
    const on = square(6);
    const r = analyzeFrames(film(3, (f) => (on(f) ? WHITE : [235, 235, 235])), geom);
    expect(r.general.maxFlashesPerSec).toBe(0);
  });

  it("a 1/9-screen region at 5 Hz fails WCAG (10-degree field) but not Ofcom whole-screen", () => {
    const on = square(5);
    const r = analyzeFrames(film(3, (f, x, y) =>
      on(f) && x >= W / 3 && x < (2 * W) / 3 && y >= H / 3 && y < (2 * H) / 3 ? WHITE : BLACK), geom);
    expect(r.general.fail).toBe(true);
    expect(r.ofcomWholeScreen.fail).toBe(false);
  });
});

describe("flicker meter — red flash", () => {
  // Saturated red vs a grey of (nearly) equal relative luminance: no general
  // luminance flash, but a red flash per WCAG's (R-G-B)*320 rule.
  const RED: RGB = [255, 0, 0]; // Y = 0.2126
  const GREY: RGB = [127, 127, 127]; // Y ~= 0.212
  it("5 Hz saturated red <-> equal-luminance grey fails on red flash only", () => {
    const on = square(5);
    const r = analyzeFrames(film(3, (f) => (on(f) ? RED : GREY)), geom);
    expect(r.general.fail).toBe(false);
    expect(r.red.fail).toBe(true);
    expect(r.verdict).toBe("FAIL");
  });

  it("2 Hz red <-> grey passes", () => {
    const on = square(2);
    const r = analyzeFrames(film(3, (f) => (on(f) ? RED : GREY)), geom);
    expect(r.red.fail).toBe(false);
  });
});

describe("flicker meter — local flicker (particle shimmer)", () => {
  it("small-area 8 Hz sparkle WARNs (local flicker) but does not FAIL", () => {
    const on = square(8);
    // 8x8 px sparkle (~0.7 % of screen, ~6 % of a 10-degree field) on a dark ground
    const r = analyzeFrames(film(3, (f, x, y) =>
      on(f) && x >= 64 && x < 72 && y >= 32 && y < 40 ? WHITE : DARK), geom);
    expect(r.general.fail).toBe(false);
    expect(r.red.fail).toBe(false);
    expect(r.verdict).toBe("WARN");
    expect(r.local.warn).toBe(true);
    expect(r.local.peakFieldPct).toBeGreaterThan(10);
    expect(r.local.worstRegion.label).toBe("center");
  });

  it("a drifting dot (constant brightness, motion not flicker) does not warn", () => {
    // 4x4 dot sweeping left->right at 2 px/frame across the screen
    const r = analyzeFrames(film(3, (f, x, y) => {
      const px = (f * 2) % W;
      return x >= px && x < px + 4 && y >= 34 && y < 38 ? WHITE : DARK;
    }), geom);
    expect(r.verdict).toBe("PASS");
  });

  it("a small sparkle pulsing at 2 Hz does not warn", () => {
    const on = square(2);
    const r = analyzeFrames(film(3, (f, x, y) =>
      on(f) && x >= 64 && x < 72 && y >= 32 && y < 40 ? WHITE : DARK), geom);
    expect(r.local.warn).toBe(false);
    expect(r.verdict).toBe("PASS");
  });
});
