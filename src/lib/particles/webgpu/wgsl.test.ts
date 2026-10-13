import { describe, it, expect } from "vitest";
import { existsSync, writeFileSync, mkdtempSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import {
  allModules, buildSimWGSL, ENTRY_POINTS, FORCES, DEFAULT_FORCES, FORM_NAMES, SIM_BINDINGS, RENDER_BINDINGS, GOVERN_BINDINGS, FORMS_WGSL,
} from "./wgsl";
import { SIM_LAYOUT, RENDER_LAYOUT, GOVERNOR_LAYOUT, structWGSL, WORKGROUP } from "./layout";

const balanced = (s: string) => {
  let d = 0;
  for (const ch of s) {
    if (ch === "{" || ch === "(" || ch === "[") d++;
    if (ch === "}" || ch === ")" || ch === "]") d--;
    if (d < 0) return false;
  }
  return d === 0;
};

describe("WGSL generation", () => {
  const mods = allModules();

  it("every module is balanced, has its entry points, and carries no GLSL", () => {
    for (const [name, src] of Object.entries(mods)) {
      expect(balanced(src.replace(/\/\/[^\n]*/g, "")), name).toBe(true);
      for (const ep of ENTRY_POINTS[name]) expect(src, `${name}.${ep}`).toMatch(new RegExp(`fn ${ep}\\(`));
      expect(src, name).not.toMatch(/\b(texelFetch|gl_\w+|uniform\s+(float|vec\d|sampler2D)|#version|precision\s+highp)\b/);
      expect(src, name).not.toMatch(/\bvec[234]\(/); // WGSL spells vec3f(…)
    }
  });

  it("uniform structs come from layout.ts verbatim (JS offsets == WGSL)", () => {
    expect(mods.sim).toContain(structWGSL(SIM_LAYOUT));
    expect(mods.render).toContain(structWGSL(RENDER_LAYOUT));
    expect(mods.govern).toContain(structWGSL(GOVERNOR_LAYOUT));
    expect(mods.composite).toContain(structWGSL(GOVERNOR_LAYOUT));
  });

  it("bindings: unique per module and equal to the engine's binding tables", () => {
    const bindings = (src: string) => [...src.matchAll(/@group\(0\) @binding\((\d+)\) var(?:<[^>]+>)? (\w+)/g)].map((m) => [Number(m[1]), m[2]] as const);
    const sim = bindings(mods.sim);
    expect(Object.fromEntries(sim.map(([b, n]) => [n === "U" ? "uniforms" : n, b]))).toEqual(SIM_BINDINGS);
    expect(Object.fromEntries(bindings(mods.render).map(([b, n]) => [n === "R" ? "uniforms" : n, b]))).toEqual(RENDER_BINDINGS);
    for (const m of [mods.govern, mods.composite])
      expect(Object.fromEntries(bindings(m).map(([b, n]) => [n === "G" ? "uniforms" : n, b]))).toEqual(GOVERN_BINDINGS);
    for (const src of Object.values(mods)) {
      const ids = bindings(src).map(([b]) => b);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("compute workgroups match WORKGROUP (dispatchSize math)", () => {
    expect([...mods.sim.matchAll(/@workgroup_size\((\d+)\)/g)].map((m) => Number(m[1]))).toEqual([WORKGROUP, WORKGROUP, WORKGROUP]);
  });

  it("the force stack composes: only the asked-for forces, in order; unknown ones throw", () => {
    const only = buildSimWGSL(["curl"]);
    expect(only).toContain("// ── force: curl");
    expect(only).not.toContain("// ── force: image");
    const all = buildSimWGSL(DEFAULT_FORCES);
    const order = DEFAULT_FORCES.map((f) => all.indexOf(`// ── force: ${f}`));
    expect(order.every((k, i) => k > 0 && (i === 0 || k > order[i - 1]))).toBe(true);
    expect(() => buildSimWGSL(["nope" as never])).toThrow();
  });

  it("MOTION, NOT BRIGHTNESS: no force module touches size, alpha or colour", () => {
    for (const f of Object.values(FORCES)) expect(f.wgsl, f.id).not.toMatch(/\b(alpha|col|gain|R\.|palLow|palMid|palHigh|hue|sat|pointPx)\b/);
    // the sim writes only particle state
    const writes = [...mods.sim.matchAll(/^\s*(\w+)\[i\]\s*=/gm)].map((m) => m[1]);
    expect(new Set(writes)).toEqual(new Set(["seed", "pos", "vel"]));
  });

  it("one formPoint case per named form", () => {
    expect([...FORMS_WGSL.matchAll(/case (\d+)u:/g)].length + 1).toBe(FORM_NAMES.length);
  });

  // Full WGSL validation (naga — the validator wgpu / Firefox use) when a
  // binary is available: NAGA_BIN=/path/to/naga npx vitest run src/lib/particles
  it.runIf(!!process.env.NAGA_BIN && existsSync(process.env.NAGA_BIN ?? ""))("validates with naga", () => {
    const dir = mkdtempSync(join(tmpdir(), "wgsl-"));
    for (const [name, src] of Object.entries(mods)) {
      const f = join(dir, `${name}.wgsl`);
      writeFileSync(f, src);
      const out = execFileSync(process.env.NAGA_BIN!, [f], { encoding: "utf8" });
      expect(out, name).toMatch(/Validation successful/);
    }
  });
});
