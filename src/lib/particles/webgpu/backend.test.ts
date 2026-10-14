import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { requestedParticleBackend, chooseParticleBackend, probeWebGPU, __resetWebGPUProbeForTest } from "./backend";
import { fakeGpu } from "./fake-gpu.testkit";

beforeEach(() => {
  vi.unstubAllGlobals();
  __resetWebGPUProbeForTest();
});

describe("backend selection (WebGPU by default, ?gpu=webgl2 override)", () => {
  it("WebGPU unless ?gpu=webgl2", () => {
    expect(requestedParticleBackend("")).toBe("webgpu");
    expect(requestedParticleBackend("?gpu=webgl2")).toBe("webgl2");
    expect(requestedParticleBackend("?loop=1&gpu=webgl2")).toBe("webgl2");
    expect(requestedParticleBackend("?loop=1&gpu=webgpu")).toBe("webgpu");
  });

  it("flag off → WebGL2 whatever the machine; flag on → WebGPU only when the probe found an adapter", () => {
    expect(chooseParticleBackend("webgl2", { available: true }).backend).toBe("webgl2"); // the override
    expect(chooseParticleBackend("webgpu", null).backend).toBe("webgl2");
    expect(chooseParticleBackend("webgpu", { available: false, why: "no adapter" })).toEqual({ backend: "webgl2", why: "webgpu requested, falling back: no adapter" });
    expect(chooseParticleBackend("webgpu", { available: true }).backend).toBe("webgpu");
  });

  it("probe: navigator.gpu missing → unavailable (never touches a canvas)", async () => {
    vi.stubGlobal("navigator", {});
    expect(await probeWebGPU()).toMatchObject({ available: false, why: "navigator.gpu missing" });
  });

  it("probe: adapter present → available, cached for the session", async () => {
    const fk = fakeGpu({ timestamps: true });
    vi.stubGlobal("navigator", { gpu: fk.gpu });
    const a = await probeWebGPU();
    const b = await probeWebGPU();
    expect(a).toBe(b);
    expect(a).toMatchObject({ available: true, timestamps: true });
    expect(fk.calls.filter((c) => c.name === "requestAdapter").length).toBe(1);
    expect(fk.calls.filter((c) => c.name === "getContext")).toEqual([]);
  });

  it("probe: no adapter → unavailable", async () => {
    vi.stubGlobal("navigator", { gpu: fakeGpu({ adapter: false }).gpu });
    expect(await probeWebGPU()).toMatchObject({ available: false, why: "no adapter" });
  });
});

describe("the WebGPU code loads on demand", () => {
  it("outside the webgpu folder and the lab, only shared-engine reaches it — the engine module dynamically", () => {
    const se = readFileSync(join(__dirname, "../shared-engine.ts"), "utf8");
    expect(se).toMatch(/import\("\.\/webgpu\/backend"\)/);
    expect(se).not.toMatch(/^import[^\n]*webgpu\/(backend|engine-port|port\.generated)/m);
  });
  it("nothing else imports the WebGPU engine", () => {
    const root = join(__dirname, "../../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (/particles\/webgpu\/|lab\/webgpu\/|particles\/shared-engine\.ts$/.test(p)) continue;
        if (/particles\/webgpu/.test(readFileSync(p, "utf8"))) hits.push(p.slice(root.length));
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});

describe("static stall-law scan of the engine sources", () => {
  const dir = __dirname;
  const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.includes(".test.") && !f.includes("testkit") && !f.includes(".generated."));
  it("no synchronous pipeline creation, no onSubmittedWorkDone; mapAsync only in the timing probe", () => {
    for (const f of sources) {
      const src = readFileSync(join(dir, f), "utf8").replace(/\/\/[^\n]*/g, "");
      expect(src, f).not.toMatch(/\.create(Compute|Render)Pipeline\(/);
      expect(src, f).not.toMatch(/onSubmittedWorkDone/);
      const maps = src.match(/\.mapAsync\(/g) ?? [];
      expect(maps.length, f).toBe(f === "engine.ts" || f === "engine-port.ts" ? 1 : 0);
    }
    for (const f of ["engine.ts", "engine-port.ts"]) expect(readFileSync(join(dir, f), "utf8")).toMatch(/function pollTimings[\s\S]*?\.mapAsync\(/);
  });
});
