/**
 * LIGHT GRAVITY — the laws (light-gravity.ts) and the shader block.
 */
import { describe, it, expect } from "vitest";
import {
  gravityEnabled, gravityStrengthFor, lumaGrid, extractAttractors, stillToScreen, lightsOfStill,
  createGravityGlide, retargetGravity, sampleGravity, gravityActive, packGravity, describeGravity,
  GRAVITY_DEFAULT, GRAVITY_LAWS, GRAVITY_SESSION_KEY, GRAVITY_JOURNEY_STRENGTH,
  type GravityPoint,
} from "./light-gravity";
import { SIM_FS, DRAW_VS, DRAW_FS, COMP_FS } from "./shaders";

const L = GRAVITY_LAWS;

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

/** A 64 × 36 RGBA field (rows bottom-up), base grey + gaussian suns at uv (x, y up). */
function still(base: number, suns: { x: number; y: number; r: number; v: number }[] = [], w = 64, h = 36): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  const a = w / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h;
    let l = base;
    for (const s of suns) l = Math.max(l, base + (s.v - base) * Math.exp(-(((u - s.x) * a) ** 2 + (v - s.y) ** 2) / (2 * s.r * s.r)));
    const k = (y * w + x) * 4, b = Math.round(Math.min(1, l) * 255);
    px[k] = b; px[k + 1] = b; px[k + 2] = b; px[k + 3] = 255;
  }
  return px;
}
const grid = (px: Uint8Array) => lumaGrid(px, 64, 36, L.GRID_W, L.GRID_H);

describe("light gravity — flag", () => {
  it("is on by default (Karel kept it); ?gravity=1 / 0 are remembered in sessionStorage", () => {
    expect(GRAVITY_DEFAULT).toBe(true);
    const st = memStore();
    expect(gravityEnabled("", st)).toBe(true);
    expect(gravityEnabled("?gravity=1", st)).toBe(true);
    expect(st.getItem(GRAVITY_SESSION_KEY)).toBe("1");
    expect(gravityEnabled("", st)).toBe(true);
    expect(gravityEnabled("?gravity=0", st)).toBe(false);
    expect(gravityEnabled("", st)).toBe(false);
    expect(gravityEnabled("?gravity=1", null)).toBe(true);
  });
  it("runs on every journey — Snowflake and Ghost included — with a per-journey strength (default 1)", () => {
    expect(gravityStrengthFor("first-snow")).toBe(1);
    expect(gravityStrengthFor("ghost")).toBe(1);
    expect(gravityStrengthFor("any-journey")).toBe(1);
    for (const k of Object.values(GRAVITY_JOURNEY_STRENGTH)) expect(k).toBeGreaterThan(0);
  });
});

describe("light gravity — the lights of a picture", () => {
  it("the light map is luma 0..1, rows bottom-up like the input", () => {
    const g = grid(still(0.1, [{ x: 0.5, y: 0.85, r: 0.05, v: 1 }]));
    expect(g.length).toBe(L.GRID_W * L.GRID_H);
    let m = 0;
    for (let i = 1; i < g.length; i++) if (g[i] > g[m]) m = i;
    expect(Math.floor(m / L.GRID_W)).toBeGreaterThan(L.GRID_H * 0.7); // the top row is the last row
    for (const v of g) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
  it("a dark picture or an evenly lit one has no light to gather around", () => {
    expect(extractAttractors(grid(still(0.08)), L.GRID_W, L.GRID_H)).toEqual([]);
    expect(extractAttractors(grid(still(0.2, [{ x: 0.5, y: 0.5, r: 0.1, v: 0.35 }])), L.GRID_W, L.GRID_H)).toEqual([]);
    expect(extractAttractors(grid(still(0.8)), L.GRID_W, L.GRID_H)).toEqual([]);
  });
  it("one sun → one light, right where it is, with a soft radius", () => {
    const a = extractAttractors(grid(still(0.1, [{ x: 0.72, y: 0.68, r: 0.06, v: 1 }])), L.GRID_W, L.GRID_H, 16 / 9);
    expect(a.length).toBe(1);
    expect(a[0].x).toBeCloseTo(0.72, 1);
    expect(a[0].y).toBeCloseTo(0.68, 1);
    expect(a[0].r).toBeGreaterThanOrEqual(L.MIN_RADIUS);
    expect(a[0].r).toBeLessThanOrEqual(L.MAX_RADIUS);
    expect(a[0].w).toBeGreaterThan(0.8);
  });
  it("two suns → two lights, the stronger first; a faint glow is dropped", () => {
    const a = extractAttractors(grid(still(0.08, [
      { x: 0.2, y: 0.3, r: 0.07, v: 1 },
      { x: 0.8, y: 0.7, r: 0.04, v: 0.85 },
      { x: 0.5, y: 0.9, r: 0.02, v: 0.62 }, // a faint glow
    ])), L.GRID_W, L.GRID_H);
    expect(a.length).toBe(2);
    expect(a[0].x).toBeCloseTo(0.2, 1);
    expect(a[1].x).toBeCloseTo(0.8, 1);
    expect(a[0].w).toBeGreaterThanOrEqual(a[1].w);
  });
  it("a glowing horizon → several lights along it (never more than the cap), well apart", () => {
    const suns = Array.from({ length: 12 }, (_, i) => ({ x: (i + 0.5) / 12, y: 0.42, r: 0.05, v: 0.95 }));
    const a = extractAttractors(grid(still(0.1, suns)), L.GRID_W, L.GRID_H);
    expect(a.length).toBeGreaterThan(1);
    expect(a.length).toBeLessThanOrEqual(L.MAX_ATTRACTORS);
    for (const p of a) expect(p.y).toBeCloseTo(0.42, 1);
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      expect(Math.hypot((a[i].x - a[j].x) * 16 / 9, a[i].y - a[j].y)).toBeGreaterThan(L.REACH * 0.9);
    }
  });
  it("the cover crop maps the still onto the screen like the image layer", () => {
    const c = stillToScreen({ x: 0.5, y: 0.5, r: 0.1, w: 1 }, 16 / 9, 16 / 9);
    expect(c.x).toBeCloseTo(0); expect(c.y).toBeCloseTo(0); expect(c.r).toBeCloseTo(0.2);
    // a wide still on a 16:9 screen: the sides overflow
    expect(stillToScreen({ x: 0.75, y: 0.75, r: 0.1, w: 1 }, 2.4, 16 / 9).x).toBeCloseTo(0.5 * 2.4 / (16 / 9), 2);
    // a 16:9 still on a portrait screen: the sides overflow too
    expect(stillToScreen({ x: 1, y: 0.5, r: 0.1, w: 1 }, 16 / 9, 0.5).x).toBeGreaterThan(1);
    // a square still on 16:9: top and bottom cropped, radius grows with the image
    const sq = stillToScreen({ x: 0.5, y: 0.75, r: 0.1, w: 1 }, 1, 16 / 9);
    expect(sq.y).toBeCloseTo(0.5 * 16 / 9, 2);
    expect(sq.r).toBeCloseTo(0.2 * 16 / 9, 2);
    const pts = lightsOfStill(still(0.1, [{ x: 0.25, y: 0.75, r: 0.05, v: 1 }]), 64, 36, 16 / 9, 16 / 9);
    expect(pts.length).toBe(1);
    expect(pts[0].x).toBeCloseTo(-0.5, 1);
    expect(pts[0].y).toBeCloseTo(0.5, 1);
  });
  it("output is motion only — no luminance / colour / alpha field", () => {
    const pts = lightsOfStill(still(0.1, [{ x: 0.3, y: 0.6, r: 0.05, v: 1 }]), 64, 36, 16 / 9, 16 / 9);
    for (const p of pts) expect(Object.keys(p).sort()).toEqual(["r", "w", "x", "y"]);
  });
});

describe("light gravity — the glide", () => {
  const sun: GravityPoint = { x: 0.5, y: 0.4, r: 0.2, w: 1 };
  const moon: GravityPoint = { x: -0.6, y: -0.3, r: 0.15, w: 0.7 };
  it("glides at least 4 s", () => { expect(L.GLIDE_SEC).toBeGreaterThanOrEqual(4); });
  it("a new light fades in over GLIDE_SEC where it stands (no position sweep)", () => {
    const g = retargetGravity(createGravityGlide(), [sun], 10);
    const at = (t: number) => sampleGravity(g, t).find((p) => p.w > 0 || (p.x === sun.x && p.y === sun.y))!;
    expect(sampleGravity(g, 10).every((p) => p.w === 0)).toBe(true);
    const mid = at(12.5);
    expect(mid.x).toBeCloseTo(sun.x); expect(mid.y).toBeCloseTo(sun.y);
    expect(mid.w).toBeGreaterThan(0.2); expect(mid.w).toBeLessThan(0.8);
    expect(at(10 + L.GLIDE_SEC).w).toBeCloseTo(1);
    expect(gravityActive(g, 11)).toBe(true);
  });
  it("every value is continuous across retargets and never moves faster than the glide allows", () => {
    let g = retargetGravity(createGravityGlide(), [sun, moon], 0);
    const changes: [number, GravityPoint[]][] = [[3, [moon]], [5.5, [{ ...sun, x: 0.3 }]], [6, []], [9, [sun, moon, { x: 0, y: 0.8, r: 0.1, w: 0.5 }]]];
    let prev = sampleGravity(g, 0);
    const maxRate = 1.5 / L.GLIDE_SEC; // smoothstep's peak slope over a unit swing
    for (let t = 0.05; t < 20; t += 0.05) {
      for (const [at, pts] of changes) if (Math.abs(at - t) < 0.025) {
        const before = sampleGravity(g, t);
        g = retargetGravity(g, pts, t);
        const after = sampleGravity(g, t);
        for (let i = 0; i < before.length; i++) {
          expect(after[i].w).toBeCloseTo(before[i].w, 6);
          if (before[i].w > 1e-3) { expect(after[i].x).toBeCloseTo(before[i].x, 6); expect(after[i].y).toBeCloseTo(before[i].y, 6); }
        }
      }
      const cur = sampleGravity(g, t);
      for (let i = 0; i < cur.length; i++) {
        expect(Math.abs(cur[i].w - prev[i].w) / 0.05).toBeLessThanOrEqual(maxRate * 1.01 + 1e-6);
        // a weighted attractor never sweeps faster than a 2.4-NDC swing over the glide
        if (Math.min(cur[i].w, prev[i].w) > 1e-3) expect(Math.hypot(cur[i].x - prev[i].x, cur[i].y - prev[i].y) / 0.05).toBeLessThanOrEqual(maxRate * 2.4 * 1.01);
      }
      prev = cur;
    }
  });
  it("a nearby light is glided to; a vanished one fades out where it stands", () => {
    let g = retargetGravity(createGravityGlide(), [sun, moon], 0);
    g = retargetGravity(g, [{ ...sun, x: 0.6 }], 10);
    const end = sampleGravity(g, 10 + L.GLIDE_SEC);
    const live = end.filter((p) => p.w > 1e-3);
    expect(live.length).toBe(1);
    expect(live[0].x).toBeCloseTo(0.6);
    const faded = end.find((p) => p.w <= 1e-3 && Math.abs(p.x - moon.x) < 1e-6);
    expect(faded).toBeTruthy();
  });
  it("releasing ([]) lets every light go over the glide", () => {
    let g = retargetGravity(createGravityGlide(), [sun, moon], 0);
    g = retargetGravity(g, [], 6);
    expect(sampleGravity(g, 6).some((p) => p.w > 0.5)).toBe(true);
    expect(sampleGravity(g, 6 + L.GLIDE_SEC).every((p) => p.w < 1e-6)).toBe(true);
    expect(gravityActive(g, 6 + L.GLIDE_SEC + 1)).toBe(false);
  });
  it("packs 4 slots for the engine and describes them for the logger", () => {
    const g = retargetGravity(createGravityGlide(), [sun], 0);
    const pk = packGravity(sampleGravity(g, 99));
    expect(pk.length).toBe(16);
    expect(describeGravity([sun])).toContain("1 light");
    expect(describeGravity([])).toContain("0 lights");
  });
});

describe("light gravity — the shader block", () => {
  const start = SIM_FS.indexOf("float gravG = uGravG");
  const end = SIM_FS.indexOf("f.xyz += fg * gravG * sus;");
  const block = SIM_FS.slice(start, end + 30);
  it("is one gated block in the sim, after the currents and before the image pull", () => {
    expect(start).toBeGreaterThan(SIM_FS.indexOf("f.xyz += fc * curG;"));
    expect(end).toBeLessThan(SIM_FS.indexOf("vec3 imgT = vec3(0.0);"));
    expect(block).toContain("(1.0 - uImgForm) * (1.0 - uImgShow)"); // images + emblems untouched
    expect(block).toContain("if (gravG > 0.001)"); // off = skipped
  });
  it("is a FORCE only: never sets a position or velocity, never touches light", () => {
    expect(block).not.toMatch(/(^|[^.\w])[pv]\s*[+\-*]?=(?!=)/m);
    expect(block).not.toMatch(/uAlpha|uGain|uDensity|uHue|uSat|oPos|oVel/);
  });
  it("keeps density spread: a soft repulsive core, a capped pull, only some motes feel it", () => {
    expect(block).toContain("push");
    expect(block).toContain("if (fgl > 1.0)");
    expect(block).toContain("smoothstep(0.3, 1.0, hash11(");
    for (const src of [DRAW_VS, DRAW_FS, COMP_FS]) expect(src).not.toContain("uGrav");
  });
});
