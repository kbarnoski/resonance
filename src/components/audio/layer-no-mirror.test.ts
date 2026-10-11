// A shader is never drawn on two layers at once (tour pass 3, 2026-10-11: 37
// episodes of primary == dual/tertiary, screen-blended onto itself). The
// visualizer is the single guard every engine path goes through.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/components/audio/visualizer.tsx", "utf8");

describe("visualizer never mirrors the primary", () => {
  it("dual target excludes the primary's shader", () => {
    expect(src).toMatch(/const dualShaderTarget = [^;]*journeyDualShaderMode !== actualPrimaryMode/);
  });
  it("tertiary target excludes the primary's shader", () => {
    expect(src).toMatch(/const tertiaryShaderTarget = [^;]*journeyTertiaryShaderMode !== actualPrimaryMode/);
  });
});
