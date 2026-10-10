// Gliding uniforms must never feed a hard switch in the particle shaders
// (2026-10-10 catalogue tour): uDensity >= 0.999 ? … flipped the whole haze
// ~25 % in one frame as the density spring crept up to 1, uDensity < 0.0005 ?
// jumped every mote 1.9x, and step(0.5, uWrap.y) flipped mid soul-blend.
// Guards like `if (uX > 0.001)` are fine — the term they gate is ~0 there.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/particles/shaders.ts", "utf8");
const GLIDING = ["uDensity", "uWrap", "uImgShow", "uImgForm", "uFire", "uRiseW", "uUnfold", "uHeightCol", "uImgTint", "uWorldFade"];

describe("particle shaders: no hard switch on a gliding uniform", () => {
  for (const u of GLIDING) {
    it(u, () => {
      const ternary = new RegExp(`${u}(?:\\.[xyzw])?\\s*(?:<|>|<=|>=)\\s*[0-9.]+\\s*\\?`, "g");
      const stepFn = new RegExp(`step\\(\\s*[0-9.]+\\s*,\\s*${u}`, "g");
      const bad = [...(src.match(ternary) ?? []), ...(src.match(stepFn) ?? [])]
        // guards at ~zero are continuous: the gated term vanishes there
        .filter((m) => !/[<>]=?\s*0\.00?1\s*\?/.test(m));
      expect(bad).toEqual([]);
    });
  }
});
