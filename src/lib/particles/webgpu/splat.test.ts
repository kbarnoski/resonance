/**
 * PHASE B — the tile-binned fixed-point splat.
 *   · the per-pixel value mirrors the show's fragment program (DRAW_FS) —
 *     held to its text, so a change there fails here;
 *   · the pixel set is GL point rasterisation (pixel centres in the square);
 *   · the algorithm (classify → scan → scatter → per-tile integer sums), run as
 *     a CPU mirror, conserves every mote's light and is ORDER-FREE: shuffling
 *     the motes gives a bit-identical frame (no blend-order shimmer);
 *   · wired into the parity engine behind ?splat=1, with the temporal resolve.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DRAW_FS, withStable, withTrails } from "../shaders";
import { buildSplatWGSL, pointPixels, tileGrid, TILE, SPLAT_SCALE, SPLAT_MAX_PX, SPLAT_MAX_TILES } from "./splat-wgsl";
import { splatRequested as splatRequestedForTest } from "./engine-port";
import { fakeGpu } from "./fake-gpu.testkit";

describe("the splat mirrors the show's fragment program", () => {
  const fs = withStable(withTrails(DRAW_FS)).replace(/\s+/g, " ");
  const wgsl = buildSplatWGSL().replace(/\s+/g, " ");
  const pairs: [string, string][] = [
    ["float g = exp(-r2 * 7.0) + 0.3 * exp(-r2 * 1.8);", "var g = exp(-r2 * 7.0) + 0.3 * exp(-r2 * 1.8);"],
    ["float bokeh = (1.0 - smoothstep(0.15, 1.0, r2)) * 0.62 + 0.12 * exp(-r2 * 2.0);", "let bokeh = (1.0 - smoothstep(0.15, 1.0, r2)) * 0.62 + 0.12 * exp(-r2 * 2.0);"],
    ["g = mix(g, bokeh, vCoc);", "g = mix(g, bokeh, coc);"],
    ["o = vec4(vCol * g * 1.15, 1.0);", "return r1.rgb * g * 1.15;"],
    ["if (r2 > 1.0) discard;", "if (r2 > 1.0) { return vec3f(0.0); }"],
    ["if (q2 >= vStB.z) discard;", "if (q2 >= B.z) { return vec3f(0.0); }"],
    ["float gs = vStA.x * max(exp(-q2 * vStA.z) - vStB.x, 0.0) + vStA.y * max(exp(-q2 * vStA.w) - vStB.y, 0.0);", "var gs = A.x * max(exp(-q2 * A.z) - B.x, 0.0) + A.y * max(exp(-q2 * A.w) - B.y, 0.0);"],
    ["float rb = q2 * vStB.w;", "let rb = q2 * B.w;"],
    ["o = vec4(vCol * gs * 1.15, 1.0);", "return r1.rgb * gs * 1.15;"],
  ];
  for (const [glsl, mirror] of pairs) {
    it(`DRAW_FS: ${glsl.slice(0, 48)}…`, () => {
      expect(fs, "DRAW_FS changed — update splat-wgsl.ts shade() to match").toContain(glsl);
      expect(wgsl).toContain(mirror);
    });
  }
});

describe("pixel sets and tiles", () => {
  it("pointPixels = the pixel centres inside the GL point square", () => {
    for (const [cx, cy, s] of [[10.2, 20.7, 3], [5.5, 5.5, 1], [0.3, 0.9, 2.6], [100.49, 7.01, 6]]) {
      const [x0, y0, x1, y1] = pointPixels(cx, cy, s);
      for (let y = y0 - 2; y <= y1 + 2; y++)
        for (let x = x0 - 2; x <= x1 + 2; x++) {
          const inside = Math.abs(x + 0.5 - cx) <= s / 2 && Math.abs(y + 0.5 - cy) <= s / 2;
          const listed = x >= x0 && x <= x1 && y >= y0 && y <= y1;
          expect(listed, `${cx},${cy},${s} @ ${x},${y}`).toBe(inside);
        }
    }
  });

  it("a small mote touches at most SPLAT_MAX_TILES tiles", () => {
    expect(SPLAT_MAX_PX).toBeLessThanOrEqual(TILE);
    for (let k = 0; k < 500; k++) {
      const cx = Math.random() * 300, cy = Math.random() * 200, s = Math.random() * SPLAT_MAX_PX;
      const [x0, y0, x1, y1] = pointPixels(cx, cy, s);
      if (x0 > x1 || y0 > y1) continue;
      const tiles = (Math.floor(x1 / TILE) - Math.floor(x0 / TILE) + 1) * (Math.floor(y1 / TILE) - Math.floor(y0 / TILE) + 1);
      expect(tiles).toBeLessThanOrEqual(SPLAT_MAX_TILES);
    }
  });

  it("tile grid covers the kiosk target (and fits one dispatch)", () => {
    const g = tileGrid(1512, 982);
    expect(g.tilesX * TILE).toBeGreaterThanOrEqual(1512);
    expect(g.tilesY * TILE).toBeGreaterThanOrEqual(982);
    const big = tileGrid(3024, 1964);
    expect(big.tilesX).toBeLessThanOrEqual(65535);
  });
});

// ── CPU mirror of the GPU algorithm (the plain sprite) ──────────────────────
interface Mote { cx: number; cy: number; s: number; col: [number, number, number] }
function shade(m: Mote, fx: number, fy: number): [number, number, number] {
  const dx = ((fx - m.cx) * 2) / m.s, dy = ((m.cy - fy) * 2) / m.s;
  const r2 = dx * dx + dy * dy;
  if (r2 > 1) return [0, 0, 0];
  const g = Math.exp(-r2 * 7) + 0.3 * Math.exp(-r2 * 1.8);
  return [m.col[0] * g * 1.15, m.col[1] * g * 1.15, m.col[2] * g * 1.15];
}
function splatCPU(motes: Mote[], W: number, H: number): Uint32Array {
  const { tilesX, tiles } = tileGrid(W, H);
  const count = new Uint32Array(tiles), offs = new Uint32Array(tiles), fill = new Uint32Array(tiles);
  const range = (m: Mote) => { const [x0, y0, x1, y1] = pointPixels(m.cx, m.cy, m.s); return [Math.max(0, x0), Math.max(0, y0), Math.min(W - 1, x1), Math.min(H - 1, y1)]; };
  const each = (m: Mote, f: (t: number) => void) => {
    const [x0, y0, x1, y1] = range(m);
    if (x0 > x1 || y0 > y1) return;
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) f(ty * tilesX + tx);
  };
  motes.forEach((m) => each(m, (t) => count[t]++));
  for (let t = 1; t < tiles; t++) offs[t] = offs[t - 1] + count[t - 1];
  const list = new Uint32Array(motes.length * SPLAT_MAX_TILES);
  motes.forEach((m, i) => each(m, (t) => { list[offs[t] + fill[t]++] = i; }));
  const out = new Uint32Array(W * H * 3);
  for (let t = 0; t < tiles; t++) {
    const tx0 = (t % tilesX) * TILE, ty0 = Math.floor(t / tilesX) * TILE;
    for (let k = 0; k < count[t]; k++) {
      const m = motes[list[offs[t] + k]];
      const [x0, y0, x1, y1] = range(m);
      for (let y = Math.max(y0, ty0); y <= Math.min(y1, ty0 + TILE - 1); y++)
        for (let x = Math.max(x0, tx0); x <= Math.min(x1, tx0 + TILE - 1); x++) {
          const c = shade(m, x + 0.5, y + 0.5);
          for (let ch = 0; ch < 3; ch++) out[(y * W + x) * 3 + ch] += Math.floor(Math.max(0, c[ch]) * SPLAT_SCALE + 0.5);
        }
    }
  }
  return out;
}

describe("the splat algorithm (CPU mirror)", () => {
  const W = 97, H = 61; // not tile multiples: edge tiles are partial
  const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const r = rnd(7);
  const motes: Mote[] = Array.from({ length: 4000 }, () => ({ cx: r() * W, cy: r() * H, s: 0.5 + r() * (SPLAT_MAX_PX - 0.5), col: [r() * 0.05, r() * 0.05, r() * 0.05] }));

  it("every mote's light lands exactly once (equals a direct per-mote raster)", () => {
    const out = splatCPU(motes, W, H);
    const ref = new Uint32Array(W * H * 3);
    for (const m of motes) {
      const [x0, y0, x1, y1] = pointPixels(m.cx, m.cy, m.s);
      for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
        for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
          const c = shade(m, x + 0.5, y + 0.5);
          for (let ch = 0; ch < 3; ch++) ref[(y * W + x) * 3 + ch] += Math.floor(Math.max(0, c[ch]) * SPLAT_SCALE + 0.5);
        }
    }
    expect(out).toEqual(ref);
  });

  it("ORDER-FREE: shuffled motes give a bit-identical frame (no blend-order shimmer)", () => {
    const a = splatCPU(motes, W, H);
    const sh = [...motes];
    const r2 = rnd(99);
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(r2() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    expect(splatCPU(sh, W, H)).toEqual(a);
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

describe("the splat path in the parity engine (?splat=1)", () => {
  it("on by default; ?splat=0 turns it off", () => {
    expect(splatRequestedForTest("")).toBe(true);
    expect(splatRequestedForTest("?splat=0")).toBe(false);
  });

  it("a frame: sim → motes → splat (clear, classify, scan, scatter, tile) → hdr (fade, splat layer, large motes indirect) → taa → govern → composite", async () => {
    const fk = fakeGpu();
    vi.stubGlobal("navigator", { gpu: fk.gpu });
    const { createPortedParticleEngine } = await import("./engine-port");
    const e = createPortedParticleEngine(fk.canvas as unknown as HTMLCanvasElement, { count: 4096, soul: "rings", splat: true });
    expect(await e.ready()).toBe(true);
    expect(e.splatting()).toBe(true);
    for (let i = 0; i < 20 && !e.isWarm(); i++) e.warmBurst(80);
    const before = fk.calls.length;
    e.start();
    step(3);
    const f = fk.calls.slice(before);
    const passes = f.filter((c) => c.name === "beginComputePass" || c.name === "beginRenderPass").map((c) => c.args[0]);
    const one = passes.slice(passes.indexOf("sim"), passes.indexOf("composite") + 1);
    expect(one).toEqual(["sim", "motes", "splat", "hdr", "taa", "govern", "composite"]);
    expect(f.filter((c) => c.name === "compute.setPipeline" && c.args[0] === "splat").length).toBeGreaterThanOrEqual(5);
    expect(f.some((c) => c.name === "drawIndirect" && c.args[1] === "splat-args")).toBe(true);
    expect(f.filter((c) => c.name.startsWith("missing:"))).toEqual([]);
    e.dispose();
  });
});
