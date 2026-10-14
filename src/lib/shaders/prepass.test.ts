/**
 * The 120 fps law (Karel 2026-10-13: "poor 60 fps compared to 120 is not
 * [perfection] … ensure all journeys are 120"). Ghost and Snowflake fell to
 * ~60-75 fps on the kiosk while every other journey held 120: they were the
 * only journeys whose full-screen shaders redrew on every 120 Hz frame (the
 * headroom cap covered kinetic journeys only), and their openers were the
 * catalogue's heaviest shaders. The fixes are pinned here:
 *   • every journey's shader layers redraw at ≤ 60 Hz (page + particles 120);
 *   • the heavy shaders render their smooth fields / light tables in a cheap
 *     prepass (SHADER_PREPASS) — the same picture (A/B'd per shader with
 *     scripts/perf/shader-ab.mjs: ≤ 2 steps of 255 on a handful of pixels).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHADERS, SHADER_PREPASS, WHOLE_SHADER_SCALE, prepassFor } from "./index";
import { SCRIPTED_TAKES } from "@/lib/journeys/pinned-takes";

const vis = readFileSync("src/components/audio/visualizer.tsx", "utf8");

describe("shader prepasses", () => {
  const entries = Object.entries(SHADER_PREPASS);
  it("each prepass belongs to a registered shader that samples it", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [mode, pre] of entries) {
      const frag = SHADERS[mode as keyof typeof SHADERS];
      expect(frag, mode).toBeTruthy();
      expect(pre!.frag, mode).toMatch(/void main\(\)/);
      expect(prepassFor(frag!), mode).toBe(pre);
      if (pre!.whole) {
        // the WHOLE shader renders small (its own FRAG is the prepass) and
        // the layer upsamples it — float target, original as the fallback
        expect(pre!.frag, mode).toBe(frag);
        expect(pre!.float && pre!.fallback === frag, mode).toBe(true);
        expect(pre!.scale, mode).toBeGreaterThanOrEqual(1 / 3);
        expect(pre!.scale, mode).toBeLessThan(1);
        expect(WHOLE_SHADER_SCALE[mode as keyof typeof WHOLE_SHADER_SCALE], mode).toBe(pre!.scale);
        continue;
      }
      expect(frag!, mode).toMatch(/uniform sampler2D u_pre;/);
      expect(frag!, mode).toMatch(/texture2D\(u_pre,/);
      if (pre!.columns) {
        // a per-ROW table (columns x canvas rows), exact texel reads
        expect(pre!.nearest && pre!.float, mode).toBe(true);
        expect(pre!.columns, mode).toBeLessThanOrEqual(64);
      } else if (pre!.size) {
        // a light TABLE: fixed size, exact texel reads
        expect(pre!.nearest, mode).toBe(true);
        expect(pre!.size[0] * pre!.size[1], mode).toBeLessThanOrEqual(1024);
      } else {
        // a smooth field: rendered small, sampled bilinear
        expect(pre!.scale, mode).toBeGreaterThan(0);
        expect(pre!.scale, mode).toBeLessThanOrEqual(0.5);
        expect(pre!.frag, mode).toMatch(/uniform vec2 u_preres;/);
      }
    }
  });
  it("every FLOAT prepass carries its ORIGINAL single-pass shader as the no-float fallback", () => {
    const floats = entries.filter(([, p]) => p!.float && !p!.whole);
    expect(floats.map(([m]) => m).sort()).toEqual(expect.arrayContaining(["magma", "plankton", "flame", "murmuration", "firefly-field"]));
    for (const [mode, pre] of floats) {
      expect(pre!.fallback, mode).toBeTruthy();
      expect(pre!.fallback!, mode).not.toMatch(/u_pre\b/);
      expect(pre!.fallback!, mode).toMatch(/void main\(\)/);
      expect(pre!.fallback, mode).not.toBe(SHADERS[mode as keyof typeof SHADERS]);
    }
  });
  it("the visualizer falls back to the original when float targets are missing, and sizes blocks + table rows", () => {
    expect(vis).toMatch(/if \(prepass\?\.float && !floatPrepassOk\(gl, !!prepass\.nearest\)\) \{\s*fragSrc = prepass\.fallback \?\? fragShader;\s*prepass = null;/);
    expect(vis).toMatch(/\* \(p\.blocks \?\? 1\) \+ \(p\.extraRows \?\? 0\)/);
    expect(vis).toMatch(/if \(p\.columns\) return \[p\.columns, ch\];/);
    // the target is allocated with the compile, not on the first visible frame
    expect(vis).toMatch(/if \(prepass && canvas\.width > 0 && canvas\.height > 0\) ensurePreTarget\(canvas\.width, canvas\.height\);/);
    // WHOLE: the layer's own program only upsamples; the small target is the shader's resolution
    expect(vis).toMatch(/if \(prepass\?\.whole\) fragSrc = UPSAMPLE_FRAG;/);
    expect(vis).toMatch(/gl\.uniform2f\(preU\.u_resolution, prepass!\.whole \? pw : canvas\.width, prepass!\.whole \? ph : canvas\.height\);/);
    expect(vis).toMatch(/prepass!\.float \? gl\.FLOAT : gl\.UNSIGNED_BYTE/);
    expect(vis).toMatch(/if \(uPreresMain\) gl\.uniform2f\(uPreresMain, preW, preH\);/);
  });
  it("only registered shaders sample a prepass (no FRAG reads an unbound u_pre)", () => {
    for (const [mode, frag] of Object.entries(SHADERS)) {
      if (frag && /u_pre\b/.test(frag)) expect(SHADER_PREPASS[mode as keyof typeof SHADER_PREPASS], mode).toBeTruthy();
    }
  });
  it("the mastered takes' heaviest shaders are covered (Ghost: starfield, murmuration, pendulum-dust; Snowflake: murmuration, firefly-field)", () => {
    for (const m of ["starfield", "murmuration", "pendulum-dust", "firefly-field"]) expect(SHADER_PREPASS[m as keyof typeof SHADER_PREPASS], m).toBeTruthy();
    const scripted = new Set([...SCRIPTED_TAKES.ghost, ...SCRIPTED_TAKES["first-snow"]].map((e) => e.mode));
    for (const m of ["starfield", "murmuration", "firefly-field"]) expect(scripted.has(m), m).toBe(true);
  });
  it("the visualizer runs the prepass: same async compile, drawn before the shader, freed with it", () => {
    expect(vis).toMatch(/let prepass = prepassFor\(fragShader\);/);
    expect(vis).toMatch(/gl\.bindAttribLocation\(program!, 0, "a_position"\)/);
    expect(vis).toMatch(/gl\.bindAttribLocation\(preProg!, 0, "a_position"\)/);
    expect(vis).toMatch(/preProg && !gl\.getProgramParameter\(preProg, ext\.COMPLETION_STATUS_KHR\)/);
    expect(vis).toMatch(/if \(preProg\) gl\.deleteProgram\(preProg\);/);
    expect(vis).toMatch(/if \(preFbo\) gl\.deleteFramebuffer\(preFbo\);/);
  });
});

describe("shader redraw headroom cap", () => {
  it("covers the mastered journeys too (not only the kinetic ones)", () => {
    expect(vis).toMatch(/return isFullKineticJourney\(j\) \|\| isMasteredJourneyLike\(j\) \? 1000 \/ 60 - 2 : 0;/);
    expect(vis).toMatch(/if \(fpsCapQ === "0"( \|\| isExportMode\(\))?\) return 0;/); // the lab override still exists
  });
});
