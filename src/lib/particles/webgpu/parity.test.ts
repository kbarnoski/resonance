/**
 * The parity ledger can never fall behind the show engine:
 *   · every uniform of the WebGL simulation (every soul, score + hands on) and
 *     of the draw program (trails + stable motes on) is mapped in UNIFORM_PARITY;
 *   · every ParticleEngine method is mapped (also enforced by tsc in parity.ts);
 *   · Snowflake and Ghost's scripted particle moments are each covered by a
 *     lab case and only call methods the engine has.
 */
import { describe, it, expect } from "vitest";
import { buildSimFS, simSoulCount, DRAW_VS, DRAW_FS, withTrails, withStable } from "../shaders";
import { SIM_PORT, DRAW_PORT } from "./port.generated";
import { UNIFORM_PARITY, METHOD_PARITY, METHOD_PARITY_COMPLETE, MASTERED_PARITY, LAB_CASES, paritySummary } from "./parity";
import { readFileSync } from "fs";
import { join } from "path";

// the lab runner's implemented cases (its source: it imports browser-only helpers)
const LAB_SRC = readFileSync(join(__dirname, "../../../app/(room)/lab/webgpu/lab-cases.ts"), "utf8");
const CASES_COVERED = [...LAB_SRC.matchAll(/case "([\w-]+)":/g)].map((m) => m[1]);

const uniformsOf = (src: string) => new Set([...src.matchAll(/uniform\s+\w+\s+(u[A-Z]\w*)/g)].map((m) => m[1]));

describe("WebGL → WebGPU parity ledger", () => {
  it("every WebGL simulation uniform is mapped", () => {
    const sim = buildSimFS([...Array(simSoulCount()).keys()], { score: true, hands: true });
    const ported = new Set(SIM_PORT.fields.map((f) => f[0]));
    const missing = [...uniformsOf(sim)].filter((u) => !ported.has(u) && !(u in UNIFORM_PARITY));
    expect(missing, "new sim uniforms: regenerate the port (NAGA_BIN=… node scripts/gen-webgpu-port.mjs)").toEqual([]);
  });

  it("every WebGL draw uniform is mapped", () => {
    const draw = withStable(withTrails(DRAW_VS)) + withStable(withTrails(DRAW_FS));
    const ported = new Set([...DRAW_PORT.plain.fields, ...DRAW_PORT.stable.fields].map((f) => f[0]));
    const missing = [...uniformsOf(draw)].filter((u) => !ported.has(u) && !(u in UNIFORM_PARITY));
    expect(missing, "new draw uniforms: regenerate the port").toEqual([]);
  });

  it("every ParticleEngine method is mapped", () => {
    expect(METHOD_PARITY_COMPLETE).toBe(true);
    expect(Object.keys(METHOD_PARITY).length).toBeGreaterThan(60);
  });

  it("the ledger is honest: something live, nothing unaccounted", () => {
    const s = paritySummary(METHOD_PARITY);
    expect(s.live).toBeGreaterThan(60);
    expect(s.live + s.state + s.planned).toBe(Object.keys(METHOD_PARITY).length);
  });
});

describe("Snowflake + Ghost on the new engine (Karel 2026-10-13)", () => {
  it("both mastered journeys are in the checklist", () => {
    expect(new Set(MASTERED_PARITY.map((m) => m.journey))).toEqual(new Set(["first-snow", "ghost"]));
  });

  it("every moment names real engine methods and a lab case that exists", () => {
    for (const m of MASTERED_PARITY) {
      for (const k of m.surface) expect(k in METHOD_PARITY, `${m.moment}: ${k}`).toBe(true);
      expect(LAB_CASES).toContain(m.labCase);
    }
  });

  it("every mastered lab case is implemented by the lab runner", () => {
    for (const c of LAB_CASES) expect(CASES_COVERED, c).toContain(c);
  });

  it("Ghost's angel, blossom→wings and opening, Snowflake's emblems and calm holds each have a case", () => {
    const cases = new Set(MASTERED_PARITY.map((m) => m.labCase));
    for (const c of ["snowflake-emblems", "snowflake-calm", "ghost-opening", "ghost-angel", "ghost-blossom-wings"]) expect(cases).toContain(c);
  });
});
