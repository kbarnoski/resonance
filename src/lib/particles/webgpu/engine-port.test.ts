/**
 * The PARITY engine (engine-port.ts): the show's own WebGL engine conducts on
 * a recording context; the ported passes run on a (fake) WebGPU device.
 *   · every pass the conductor issues lands on the GPU in order: init → sim →
 *     fade + sprites → (taa) → govern → composite;
 *   · the sim's uniforms are the conductor's own values (a setSoul lands in
 *     uSoulB at the ported block's offset);
 *   · image forms: the uv buffer and the still's pixels reach the GPU;
 *   · stall laws: async pipelines, no map, nothing created per frame;
 *   · the port is made from the CURRENT show GLSL (structurally always; by
 *     hash softly — a stale port warns, `node scripts/gen-webgpu-port.mjs`).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeGpu } from "./fake-gpu.testkit";
import { dispatchSize } from "./layout";
import { SIM_PORT, DRAW_PORT } from "./port.generated";
import { portSources, currentPortHashes } from "./port-sources";
import { portSim, portDraw } from "./gl-port";
import { soulById } from "../souls";
import { PARITY_METHODS } from "./parity";

let rafQueue: Array<(t: number) => void> = [];
let now = 1000;
function step(n = 1, ms = 16.7) {
  for (let i = 0; i < n; i++) {
    now += ms;
    const q = rafQueue;
    rafQueue = [];
    for (const f of q) f(now);
  }
}

beforeEach(() => {
  rafQueue = [];
  now = 1000;
  vi.unstubAllGlobals();
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => { rafQueue.push(f); return rafQueue.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("window", { devicePixelRatio: 1, location: { search: "" } });
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

async function makePort(o: Parameters<typeof fakeGpu>[0] = {}, opts: Record<string, unknown> = {}) {
  const fk = fakeGpu(o);
  vi.stubGlobal("navigator", { gpu: fk.gpu });
  const { createPortedParticleEngine } = await import("./engine-port");
  const engine = createPortedParticleEngine(fk.canvas as unknown as HTMLCanvasElement, { count: 4096, soul: "rings", ...opts });
  const ok = await engine.ready();
  expect(engine.failure()).toBe(null);
  expect(ok).toBe(true);
  for (let i = 0; i < 20 && !engine.isWarm(); i++) engine.warmBurst(80);
  expect(engine.isWarm()).toBe(true);
  return { ...fk, engine };
}

const offsetOf = (fields: readonly (readonly [string, string, number])[], name: string) => fields.find((f) => f[0] === name)![2];

describe("the parity engine: conductor → ported passes", () => {
  it("one conductor frame (record-quad path, ?splat=0) = init (once) → sim → fade + sprites → govern → composite", async () => {
    const { engine, calls } = await makePort({}, { splat: false });
    // seeds + the boot cloud, each once (the conductor warms them as two steps)
    const init = calls.filter((c) => c.name === "compute.setPipeline" && c.args[0] === "init");
    expect(init.length).toBe(2);
    const before = calls.length;
    engine.start();
    step(3);
    const f = calls.slice(before);
    const side = engine.stats().texSide;
    const [gx, gy] = dispatchSize(side * side);
    expect(f).toContainEqual({ name: "dispatchWorkgroups", args: ["sim", gx, gy, 1] });
    // record quads: one non-instanced triangle list, 6 vertices per mote
    expect(f).toContainEqual({ name: "draw", args: ["hdr", 6 * side * side, 1] });
    expect(f).toContainEqual({ name: "dispatchWorkgroups", args: ["govern", 1, 1, 1] });
    expect(f).toContainEqual({ name: "draw", args: ["composite", 3, 1] });
    const order = ["sim", "hdr", "govern", "composite"].map((l) => f.findIndex((c) => (c.name === "beginComputePass" || c.name === "beginRenderPass") && c.args[0] === l));
    expect(order.every((k, i) => k >= 0 && (i === 0 || k > order[i - 1]))).toBe(true);
    engine.dispose();
  });

  it("the sim runs on the conductor's own uniform values (setSoul → uSoulB)", async () => {
    const { engine, lastWrite } = await makePort();
    engine.start();
    step(2);
    engine.setSoul("rose", 2);
    step(30);
    const buf = lastWrite.get("port-simU")!;
    expect(buf).toBeTruthy();
    const i32 = new Int32Array(buf);
    expect(i32[offsetOf(SIM_PORT.fields, "uSoulB") / 4]).toBe(soulById("rose").index);
    expect(i32[offsetOf(SIM_PORT.fields, "uTexW") / 4]).toBe(engine.stats().texSide);
    const f32 = new Float32Array(buf);
    expect(f32[offsetOf(SIM_PORT.fields, "uDt") / 4]).toBeGreaterThan(0);
    // the draw block carries the quad expansion viewport
    const d = new Float32Array(lastWrite.get("port-drawU")!);
    expect([...d.slice(offsetOf(DRAW_PORT.plain.fields, "uPortVp") / 4, offsetOf(DRAW_PORT.plain.fields, "uPortVp") / 4 + 2)]).toEqual([800, 500]);
    engine.dispose();
  });

  it("image forms: the uv reaches the GPU buffer, the still's pixels a texture", async () => {
    const { engine, calls } = await makePort();
    engine.start();
    step(2);
    const n = engine.imageSampleCount();
    const before = calls.length;
    const img = { width: 64, height: 32 } as HTMLCanvasElement;
    engine.loadFormImage(img, 2, new Float32Array(n * 2));
    engine.setImageForm(1, 1);
    step(5);
    const f = calls.slice(before);
    expect(f.some((c) => c.name === "writeBuffer" && String(c.args[0]).startsWith("fbuf") && c.args[2] === n * 8)).toBe(true);
    expect(f.some((c) => c.name === "copyExternalImageToTexture" && (c.args[1] as number[])[0] === 64 && c.args[2] === true)).toBe(true);
    engine.dispose();
  });

  it("spatial pairing runs as compute (stats → hist → cdfs → assign) once per image, before the sim", async () => {
    const { engine, calls } = await makePort();
    engine.start();
    step(2);
    const n = engine.imageSampleCount();
    const uv = new Float32Array(n * 2).map((_, i) => ((i * 7919) % 1000) / 1000);
    const { pairOrder, PAIR_GROUPS } = await import("../spatial-pairing");
    const before = calls.length;
    engine.loadFormImage({ width: 64, height: 64 } as HTMLCanvasElement, 1, uv, true, pairOrder(uv, PAIR_GROUPS));
    engine.setImageForm(1, 1);
    step(4);
    const f = calls.slice(before);
    const pairing = f.filter((c) => c.name === "beginComputePass" && c.args[0] === "pairing");
    expect(pairing.length).toBe(1); // once per image
    expect(f.filter((c) => c.name === "compute.setPipeline" && c.args[0] === "pairing").length).toBe(6);
    const pi = f.findIndex((c) => c.name === "beginComputePass" && c.args[0] === "pairing");
    const si = f.findIndex((c, i) => i > pi && c.name === "beginComputePass" && c.args[0] === "sim");
    expect(si).toBeGreaterThan(pi);
    // the sorted samples and the image uv each reach their own buffer
    expect(f.filter((c) => c.name === "writeBuffer" && String(c.args[0]).startsWith("fbuf") && c.args[2] === n * 8).length).toBe(2);
    engine.dispose();
  });

  it("stable motes: the temporal resolve pass runs (TAA port)", async () => {
    const { engine, calls } = await makePort({}, { stable: true });
    const before = calls.length;
    engine.start();
    step(3);
    expect(calls.slice(before).some((c) => c.name === "beginRenderPass" && c.args[0] === "taa")).toBe(true);
    engine.dispose();
  });

  it("stall laws: async pipelines only, no map without the probe, nothing created per frame", async () => {
    const { engine, calls } = await makePort();
    engine.start();
    step(3);
    const startIdx = calls.length;
    step(60);
    engine.setSoul("spirit", 3);
    step(60);
    expect(calls.filter((c) => c.name.startsWith("missing:"))).toEqual([]);
    expect(calls.filter((c) => c.name === "mapAsync")).toEqual([]);
    // (the per-soul specialised sim pipelines are the one exception: built
    // ASYNC in the background, the union pipeline runs the soul meanwhile)
    const late = calls.slice(startIdx).filter((c) => /^create(Shader|BindGroupLayout|.*Pipeline|Buffer|Texture)/.test(c.name));
    expect(late.filter((c) => !(c.name === "createComputePipelineAsync" && /^port-sim-soul\d+$/.test(String(c.args[0]))))).toEqual([]);
    expect(calls.filter((c) => /^create(Compute|Render)Pipeline$/.test(c.name))).toEqual([]); // never synchronous
    engine.dispose();
  });

  it("is the full ParticleEngine surface (the conductor's own methods)", async () => {
    const { engine } = await makePort();
    for (const m of PARITY_METHODS) expect(typeof engine[m], m).toBe("function");
    expect(engine.backend).toBe("webgpu-port");
    engine.dispose();
  });
});

describe("the port is made from the show's current GLSL", () => {
  it("every mechanical edit still applies (structural)", () => {
    const s = portSources();
    expect(() => portSim(s.sim)).not.toThrow();
    expect(() => portDraw(s.draw.plain.vs, s.draw.plain.fs)).not.toThrow();
    expect(() => portDraw(s.draw.stable.vs, s.draw.stable.fs)).not.toThrow();
  });

  it("the generated uniform layouts equal the current ones", () => {
    const s = portSources();
    const lay = (l: ReturnType<typeof portSim>["uniforms"]) => l.fields.map((f) => [f.name, f.offset]);
    const cur = portSim(s.sim);
    if (cur.sourceHash !== SIM_PORT.hash) return; // stale → the soft check below says so
    expect(lay(cur.uniforms)).toEqual(SIM_PORT.fields.map((f) => [f[0], f[2]]));
  });

  it("generated from the current source (soft: warns when stale)", () => {
    const h = currentPortHashes();
    const fresh = h.sim === SIM_PORT.hash && h.plain === DRAW_PORT.plain.hash && h.stable === DRAW_PORT.stable.hash;
    if (!fresh) console.warn("[webgpu] port.generated.ts is stale — run NAGA_BIN=… node scripts/gen-webgpu-port.mjs");
    if (process.env.NAGA_BIN) expect(fresh).toBe(true);
  });
});
