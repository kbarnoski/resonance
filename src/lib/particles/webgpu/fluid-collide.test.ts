/**
 * PHASE C (fluid) + D (depth collisions) — CPU mirrors and engine wiring.
 *   fluid: the pressure solve makes the field divergence-free; P2G conserves
 *          momentum; trilinear sampling is exact on linear fields; only the
 *          fluid souls take part (Snowflake's and Ghost's souls never do); the
 *          weight glides (never steps).
 *   collide: no push in front of the surface; a capped, eased push toward the
 *          camera behind it; into-surface velocity damped, never amplified;
 *          continuity as the weight → 0.
 *   engine: both are off by default (the show + the mastered cases unchanged);
 *          on, their passes run right after the simulation.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FLUID_LAWS, FLUID_SOULS, fluidWeightFor, glide, grid, cellOf, sample3, divergence, jacobi, project, p2g } from "./fluid";
import { buildFluidWGSL } from "./fluid-wgsl";
import { COLLIDE_LAWS, penetration, collideVelocity, coverRect, screenToStillUv, ndcToScreen, blurDepthField } from "./depth-collide";
import { buildCollideWGSL } from "./collide-wgsl";
import { fakeGpu } from "./fake-gpu.testkit";
import type { SoulId } from "../souls";

const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const norm = (a: Float32Array) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));

describe("phase C — the fluid (CPU mirror)", () => {
  it("the pressure solve removes most of the divergence (Jacobi ×N + project)", () => {
    const g = grid(12, 1.2);
    const r = rnd(3);
    let u: Float32Array = new Float32Array(12 ** 3 * 3).map(() => r() - 0.5);
    const d0 = norm(divergence(g, u));
    let p: Float32Array = new Float32Array(12 ** 3);
    const div = divergence(g, u);
    for (let k = 0; k < 120; k++) p = jacobi(g, p, div);
    u = project(g, u, p);
    expect(norm(divergence(g, u))).toBeLessThan(0.5 * d0);
  });

  it("P2G conserves momentum (fixed point, clamped at VMAX)", () => {
    const g = grid(8, 1);
    const r = rnd(5);
    const pos = Array.from({ length: 500 }, () => [r() * 1.8 - 0.9, r() * 1.8 - 0.9, r() * 1.8 - 0.9]);
    const vel = Array.from({ length: 500 }, () => [(r() - 0.5) * 3, (r() - 0.5) * 3, (r() - 0.5) * 3]);
    const acc = p2g(g, pos, vel);
    for (let k = 0; k < 3; k++) {
      let gridSum = 0, moteSum = 0;
      for (let c = 0; c < 8 ** 3; c++) gridSum += acc[c * 4 + k];
      vel.forEach((v) => (moteSum += Math.round(v[k] * FLUID_LAWS.SCALE)));
      expect(gridSum).toBe(moteSum);
    }
    let n = 0;
    for (let c = 0; c < 8 ** 3; c++) n += acc[c * 4 + 3];
    expect(n).toBe(500 * FLUID_LAWS.SCALE);
    expect(cellOf(g, [5, 0, 0])).toBe(-1);
  });

  it("trilinear sampling is exact on a linear field (interior)", () => {
    const g = grid(8, 1);
    const f = new Float32Array(8 ** 3 * 3);
    for (let z = 0; z < 8; z++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const c = ((z * 8 + y) * 8 + x) * 3, px = -1 + (x + 0.5) * g.cell;
      f[c] = 2 * px + 1; f[c + 1] = -px; f[c + 2] = 0.5;
    }
    const s = sample3(g, f, [0.13, 0.2, -0.3]);
    expect(s[0]).toBeCloseTo(2 * 0.13 + 1, 5);
    expect(s[1]).toBeCloseTo(-0.13, 5);
    expect(s[2]).toBeCloseTo(0.5, 5);
  });

  it("only the fluid souls flow — Snowflake's and Ghost's souls never do", () => {
    for (const s of ["murmuration", "spirit", "rings", "threads", "blossom", "vortex"] as SoulId[]) expect(fluidWeightFor(s)).toBe(0);
    expect(fluidWeightFor("smoke")).toBe(1);
    expect(fluidWeightFor("ink")).toBe(1);
    for (const w of Object.values(FLUID_SOULS)) expect(w).toBeGreaterThan(0);
  });

  it("the weight glides: a soul change fades the fluid in over seconds, never a step", () => {
    let w = 0;
    const dt = 1 / 60;
    const steps: number[] = [];
    for (let i = 0; i < 600; i++) { const n = glide(w, 1, dt, FLUID_LAWS.GLIDE_SEC); steps.push(n - w); w = n; }
    expect(Math.max(...steps)).toBeLessThan(0.01); // < 1 % per frame
    expect(w).toBeGreaterThan(0.95); // there after ~10 s
  });

  it("the GPU twin carries the CPU laws (even Jacobi count; momentum-only plume)", () => {
    expect(FLUID_LAWS.JACOBI % 2).toBe(0);
    const w = buildFluidWGSL();
    expect(w).toContain(`const SCALE = ${FLUID_LAWS.SCALE}.0;`);
    expect(w).toMatch(/u\.y \+= FU\.plume \* src \* FU\.dt;/);
    expect(w).not.toMatch(/\b(color|alpha|bright|lum)/i); // motion only
  });
});

describe("phase D — depth collisions (CPU mirror)", () => {
  const eye = [0, 0, 1];
  it("no push in front of the surface; a push behind it", () => {
    expect(penetration(3.2, 3, 0.3)).toBe(0); // mote nearer than the material
    expect(penetration(3, 3, 0.9)).toBeGreaterThan(0); // the material is nearer → inside
    const v0 = [0.2, 0.1, -0.3];
    expect(collideVelocity(v0, eye, 0, 1, 1 / 60)).toEqual(v0);
    const v1 = collideVelocity(v0, eye, 0.5, 1, 1 / 60);
    expect(v1[2]).toBeGreaterThan(v0[2]); // toward the camera
  });

  it("the push is capped (never a lunge) and eased by the weight", () => {
    const dt = 1 / 60;
    const big = collideVelocity([0, 0, 0], eye, 100, 1, dt);
    expect(big[2]).toBeLessThanOrEqual(COLLIDE_LAWS.MAX_ACC * dt + 1e-9);
    const half = collideVelocity([0, 0, 0], eye, 100, 0.5, dt);
    expect(half[2]).toBeCloseTo(big[2] * 0.5, 9);
    const tiny = collideVelocity([0.3, -0.2, -0.4], eye, 0.5, 1e-6, dt);
    expect(Math.hypot(tiny[0] - 0.3, tiny[1] + 0.2, tiny[2] + 0.4)).toBeLessThan(1e-4); // continuity at k → 0
  });

  it("into-surface velocity is damped, never amplified; tangential slides (friction)", () => {
    const dt = 1 / 60;
    const v = collideVelocity([0.5, 0, -1], eye, 1e-6, 1, dt);
    expect(v[2]).toBeGreaterThan(-1);
    expect(Math.abs(v[0])).toBeLessThan(0.5);
    expect(Math.abs(v[0])).toBeGreaterThan(0.49);
  });

  it("the occlusion branch's screen → still maths (shared surface)", () => {
    const r = coverRect(16 / 9, 16 / 9);
    expect(r).toEqual([0, 0, 1, 1]);
    const [sx, sy] = ndcToScreen(0, 0);
    expect(screenToStillUv(sx, sy, r)).toEqual([0.5, 0.5]);
    const b = blurDepthField([0, 0, 255, 0, 0], 5, 1, 1);
    expect(b[2]).toBeLessThan(255);
    expect(b.reduce((a, x) => a + x, 0)).toBeGreaterThan(200);
  });

  it("the GPU twin carries the CPU laws", () => {
    const w = buildCollideWGSL();
    expect(w).toContain(`const PUSH = ${COLLIDE_LAWS.PUSH.toFixed(4)};`);
    expect(w).toContain(`const MAX_ACC = ${COLLIDE_LAWS.MAX_ACC.toFixed(4)};`);
    expect(w).toContain("k *= CU.imgGate;"); // emblems never collide
    expect(w).not.toMatch(/\bpos\[i\]\s*=/); // velocity only, never a position jump
  });
});

// ── engine wiring ───────────────────────────────────────────────────────────
let rafQueue: Array<(t: number) => void> = [];
let now = 1000;
const step = (n = 1) => { for (let i = 0; i < n; i++) { now += 16.7; const q = rafQueue; rafQueue = []; for (const f of q) f(now); } };
beforeEach(() => {
  rafQueue = []; now = 1000;
  vi.unstubAllGlobals();
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => { rafQueue.push(f); return rafQueue.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("window", { devicePixelRatio: 1, location: { search: "" } });
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

async function port(opts: Record<string, unknown>) {
  const fk = fakeGpu();
  vi.stubGlobal("navigator", { gpu: fk.gpu });
  const { createPortedParticleEngine } = await import("./engine-port");
  const e = createPortedParticleEngine(fk.canvas as unknown as HTMLCanvasElement, { count: 4096, ...opts });
  expect(await e.ready()).toBe(true);
  for (let i = 0; i < 20 && !e.isWarm(); i++) e.warmBurst(80);
  return { e, calls: fk.calls };
}
const passes = (calls: { name: string; args: unknown[] }[]) => calls.filter((c) => c.name === "beginComputePass" || c.name === "beginRenderPass").map((c) => c.args[0]);

describe("phases C + D in the parity engine", () => {
  it("off by default: no fluid, no collide pass (the show and the mastered cases unchanged)", async () => {
    const { e, calls } = await port({ soul: "smoke" });
    e.start();
    step(30);
    const p = passes(calls);
    expect(p).not.toContain("fluid");
    expect(p).not.toContain("collide");
    e.dispose();
  });

  it("fluid on + a fluid soul: the fluid step runs after the sim (Jacobi ×N)", async () => {
    const { e, calls } = await port({ soul: "smoke", fluid: true });
    e.start();
    step(40);
    const p = passes(calls);
    const si = p.lastIndexOf("sim");
    expect(p.lastIndexOf("fluid")).toBe(si + 1);
    expect(calls.filter((c) => c.name === "compute.setPipeline" && c.args[0] === "fluid").length).toBeGreaterThan(FLUID_LAWS.JACOBI);
    expect(e.fluidState().weight).toBeGreaterThan(0);
    e.dispose();
  });

  it("fluid on + Ghost's soul: nothing flows (weight 0, no pass)", async () => {
    const { e, calls } = await port({ soul: "spirit", fluid: true });
    e.start();
    step(40);
    expect(passes(calls)).not.toContain("fluid");
    expect(e.fluidState().weight).toBe(0);
    e.dispose();
  });

  it("collide on + a depth slot: the collision pass runs; a shown map refuses to swap", async () => {
    const { e, calls } = await port({ soul: "murmuration", collide: true });
    e.start();
    step(2);
    const field = new Uint8Array(96 * 54).fill(128);
    expect(e.setDepthField(0, field, 96, 54, [0, 0, 1, 1], 1)).toBe(true);
    step(40);
    expect(passes(calls)).toContain("collide");
    expect(e.collideState().weights[0]).toBeGreaterThan(0.5);
    expect(e.setDepthField(0, field, 96, 54, [0, 0, 1, 1], 1)).toBe(false); // on screen: never swaps
    e.setDepthField(0, null, 0, 0, [0, 0, 1, 1], 0);
    step(300);
    expect(e.collideState().weights[0]).toBeLessThan(0.01);
    expect(e.setDepthField(0, field, 96, 54, [0, 0, 1, 1], 1)).toBe(true);
    e.dispose();
  });
});
