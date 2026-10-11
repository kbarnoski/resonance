// The --shader-opacity glide must never end in a snap (catalogue tour
// 2026-10-11, Horses 1: a one-frame brightness step over a full-screen
// spiral). Phase blends move the target at the ~15 Hz frame cadence; each
// re-run used to CANCEL the running ramp, and once the remaining gap was
// ≤ 0.05 the value was set in one frame.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/components/audio/journey-compositor.tsx", "utf8");

describe("shader opacity glide is continuous", () => {
  it("a running ramp is not cancelled by the next update", () => {
    const normal = src.slice(src.indexOf("// Normal update."), src.indexOf("}, [effectiveShaderOpacity]);"));
    expect(normal).not.toMatch(/return \(\) => \{\s*cancelAnimationFrame\(introRampRafRef\.current\)/);
    expect(normal).toMatch(/Math\.abs\(effectiveShaderOpacity - from\) > 0\.02/);
  });
  it("the ramp holds during a handoff settle (freeze protocol)", () => {
    const normal = src.slice(src.indexOf("// Normal update."), src.indexOf("}, [effectiveShaderOpacity]);"));
    expect(normal).toMatch(/if \(inBoundarySettleExtended\(3000\)\) \{\s*introRampRafRef\.current = requestAnimationFrame\(ramp\);/);
  });
  it("a phase blend after a step lands with no per-frame jump > 1 %", () => {
    // 120 Hz frames; React delivers the target every 66 ms.
    let css = 0.9, ramping = false, maxStep = 0, target = 0.9;
    const setTarget = (v: number) => {
      target = v;
      if (ramping) return;                       // the running ramp tracks it
      if (Math.abs(v - css) > 0.02) ramping = true;
      else { maxStep = Math.max(maxStep, Math.abs(v - css)); css = v; }
    };
    for (let f = 0; f < 120 * 8; f++) {
      const ms = f * (1000 / 120);
      if (f % 8 === 0) {
        // a 0.3 step at 1 s, then a 2 s blend 0.6 -> 0.45 from 1.4 s
        const s = ms / 1000;
        setTarget(s < 1 ? 0.9 : s < 1.4 ? 0.6 : s < 3.4 ? 0.6 - 0.15 * ((s - 1.4) / 2) : 0.45);
      }
      if (ramping) {
        const prev = css;
        css += (target - css) * 0.012;
        if (Math.abs(css - target) < 0.005) { css = target; ramping = false; }
        maxStep = Math.max(maxStep, Math.abs(css - prev));
      }
    }
    expect(maxStep).toBeLessThan(0.02);
    expect(Math.abs(css - 0.45)).toBeLessThan(0.006);
  });
});
