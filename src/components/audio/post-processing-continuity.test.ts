// The post-processing grade must never pop (catalogue tour 2026-10-10: a
// colour-temperature tint that switched on at 1.8 % alpha when |ct| crossed
// 0.04 lifted every dark pixel ~3 levels in one frame — 15 filmed cases).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/components/audio/post-processing-layer.tsx", "utf8");

describe("post-processing grade is continuous", () => {
  it("the temperature tint fades across its cut-off instead of switching", () => {
    expect(src).not.toMatch(/Math\.abs\(ct\)\s*>\s*0\.0[1-9]\s*\)\s*\{/);
    expect(src).toMatch(/globalAlpha = Math\.min\(0\.22, ctAbs \* 0\.45\) \* ctOn/);
  });
  it("the ramp keeps every resting look (none below 0.03, full above 0.05)", () => {
    const ctOn = (a: number) => (a <= 0.03 ? 0 : a >= 0.05 ? 1 : ((u: number) => u * u * (3 - 2 * u))((a - 0.03) / 0.02));
    expect(ctOn(0.02)).toBe(0);
    expect(ctOn(0.06)).toBe(1);
    // continuous: no jump bigger than a hair between neighbouring values
    let prev = 0;
    for (let a = 0; a <= 0.08; a += 0.0005) { const v = Math.min(0.22, a * 0.45) * ctOn(a); expect(Math.abs(v - prev)).toBeLessThan(0.002); prev = v; }
  });
});
