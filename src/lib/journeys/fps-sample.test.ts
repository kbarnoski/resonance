import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FpsWindow, FPS_WINDOW_MS, fpsSampleDetail } from "./fps-sample";

const run = (w: FpsWindow, intervals: (i: number) => number, from = 0) => {
  let now = from, out = null;
  w.add(0, now);
  for (let i = 0; !out && i < 100_000; i++) { const dt = intervals(i); now += dt; out = w.add(dt, now); }
  return out!;
};

describe("fps-sample (the kiosk certifies its own frame rate)", () => {
  it("a steady 120 Hz window reads 120, no slow frames", () => {
    const s = run(new FpsWindow(), () => 1000 / 120);
    expect(s.avg).toBeCloseTo(120, 0);
    expect(s.min1s).toBeGreaterThan(119);
    expect(s.slow).toBe(0);
    expect(s.p99).toBeLessThanOrEqual(9);
    expect(s.ms).toBeGreaterThanOrEqual(FPS_WINDOW_MS);
  });
  it("one stalled second shows in min1s and slow, not hidden by the average", () => {
    // 2 s of 60 Hz inside 20 s of 120 Hz
    const s = run(new FpsWindow(), (i) => (i >= 1200 && i < 1320 ? 1000 / 60 : 1000 / 120));
    expect(s.avg).toBeGreaterThan(110);
    expect(s.min1s).toBeLessThan(70);
    expect(s.slow).toBe(120);
    expect(s.p99).toBeGreaterThan(16);
  });
  it("reset discards a partial window (hidden time is not a slow frame)", () => {
    const w = new FpsWindow();
    w.add(0, 0);
    for (let i = 1; i < 100; i++) w.add(50, i * 50);
    w.reset(10_000);
    const s = run(w, () => 1000 / 120, 10_000);
    expect(s.slow).toBe(0);
  });
  it("the log line names the journey and its time", () => {
    expect(fpsSampleDetail({ avg: 119.84, min1s: 117.2, p99: 9, slow: 3, frames: 2397, ms: 20_000 }, "ghost", 151.7)).toBe("avg 119.8 min1s 117 p99 9.0ms slow 3/2397 ghost@152");
  });
  it("the recorder emits it from its existing rAF tick (no new loop, no readbacks)", () => {
    const src = readFileSync("src/lib/journeys/glitch-recorder.ts", "utf8");
    expect(src).toMatch(/const sample = fpsWin\.add\(gap, now\);/);
    expect(src).toMatch(/type: "fps-sample"/);
    expect(src).toMatch(/if \(wasHidden\) fpsWin\.reset\(now\);/);
  });
});
