/**
 * Kiosk-hang regression guard (2026-10-05: particle v3 froze real kiosk
 * Chrome at Snowflake's first emergence — synchronous getBufferSubData
 * read-backs measured 20–236 ms, a synchronous link of one giant shader, a
 * new WebGL context per journey). These tests drive the engine against a
 * recording fake WebGL2 context and prove:
 *   1. activation (prepare → prewarm → start → frames) makes NO synchronous
 *      GPU read-back or status call, and never asks LINK_STATUS before the
 *      driver reported COMPLETION_STATUS_KHR;
 *   2. nothing draws on screen until its programs are warm;
 *   3. the session shares ONE engine / ONE WebGL context across journeys;
 *   4. the watchdog turns particles off for the session on a long frame gap.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const COMPLETION_STATUS_KHR = 0x91b1;
const LINK_STATUS = 0x8b82;
const FORBIDDEN = ["readPixels", "getBufferSubData", "getError", "finish", "checkFramebufferStatus", "clientWaitSync", "getSyncParameter", "getShaderParameter"];

interface Call { name: string; args: unknown[] }

function fakeGL(opts: { compilePolls?: number } = {}) {
  const calls: Call[] = [];
  const completion = new Map<object, number>(); // program → polls remaining
  const linkAskedBeforeDone: object[] = [];
  let id = 1;
  const consts = new Map<string, number>([["LINK_STATUS", LINK_STATUS]]);
  const gl: Record<string, unknown> = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "canvas") return undefined;
      if (/^[A-Z0-9_]+$/.test(prop)) {
        if (!consts.has(prop)) consts.set(prop, 0x1000 + consts.size);
        return consts.get(prop);
      }
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        switch (prop) {
          case "getExtension":
            if (args[0] === "KHR_parallel_shader_compile") return { COMPLETION_STATUS_KHR };
            return {};
          case "createProgram": {
            const p = { id: id++ };
            completion.set(p, opts.compilePolls ?? 2);
            return p;
          }
          case "getProgramParameter": {
            const [p, pname] = args as [object, number];
            if (pname === COMPLETION_STATUS_KHR) {
              const left = completion.get(p) ?? 0;
              completion.set(p, Math.max(0, left - 1));
              return left <= 0;
            }
            if (pname === LINK_STATUS) {
              if ((completion.get(p) ?? 0) > 0) linkAskedBeforeDone.push(p);
              return true;
            }
            return 0; // ACTIVE_UNIFORMS
          }
          case "isContextLost":
            return false;
          default:
            if (prop.startsWith("create")) return { id: id++ };
            return undefined;
        }
      };
    },
  });
  return { gl, calls, linkAskedBeforeDone };
}

function fakeCanvas(gl: unknown) {
  const listeners: Record<string, (e: Event) => void> = {};
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    getContextCalls: 0,
    getContext(kind: string) {
      if (kind === "webgl2") canvas.getContextCalls++;
      return gl;
    },
    getBoundingClientRect: () => ({ width: 800, height: 500 }),
    addEventListener: (k: string, f: (e: Event) => void) => { listeners[k] = f; },
    removeEventListener: () => {},
    setAttribute: () => {},
    listeners,
  };
  return canvas;
}

// manual rAF clock
let rafQueue: Array<(t: number) => void> = [];
let now = 0;
function step(ms = 16.7, n = 1) {
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
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => { rafQueue.push(f); return rafQueue.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("window", { devicePixelRatio: 2, location: { search: "" } });
  vi.stubGlobal("document", { visibilityState: "visible", createElement: () => fakeCanvas(fakeGL().gl) });
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

describe("particle activation never blocks the main thread", () => {
  it("prepare → prewarm → start → frames: no synchronous GPU read-back or status call", async () => {
    const { createParticleEngine } = await import("./particle-engine");
    const { gl, calls, linkAskedBeforeDone } = fakeGL({ compilePolls: 3 });
    const canvas = fakeCanvas(gl);
    const engine = createParticleEngine(canvas as unknown as HTMLCanvasElement, { count: 4096, soul: "rings", transparent: true });
    engine.prepare(["rings", "geometry", "orbitals"]);
    for (let i = 0; i < 80 && !engine.isWarm(); i++) { now += 400; engine.prewarm(); }
    expect(engine.isWarm()).toBe(true);
    engine.start();
    step(16.7, 30);
    engine.setSoul("geometry", 8);
    step(16.7, 30);

    const bad = calls.filter((c) => FORBIDDEN.includes(c.name));
    expect(bad.map((c) => c.name)).toEqual([]);
    expect(linkAskedBeforeDone).toEqual([]); // LINK_STATUS only after COMPLETION_STATUS_KHR
    expect(calls.filter((c) => c.name === "drawArrays").length).toBeGreaterThan(30);
    engine.dispose();
  });

  it("RESONANCE TRAILS: compiled in only when on, no new context, no synchronous GPU call", async () => {
    const { createParticleEngine } = await import("./particle-engine");
    const { gl, calls } = fakeGL({ compilePolls: 2 });
    const engine = createParticleEngine(fakeCanvas(gl) as unknown as HTMLCanvasElement, { count: 4096, soul: "rings", trails: true });
    expect(engine.trailsCompiled()).toBe(true);
    engine.prepare(["rings"]);
    for (let i = 0; i < 80 && !engine.isWarm(); i++) { now += 400; engine.prewarm(); }
    engine.start();
    engine.setTrails(1);
    step(16.7, 60);
    expect(engine.trailsShown()).toBeGreaterThan(0.5);
    engine.setImageForm(1, 1); // an image form takes the stage: the tails glide away
    step(16.7, 400);
    expect(engine.trailsShown()).toBeLessThan(0.05);
    engine.setTrails(null, true);
    expect(engine.trailsShown()).toBe(0);
    const srcs = calls.filter((c) => c.name === "shaderSource").map((c) => String(c.args[1]));
    expect(srcs.filter((s) => s.includes("#define TRAILS")).length).toBe(2);
    expect(calls.filter((c) => FORBIDDEN.includes(c.name)).map((c) => c.name)).toEqual([]);
    engine.dispose();
    // off: the draw source is the show build's
    const off = fakeGL({ compilePolls: 1 });
    const e2 = createParticleEngine(fakeCanvas(off.gl) as unknown as HTMLCanvasElement, { count: 4096, soul: "rings", trails: false });
    expect(e2.trailsCompiled()).toBe(false);
    expect(off.calls.filter((c) => c.name === "shaderSource").some((c) => String(c.args[1]).includes("TRAILS 1"))).toBe(false);
    e2.dispose();
  });

  it("THE BRIDGE: still colours upload as plain bytes, glide, and a worn slot never swaps", async () => {
    const { createParticleEngine } = await import("./particle-engine");
    const { gl, calls } = fakeGL({ compilePolls: 0 });
    const engine = createParticleEngine(fakeCanvas(gl) as unknown as HTMLCanvasElement, { count: 4096, soul: "rings" });
    engine.prepare(["rings"]);
    for (let i = 0; i < 80 && !engine.isWarm(); i++) { now += 400; engine.prewarm(); }
    engine.start();
    const px = new Uint8Array(64 * 36 * 4).fill(128);
    expect(engine.loadBridgeStill(0, px, 64, 36, 16 / 9)).toBe(true);
    expect(engine.loadBridgeStill(1, px, 64, 36, 16 / 9)).toBe(true);
    engine.setBridge(1, 0, 0, 0.2);
    step(16.7, 3);
    const p3 = engine.bridgeState().presence;
    expect(p3).toBeGreaterThan(0);
    expect(p3).toBeLessThan(0.1); // glides (~1 s), never a step
    // outgoing is worn → refused; incoming not mixed in yet → still accepted
    expect(engine.loadBridgeStill(0, px, 64, 36, 16 / 9)).toBe(false);
    expect(engine.loadBridgeStill(1, px, 64, 36, 16 / 9)).toBe(true);
    engine.setBridge(1, 1, 0.5, 0.2);
    step(16.7, 120);
    expect(engine.loadBridgeStill(1, px, 64, 36, 16 / 9)).toBe(false);
    engine.setBridge(0, 1, 0, 0.2);
    step(16.7, 600);
    expect(engine.bridgeState().presence).toBe(0);
    expect(engine.loadBridgeStill(0, px, 64, 36, 16 / 9)).toBe(true);
    expect(calls.filter((c) => FORBIDDEN.includes(c.name)).map((c) => c.name)).toEqual([]);
    engine.dispose();
  });

  it("warm draws are throttled: one GPU pipeline build per 350 ms at most", async () => {
    const { createParticleEngine } = await import("./particle-engine");
    const { gl } = fakeGL({ compilePolls: 0 });
    const engine = createParticleEngine(fakeCanvas(gl) as unknown as HTMLCanvasElement, { count: 4096, soul: "rings" });
    for (let i = 0; i < 50; i++) engine.prewarm(); // no time passes
    expect(engine.stats().warmLog.length).toBeLessThanOrEqual(1);
    engine.dispose();
  });

  it("draws nothing on screen until its programs are compiled and warm", async () => {
    const { createParticleEngine } = await import("./particle-engine");
    const { gl, calls } = fakeGL({ compilePolls: 1000 }); // compiles never finish
    const canvas = fakeCanvas(gl);
    const engine = createParticleEngine(canvas as unknown as HTMLCanvasElement, { count: 4096, soul: "rings" });
    engine.start();
    step(16.7, 20);
    expect(calls.filter((c) => c.name === "drawArrays").length).toBe(0);
    expect(calls.filter((c) => FORBIDDEN.includes(c.name)).length).toBe(0);
    engine.dispose();
  });

  it("the probe (dream lab only) is the only read-back path", async () => {
    const { createParticleEngine } = await import("./particle-engine");
    const { gl, calls } = fakeGL({ compilePolls: 0 });
    const engine = createParticleEngine(fakeCanvas(gl) as unknown as HTMLCanvasElement, { count: 4096, soul: "rings", probe: true });
    for (let i = 0; i < 40; i++) { now += 400; engine.prewarm(); }
    engine.start();
    step(16.7, 40);
    expect(calls.some((c) => c.name === "readPixels")).toBe(true);
    engine.dispose();
  });
});

describe("one engine / one WebGL context per session + watchdog", () => {
  it("every journey mount reuses the same engine and context", async () => {
    const mod = await import("./shared-engine");
    mod.__resetSharedParticleEngineForTest();
    const a = mod.acquireSharedParticleEngine({ count: 4096, dpr: 1.5, trailScale: 1 });
    const b = mod.acquireSharedParticleEngine({ count: 4096, dpr: 1.5, trailScale: 1 });
    expect(a).toBeTruthy();
    expect(b).toBe(a);
    expect(mod.sharedEnginesCreated).toBe(1);
    expect((a!.canvas as unknown as { getContextCalls: number }).getContextCalls).toBe(1);
  });

  const warmStart = async () => {
    const mod = await import("./shared-engine");
    mod.__resetSharedParticleEngineForTest();
    const sh = mod.acquireSharedParticleEngine({ count: 4096, dpr: 1.5, trailScale: 1 })!;
    sh.engine.prepare(["rings"]);
    for (let i = 0; i < 80 && !sh.engine.isWarm(); i++) { now += 400; sh.engine.prewarm(); }
    sh.engine.start();
    step(16.7, 10);
    return mod;
  };

  it("ONE ordinary hitch (still decode, ~0.8 s) does NOT switch particles off (kiosk 2026-10-06)", async () => {
    const mod = await warmStart();
    step(850, 1);
    step(16.7, 10);
    expect(mod.particlesDisabledReason()).toBeNull();
  });

  it("repeated severe gaps (3 × >1 s in a minute) disable them for the session", async () => {
    const mod = await warmStart();
    let notified = false;
    mod.onParticlesDisabled(() => { notified = true; });
    for (let k = 0; k < 3; k++) { step(1200, 1); step(16.7, 10); }
    expect(mod.particlesDisabledReason()).toMatch(/watchdog: frame gap/);
    expect(notified).toBe(true);
    expect(mod.acquireSharedParticleEngine({ count: 4096, dpr: 1.5, trailScale: 1 })).toBeNull();
  });

  it("a single very long gap (>4 s) disables them at once", async () => {
    const mod = await warmStart();
    step(4500, 1);
    expect(mod.particlesDisabledReason()).toMatch(/watchdog: frame gap/);
  });

  it("context loss disables particles for the session", async () => {
    const mod = await import("./shared-engine");
    mod.__resetSharedParticleEngineForTest();
    const sh = mod.acquireSharedParticleEngine({ count: 4096, dpr: 1.5, trailScale: 1 })!;
    const c = sh.canvas as unknown as { listeners: Record<string, (e: Event) => void> };
    c.listeners.webglcontextlost({ preventDefault() {} } as Event);
    expect(mod.particlesDisabledReason()).toBe("webgl context lost");
  });
});
