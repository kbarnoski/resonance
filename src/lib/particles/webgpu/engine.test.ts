/**
 * The WebGPU engine against a recording fake device (fake-gpu.testkit.ts):
 * the kiosk stall laws (docs/webgpu-engine-plan.md §5) and the frame shape.
 *   1. every pipeline is built ASYNC, before anything draws; no synchronous
 *      pipeline call exists; nothing maps a buffer on the frame path;
 *   2. isWarm() stays false until the device, pipelines and init passes are
 *      done (the layer keeps the field invisible until then);
 *   3. a 10⁶-mote image uv (8 MB) trickles in ≤ 1 MB per frame and the image
 *      pull holds until it has landed;
 *   4. failures arrive as watchdog.onStall (adapter, WGSL) — the session's
 *      particles switch off exactly as for a failed WebGL program;
 *   5. navigator.gpu missing → ParticleEngineUnsupported, synchronously.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeGpu, settle } from "./fake-gpu.testkit";
import { dispatchSize, UPLOAD_CHUNK_BYTES } from "./layout";
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
});

async function makeEngine(o: Parameters<typeof fakeGpu>[0] = {}, opts: Record<string, unknown> = {}) {
  const fk = fakeGpu(o);
  vi.stubGlobal("navigator", { gpu: fk.gpu });
  const { createWebGPUParticleEngine } = await import("./engine");
  const engine = createWebGPUParticleEngine(fk.canvas as unknown as HTMLCanvasElement, { count: 4096, soul: "rings", ...opts });
  return { ...fk, engine };
}

describe("WebGPU engine: kiosk stall laws", () => {
  it("builds every pipeline async before the first draw; no sync pipeline call, no map on the frame path", async () => {
    const { engine, calls } = await makeEngine();
    expect(await engine.ready()).toBe(true);
    const asyncPipes = calls.filter((c) => c.name === "createComputePipelineAsync" || c.name === "createRenderPipelineAsync");
    expect(asyncPipes.map((c) => c.args[0]).sort()).toEqual(["composite", "fade", "govern", "integrate", "posInit", "seedInit", "sprites"]);
    const firstDraw = calls.findIndex((c) => c.name === "draw" || c.name === "dispatchWorkgroups");
    const lastPipe = calls.reduce((k, c, i) => (c.name.endsWith("PipelineAsync") ? i : k), -1);
    expect(firstDraw === -1 || firstDraw > lastPipe).toBe(true);

    for (let i = 0; i < 20 && !engine.isWarm(); i++) engine.prewarm();
    engine.start();
    step(60);
    engine.setSoul("knot", 4);
    engine.setProceduralForm(3, 2);
    step(60);
    expect(calls.filter((c) => c.name.startsWith("missing:"))).toEqual([]);
    expect(calls.filter((c) => c.name === "mapAsync")).toEqual([]);
    // nothing is created per frame: no pipelines, modules, layouts after start
    const startIdx = calls.findIndex((c) => c.name === "draw");
    const lateCreates = calls.slice(startIdx).filter((c) => /^create(Shader|BindGroupLayout|.*Pipeline)/.test(c.name));
    expect(lateCreates).toEqual([]);
    engine.dispose();
  });

  it("isWarm() only after device + pipelines + init passes; the init runs while invisible", async () => {
    const { engine, calls } = await makeEngine();
    expect(engine.isWarm()).toBe(false); // pipelines still resolving
    await engine.ready();
    expect(engine.isWarm()).toBe(false); // init passes not run yet
    engine.prewarm();
    expect(engine.isWarm()).toBe(true);
    const init = calls.filter((c) => c.name === "dispatchWorkgroups" && c.args[0] === "init");
    expect(init.length).toBe(2); // seedInit + posInit
    expect(calls.filter((c) => c.name === "draw")).toEqual([]); // nothing drawn while warming
    engine.dispose();
  });

  it("one frame = integrate dispatch over every mote, fade + instanced sprites, govern, composite", async () => {
    const { engine, calls } = await makeEngine({}, { count: 1_000_000 });
    await engine.ready();
    engine.prewarm();
    const before = calls.length;
    engine.start();
    step(2);
    const frame = calls.slice(before);
    const [gx, gy] = dispatchSize(1_000_000);
    expect(frame).toContainEqual({ name: "dispatchWorkgroups", args: ["integrate", gx, gy, 1] });
    expect(frame).toContainEqual({ name: "draw", args: ["hdr", 4, 1_000_000] });
    expect(frame).toContainEqual({ name: "draw", args: ["hdr", 3, 1] });
    expect(frame).toContainEqual({ name: "dispatchWorkgroups", args: ["govern", 1, 1, 1] });
    expect(frame).toContainEqual({ name: "draw", args: ["composite", 3, 1] });
    // the HDR target is cleared once, then loaded (trails)
    const hdrPasses = frame.filter((c) => c.name === "beginRenderPass" && c.args[0] === "hdr");
    expect(hdrPasses.map((c) => c.args[1])).toEqual(["clear", "load"]);
    expect(engine.stats().count).toBe(1_000_000);
    engine.dispose();
  });

  it("a 10⁶-mote image uv trickles in ≤ 1 MB per frame; the pull holds until it lands", async () => {
    const { engine, calls } = await makeEngine({}, { count: 1_000_000 });
    await engine.ready();
    engine.prewarm();
    engine.start();
    step(3);
    const n = engine.imageSampleCount();
    expect(n).toBe(1_000_000);
    const before = calls.length;
    engine.loadFormImage({} as HTMLCanvasElement, 1, new Float32Array(n * 2));
    engine.setImageForm(1, 1);
    step(4);
    expect(engine.imageState().form).toBe(0); // still uploading: no pull toward stale targets
    step(10);
    const uvWrites = calls.slice(before).filter((c) => c.name === "writeBuffer" && String(c.args[0]).startsWith("uv"));
    expect(uvWrites.length).toBe(Math.ceil((n * 8) / UPLOAD_CHUNK_BYTES));
    for (const w of uvWrites) expect(w.args[2] as number).toBeLessThanOrEqual(UPLOAD_CHUNK_BYTES);
    expect(uvWrites.every((w) => w.args[0] === uvWrites[0].args[0])).toBe(true); // into the idle half
    step(60);
    expect(engine.imageState().form).toBeGreaterThan(0.3);
    engine.dispose();
  });

  it("timing probe: maps only the timestamp read-back, one in flight, never awaited in the frame", async () => {
    const { engine, calls } = await makeEngine({ timestamps: true }, { gpuTiming: true });
    await engine.ready();
    engine.prewarm();
    engine.start();
    step(90);
    await settle();
    step(30);
    const maps = calls.filter((c) => c.name === "mapAsync");
    expect(maps.length).toBeGreaterThan(0);
    expect(new Set(maps.map((m) => m.args[0]))).toEqual(new Set(["ts-read"]));
    expect(engine.info()?.timestamps).toBe(true);
    engine.dispose();
  });
});

describe("WebGPU engine: failure → fallback contract", () => {
  it("navigator.gpu missing → ParticleEngineUnsupported, synchronously", async () => {
    vi.stubGlobal("navigator", {});
    const { createWebGPUParticleEngine } = await import("./engine");
    const { ParticleEngineUnsupported } = await import("../particle-engine");
    const fk = fakeGpu();
    expect(() => createWebGPUParticleEngine(fk.canvas as unknown as HTMLCanvasElement)).toThrow(ParticleEngineUnsupported);
  });

  it("no adapter → watchdog.onStall, failure(), ready() false — never draws", async () => {
    const onStall = vi.fn();
    const { engine, calls } = await makeEngine({ adapter: false }, { watchdog: { cpuMs: 50, gapMs: 1000, onStall } });
    expect(await engine.ready()).toBe(false);
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(engine.failure()).toMatch(/adapter/);
    expect(engine.isWarm()).toBe(false);
    engine.start();
    step(10);
    expect(calls.filter((c) => c.name === "draw")).toEqual([]);
  });

  it("a WGSL compile error → onStall with the message", async () => {
    const onStall = vi.fn();
    const { engine } = await makeEngine({ compileErrors: { sim: "bad token" } }, { watchdog: { cpuMs: 50, gapMs: 1000, onStall } });
    expect(await engine.ready()).toBe(false);
    expect(String(onStall.mock.calls[0][0])).toMatch(/WGSL sim: 1:1 bad token/);
  });
});

describe("WebGPU engine: the ParticleEngine surface", () => {
  it("exposes every ParticleEngine method; setters are safe before the device exists", async () => {
    const { engine } = await makeEngine();
    for (const m of PARITY_METHODS) expect(typeof engine[m], m).toBe("function");
    expect(engine.backend).toBe("webgpu");
    // the journey layer calls these before (and while) the device resolves
    engine.setSoul("rose", 3);
    engine.setPalette({ low: [0.1, 0.2, 0.3], mid: [0.4, 0.5, 0.6], high: [0.7, 0.8, 0.9] });
    engine.setDensity(0.5);
    engine.setHue(0.4, 1.1);
    engine.setCurrents({ amount: 0.5, tension: 0.2, layering: 0.3 });
    engine.setBreath({ amount: 0.5, breath: 0.2, settle: 0.1 });
    engine.setGravity(new Float32Array(16), 1);
    engine.setBridge(0.5, 0.2, 0.1, 0.3);
    engine.setImageForm(0.5, 0.5);
    engine.impulse("scatter", 0.5);
    engine.regather();
    engine.enter();
    expect(engine.imageSampleCount()).toBe(4096);
    expect(engine.stats().programs.failed).toBe(0);
    expect(engine.scoreCompiled()).toBe(false);
    expect(engine.handsCompiled()).toBe(false);
    expect(engine.trailsCompiled()).toBe(false);
    await engine.ready();
    engine.dispose();
  });

  it("setCount rebuilds storage on the GPU (re-init, no JS particle loop)", async () => {
    const { engine, calls } = await makeEngine();
    await engine.ready();
    engine.prewarm();
    const before = calls.length;
    engine.setCount(250_000);
    expect(engine.isWarm()).toBe(false);
    engine.prewarm();
    expect(engine.isWarm()).toBe(true);
    const made = calls.slice(before).filter((c) => c.name === "createBuffer").map((c) => [c.args[0], c.args[1]]);
    expect(made).toEqual([["pos", 250_000 * 16], ["vel", 250_000 * 16], ["seed", 250_000 * 16], ["uv0", 250_000 * 8], ["uv1", 250_000 * 8]]);
    engine.dispose();
  });
});
