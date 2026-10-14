import { describe, it, expect } from "vitest";
import { createSwitchableEngine } from "./switchable";
import type { ParticleEngine } from "../particle-engine";

function rec() {
  const calls: [string, unknown[]][] = [];
  const e = new Proxy({} as ParticleEngine, {
    get: (_t, p: string) => (...a: unknown[]) => { calls.push([p, a]); return p === "isWarm" ? true : undefined; },
  });
  return { e, calls };
}

describe("the switchable engine (WebGPU → WebGL2 fallback)", () => {
  it("forwards every call to the current engine", () => {
    const a = rec();
    const sw = createSwitchableEngine(a.e, "webgpu");
    sw.engine.setSoul("rose", 3);
    expect(sw.engine.isWarm()).toBe(true);
    expect(a.calls.map((c) => c[0])).toEqual(["setSoul", "isWarm"]);
    expect(sw.backend()).toBe("webgpu");
  });

  it("falls back with the state replayed: souls prepared, last value of each setter in call order, running", () => {
    const a = rec(), b = rec();
    const sw = createSwitchableEngine(a.e, "webgpu");
    sw.engine.prepare(["rings", "spirit"]);
    sw.engine.setSoul("rings", 2);
    sw.engine.setPalette(null);
    sw.engine.setSoul("spirit", 4);
    sw.engine.setImageForm(0.5, 0.5);
    sw.engine.impulse("scatter", 1); // an event, not state
    sw.engine.start();
    sw.fallBack(b.e);
    expect(sw.backend()).toBe("webgl2");
    expect(b.calls).toEqual([
      ["prepare", [["rings", "spirit"]]],
      ["setPalette", [null]],
      ["setSoul", ["spirit", 4]],
      ["setImageForm", [0.5, 0.5]],
      ["start", []],
    ]);
    expect(a.calls.slice(-2).map((c) => c[0])).toEqual(["stop", "dispose"]);
    sw.engine.setDensity(0.3);
    expect(b.calls.at(-1)).toEqual(["setDensity", [0.3]]);
  });
});
