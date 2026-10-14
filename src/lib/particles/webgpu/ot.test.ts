/**
 * PHASE E — sliced optimal transport (CPU mirror of ot-wgsl.ts).
 *   · a translated form moves every mote by the translation (the shortest
 *     path: nothing crosses, nothing swaps);
 *   · the targets end up distributed like the image (moments match);
 *   · the transport costs far less than index pairing (the old contract /
 *     expand);
 *   · deterministic; the coverNdc inverse is exact;
 *   · the GPU twin carries the same constants; ?ot=1 only — off, the
 *     spatial pairing runs exactly as before (Snowflake / Ghost unchanged).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeGpu } from "./fake-gpu.testkit";
import { OT_LAWS, otRequested, sliceDir, coverNdc, uncoverNdc, slicedOT, transportCost } from "./ot";
import { buildOtWGSL } from "./ot-wgsl";

const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cloud = (n: number, f: (r: () => number) => [number, number], seed = 1) => {
  const r = rnd(seed), a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const [x, y] = f(r); a[i * 2] = x; a[i * 2 + 1] = y; }
  return a;
};
const moments = (a: Float32Array) => {
  const n = a.length >> 1;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += a[i * 2]; my += a[i * 2 + 1]; }
  mx /= n; my /= n;
  let vx = 0, vy = 0, cxy = 0;
  for (let i = 0; i < n; i++) { const dx = a[i * 2] - mx, dy = a[i * 2 + 1] - my; vx += dx * dx; vy += dy * dy; cxy += dx * dy; }
  return [mx, my, vx / n, vy / n, cxy / n];
};

describe("sliced optimal transport", () => {
  const N = 6000;
  const disk = (cx: number, cy: number, r0: number) => (r: () => number): [number, number] => { const a = r() * 6.2831853, r1 = r0 * Math.sqrt(r()); return [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]; };

  it("a translated form: every mote moves by the translation (shortest path, no crossing)", () => {
    const X = cloud(N, disk(-0.5, 0, 0.4), 1);
    const T = new Float32Array(X.length);
    for (let i = 0; i < N; i++) { T[i * 2] = X[i * 2] + 0.9; T[i * 2 + 1] = X[i * 2 + 1] - 0.2; }
    // shuffle the targets: the OT must recover the translation, not the index order
    const r = rnd(9);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); for (const k of [0, 1]) { const t = T[i * 2 + k]; T[i * 2 + k] = T[j * 2 + k]; T[j * 2 + k] = t; } }
    const Y = slicedOT(X, T);
    let worst = 0;
    for (let i = 0; i < N; i++) worst = Math.max(worst, Math.hypot(Y[i * 2] - X[i * 2] - 0.9, Y[i * 2 + 1] - X[i * 2 + 1] + 0.2));
    expect(worst).toBeLessThan(0.05);
  });

  it("the targets are distributed like the image (moments match)", () => {
    const X = cloud(N, (r) => [(r() - 0.5) * 3, (r() - 0.5) * 2], 2); // the scattered field
    const T = cloud(N, (r) => { const a = r() * 6.2831853, k = r() < 0.5 ? 1 : -1; return [Math.cos(a) * 0.8 + 0.2 * k, Math.sin(a) * 0.3 + 0.3 * k * Math.cos(a)]; }, 3); // a ring-ish emblem
    const Y = slicedOT(X, T);
    const a = moments(Y), b = moments(T);
    for (let k = 0; k < 5; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.03);
  });

  it("costs far less than index pairing (the old contract / expand)", () => {
    const X = cloud(N, disk(0.3, 0.1, 1.0), 4);
    const T = cloud(N, (r) => { const a = r() * 6.2831853; return [Math.cos(a) * 0.7, Math.sin(a) * 0.7]; }, 5); // a circle
    const Y = slicedOT(X, T);
    expect(transportCost(X, Y)).toBeLessThan(0.35 * transportCost(X, T));
  });

  it("deterministic", () => {
    const X = cloud(2000, disk(0, 0, 1), 6), T = cloud(2000, disk(0.2, 0, 0.5), 7);
    expect(slicedOT(X, T)).toEqual(slicedOT(X, T));
  });

  it("coverNdc inverts exactly (both aspect cases)", () => {
    for (const [ia, sa] of [[1, 16 / 9], [2.4, 16 / 9]]) {
      const [x, y] = coverNdc(0.31, 0.77, ia, sa);
      const [u, v] = uncoverNdc(x, y, ia, sa);
      expect(u).toBeCloseTo(0.31, 9);
      expect(v).toBeCloseTo(0.77, 9);
    }
  });

  it("directions are spread; off unless ?ot=1", () => {
    const d = Array.from({ length: OT_LAWS.SLICES }, (_, k) => sliceDir(k));
    for (const v of d) expect(Math.hypot(v[0], v[1])).toBeCloseTo(1, 9);
    expect(otRequested("")).toBe(false);
    expect(otRequested("?ot=1")).toBe(true);
    expect(OT_LAWS.SLICES % OT_LAWS.SLICES_PER_FRAME).toBe(0);
  });

  it("the GPU twin carries the same constants", () => {
    const w = buildOtWGSL();
    expect(w).toContain(`const BINS = ${OT_LAWS.BINS}u;`);
    expect(w).toContain(`const RANGE = ${OT_LAWS.RANGE.toFixed(1)};`);
    expect(w).toContain("2.399963229728653");
  });
});

// ── wired into the parity engine ────────────────────────────────────────────
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

describe("optimal transport in the parity engine (?ot=1)", () => {
  async function run(ot: boolean) {
    const fk = fakeGpu();
    vi.stubGlobal("navigator", { gpu: fk.gpu });
    const { createPortedParticleEngine } = await import("./engine-port");
    const e = createPortedParticleEngine(fk.canvas as unknown as HTMLCanvasElement, { count: 4096, soul: "spirit", ot });
    expect(await e.ready()).toBe(true);
    for (let i = 0; i < 20 && !e.isWarm(); i++) e.warmBurst(80);
    e.start();
    step(2);
    const n = e.imageSampleCount();
    const uv = new Float32Array(n * 2).map((_, i) => ((i * 7919) % 1000) / 1000);
    const { pairOrder, PAIR_GROUPS } = await import("../spatial-pairing");
    const before = fk.calls.length;
    e.loadFormImage({ width: 64, height: 64 } as HTMLCanvasElement, 1, uv, true, pairOrder(uv, PAIR_GROUPS));
    e.setImageForm(1, 1);
    step(8);
    return { e, f: fk.calls.slice(before) };
  }
  const passes = (f: { name: string; args: unknown[] }[]) => f.filter((c) => c.name === "beginComputePass").map((c) => c.args[0]);

  it("on: the transport job replaces the pairing passes, spread over SLICES / SLICES_PER_FRAME frames, each before the sim", async () => {
    const { e, f } = await run(true);
    const p = passes(f);
    expect(p).not.toContain("pairing");
    expect(p.filter((x) => x === "ot").length).toBe(OT_LAWS.SLICES / OT_LAWS.SLICES_PER_FRAME);
    expect(p[p.indexOf("ot") + 1]).toBe("sim");
    expect(e.otState().running).toBe(false); // done
    expect(f.filter((c) => c.name === "compute.setPipeline" && c.args[0] === "ot").length)
      .toBe(1 + OT_LAWS.SLICES * 4 + OT_LAWS.SLICES / OT_LAWS.SLICES_PER_FRAME);
    e.dispose();
  });

  it("off (the default — Snowflake / Ghost unchanged): spatial pairing as before", async () => {
    const { e, f } = await run(false);
    const p = passes(f);
    expect(p).toContain("pairing");
    expect(p).not.toContain("ot");
    e.dispose();
  });
});
