/**
 * SHIMMER-FREE PARTICLES (stable-motes.ts) — the flicker meter.
 *
 * A single mote drifts slowly and sub-pixel (0.071, 0.043 px/frame) across a
 * pixel grid, rasterised with the point-sprite coverage rule. We measure, per
 * size, the show build's sprite against the stable sprite (+ temporal
 * resolve):
 *   - pixelDeltaVar: per-pixel variance of the frame-to-frame luminance change
 *   - pixelAccel:    per-pixel second difference² (popping vs smooth motion)
 *   - energyCv:      frame-to-frame variation of the mote's total light
 *   - energy error:  every frame's total light vs the nominal (±3 %)
 */
import { describe, it, expect } from "vitest";
import {
  STABLE_LAWS,
  LEGACY_K,
  nominalEnergy,
  driftFrames,
  shimmer,
  stableMote,
  stableFragment,
  rasterMote,
  taaResolve,
  taaKeep,
  bloomKeep,
  stableEnabled,
  glowEnabled,
  stableGlslConsts,
  STABLE_SESSION_KEY,
  GLOW_SESSION_KEY,
} from "./stable-motes";
import { DRAW_VS, DRAW_FS, COMP_FS, TAA_FS, BLOOM_FS, withStable, withGlow, withTrails } from "./shaders";

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const W = 40;
const meter = (kind: "legacy" | "stable", size: number, taa = false) =>
  shimmer(driftFrames(kind, size, { taa, W, H: W, n: 150 }), nominalEnergy(size));

describe("the shimmer meter: a mote drifting sub-pixel", () => {
  const SIZES = [0.5, 1, 1.5, 2, 3];

  it("the show build's small motes DO shimmer (the diagnosis)", () => {
    const one = meter("legacy", 1);
    expect(one.energyCv).toBeGreaterThan(0.5); // a 1 px mote's light swings > 50 % frame to frame
    expect(meter("legacy", 2).energyCv).toBeGreaterThan(0.1);
  });

  it("coverage + temporal resolve cut the shimmer by orders of magnitude", () => {
    const rows: string[] = [];
    for (const size of SIZES) {
      const before = meter("legacy", size);
      const after = meter("stable", size, true);
      const nom2 = nominalEnergy(size) ** 2;
      rows.push(
        `${size}px  dVar ${(before.pixelDeltaVar / nom2 * 1e6).toFixed(2)} → ${(after.pixelDeltaVar / nom2 * 1e6).toFixed(2)} (e-6)` +
        `  accel ${(before.pixelAccel / nom2 * 1e6).toFixed(2)} → ${(after.pixelAccel / nom2 * 1e6).toFixed(3)}` +
        `  energyCV ${(before.energyCv * 100).toFixed(1)}% → ${(after.energyCv * 100).toFixed(2)}%`,
      );
      // per-pixel frame-to-frame variance: at least 3× lower at every size, and
      // far lower where it matters (≤ 2 px: the sub-pixel dust)
      expect(after.pixelDeltaVar).toBeLessThan(before.pixelDeltaVar / 3);
      if (size <= 2) expect(after.pixelDeltaVar).toBeLessThan(before.pixelDeltaVar / 15);
      // popping (second difference) ≥ 20× lower
      expect(after.pixelAccel).toBeLessThan(before.pixelAccel / 20);
      // the pulse of the whole mote: below 1 % (the eye's flicker floor is ~1–2 %)
      expect(after.energyCv).toBeLessThan(0.01);
      expect(after.energyCv).toBeLessThan(before.energyCv / 5);
    }
    console.log(`shimmer meter (legacy → stable+TAA)\n${rows.join("\n")}`);
  });

  it("ENERGY: every frame's light is the nominal within ±3 % (coverage alone and with the resolve)", () => {
    for (const size of [0.3, 0.5, 0.8, 1, 1.5, 2, 3, 4, 6, 8, 12, 18, 24, 30]) {
      expect(meter("stable", size).energyMaxErr).toBeLessThan(0.03);
      expect(meter("stable", size, true).energyMaxErr).toBeLessThan(0.03);
    }
  });

  it("the stable sprite integrates to the legacy nominal analytically (no brightness change)", () => {
    for (const size of [0.5, 1, 2, 5, 10, 24]) {
      const m = stableMote(size);
      let e = 0;
      const st = 0.05, r = m.ps / 2 + st;
      for (let y = -r; y <= r; y += st) for (let x = -r; x <= r; x += st) e += stableFragment(x, y, m) * st * st;
      expect(Math.abs(e / nominalEnergy(size) - 1)).toBeLessThan(0.01);
    }
    expect(LEGACY_K).toBeCloseTo(0.8854, 3);
  });

  it("minimum footprint ≥ 1.5 px, smooth rim (value → 0 at the edge), large motes keep the legacy rim", () => {
    for (const size of [0.2, 0.5, 1]) {
      const m = stableMote(size);
      expect(m.ps).toBeGreaterThanOrEqual(3); // the sprite that carries a ≥1.5 px FWHM gaussian
      const fwhm = 2.355 * Math.sqrt(1 / (2 * m.k1));
      expect(fwhm).toBeGreaterThanOrEqual(1.5);
    }
    for (const size of [0.5, 2, 8, 20]) {
      const m = stableMote(size);
      const rim = Math.sqrt(m.rs2) - 1e-4;
      expect(stableFragment(rim, 0, m) / stableFragment(0, 0, m)).toBeLessThan(1e-3);
    }
    expect(stableMote(16).ps).toBeCloseTo(16, 5);
    expect(stableMote(24).ps).toBeCloseTo(24, 5);
  });
});

describe("temporal resolve (TAA-lite)", () => {
  it("no ghost: light that leaves the neighbourhood is gone the next frame", () => {
    const a = rasterMote("stable", 10, 10, 2, W, W);
    const b = rasterMote("stable", 28, 26, 2, W, W);
    const out = taaResolve(b, a, W, W, taaKeep(1 / 60));
    let left = 0;
    for (let y = 6; y < 15; y++) for (let x = 6; x < 15; x++) left += out[y * W + x];
    expect(left).toBe(0);
    // and a mote that vanishes leaves nothing behind
    const gone = taaResolve(new Float32Array(W * W), a, W, W, taaKeep(1 / 60));
    expect(gone.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it("damps a flickering pixel inside a lit neighbourhood (≥ 3× less swing)", () => {
    let hist: Float32Array | null = null;
    const swings: number[] = [];
    for (let t = 0; t < 60; t++) {
      const cur = new Float32Array(W * W).fill(1);
      cur[20 * W + 20] = t % 2 ? 1.2 : 0.8; // 30 Hz on/off around the field
      hist = taaResolve(cur, hist, W, W, taaKeep(1 / 60));
      if (t > 20) swings.push(hist[20 * W + 20]);
    }
    const sw = Math.max(...swings) - Math.min(...swings);
    expect(sw).toBeLessThan(0.4 / 3);
  });

  it("history weight is time-based (≈0.7 per 60 Hz frame)", () => {
    expect(taaKeep(1 / 60)).toBeCloseTo(STABLE_LAWS.TAA_KEEP_60, 6);
    expect(taaKeep(1 / 120) ** 2).toBeCloseTo(taaKeep(1 / 60), 6);
  });
});

describe("stable glow", () => {
  it("the bloom low-pass attenuates 3–30 Hz flicker before the knee", () => {
    for (const hz of [3, 10, 30]) {
      let y = 0, mn = Infinity, mx = -Infinity;
      const k = bloomKeep(1 / 60);
      for (let t = 0; t < 600; t++) {
        const x = Math.floor((t * 2 * hz) / 60) % 2; // square wave, hz cycles / s
        y = x + (y - x) * k;
        if (t > 300) { mn = Math.min(mn, y); mx = Math.max(mx, y); }
      }
      expect(mx - mn).toBeLessThan(hz >= 10 ? 0.25 : 0.7);
    }
  });
});

describe("GLSL: generated from the same laws, compiled in only when on", () => {
  it("withStable defines STABLE and the constants; off = the show source", () => {
    const vs = withStable(DRAW_VS), fs = withStable(DRAW_FS);
    expect(vs).toContain("#define STABLE 1");
    expect(fs).toContain("#define STABLE 1");
    expect(vs.split("\n")[0]).toBe("#version 300 es");
    expect(fs).toContain(`const float ST_SP2 = ${(STABLE_LAWS.PREFILTER_SIGMA_PX ** 2).toFixed(6)};`);
    expect(stableGlslConsts()).toContain("ST_RIM");
    expect(DRAW_VS).not.toContain("#define STABLE");
    // composes with the trails build
    const both = withStable(withTrails(DRAW_FS));
    expect(both).toContain("#define TRAILS 1");
    expect(both).toContain("#define STABLE 1");
    // the varyings agree between stages
    for (const v of ["vStC", "vStA", "vStB"]) { expect(vs).toContain(`flat out`); expect(fs).toContain(v); }
  });

  it("withGlow swaps the mip-chain bloom for the filtered texture; the show comp is untouched", () => {
    const g = withGlow(COMP_FS);
    expect(g).toContain("uniform sampler2D uBloomTex;");
    expect(g).not.toContain("textureLod");
    expect(g).toContain("smoothstep(0.1, 0.5, bl)"); // the soft knee stays
    expect(COMP_FS).not.toContain("uBloomTex");
    expect(BLOOM_FS).toContain("mix(b, texelFetch(uPrev");
    expect(TAA_FS).toContain(`ST_SLACK = ${STABLE_LAWS.TAA_CLAMP_SLACK.toFixed(4)}`);
  });
});

describe("the flags", () => {
  it("?stable / ?glow: default off, 1/0 kept in the session", () => {
    for (const [fn, key, p] of [[stableEnabled, STABLE_SESSION_KEY, "stable"], [glowEnabled, GLOW_SESSION_KEY, "glow"]] as const) {
      const s = memStore();
      expect(fn("", s)).toBe(false);
      expect(fn(`?${p}=1`, s)).toBe(true);
      expect(s.m.get(key)).toBe("1");
      expect(fn("", s)).toBe(true); // kept across the loop's navigations
      expect(fn(`?${p}=0`, s)).toBe(false);
      expect(fn("", s)).toBe(false);
      expect(fn("", null)).toBe(false);
      const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
      expect(fn(`?${p}=1`, blocked)).toBe(true);
      expect(fn("", blocked)).toBe(false);
    }
  });
});
