import { describe, it, expect } from "vitest";
import {
  SustainMeter,
  TRAILS_LAWS as L,
  TRAILS_DEFAULT,
  TRAILS_SESSION_KEY,
  TRAILS_JOURNEY_STRENGTH,
  TRAIL_INTEGRALS,
  trailGain,
  trailGeometry,
  trailFragment,
  trailsEnabled,
  trailsForJourney,
  trailsStrengthFor,
  coreProfile,
  bokehProfile,
  softProfile,
  type TrailGeom,
  type TrailIn,
} from "./resonance-trails";
import { DRAW_VS, DRAW_FS, withTrails } from "./shaders";

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

/** Integrate a streak's light (supersampled, px²) and its peak. */
function raster(g: TrailGeom, coc: number, dir: [number, number] = [Math.SQRT1_2, Math.SQRT1_2], step = 0.08): { energy: number; peak: number } {
  const half = g.sprite / 2 + 0.5;
  let energy = 0, peak = 0;
  for (let y = -half; y <= half; y += step) {
    for (let x = -half; x <= half; x += step) {
      const v = trailFragment(x, y, g, dir, coc);
      energy += v * step * step;
      if (v > peak) peak = v;
    }
  }
  return { energy, peak };
}
const disc = (r0: number): TrailGeom => ({ len: 0, r: Math.max(0.5, r0), fade: 0, soft: 0, sprite: 2 * Math.max(0.5, r0), scale: 1 });
const base: TrailIn = { r0: 1.5, coc: 0, speedPx: 400, gain: 1, imgShow: 0, viewH: 1080, carrier: 1 };

describe("resonance trails — the flag", () => {
  it("is off by default; ?trails=1 / ?trails=0 switch it and are remembered for the tab", () => {
    expect(TRAILS_DEFAULT).toBe(false);
    const st = memStore();
    expect(trailsEnabled("", st)).toBe(false);
    expect(trailsEnabled("?trails=1", st)).toBe(true);
    expect(st.m.get(TRAILS_SESSION_KEY)).toBe("1");
    expect(trailsEnabled("", st)).toBe(true);
    expect(trailsEnabled("?trails=0", st)).toBe(false);
    expect(trailsEnabled("", st)).toBe(false);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(trailsEnabled("?trails=1", broken)).toBe(true);
    expect(trailsEnabled("", broken)).toBe(false);
  });

  it("runs on every journey — Snowflake + Ghost too — each with a strength knob (default 1)", () => {
    expect(trailsForJourney("first-snow", true)).toBe(1);
    expect(trailsForJourney("ghost", true)).toBe(1);
    expect(trailsForJourney("realized", true)).toBe(1);
    expect(trailsForJourney("ghost", false)).toBe(0);
    expect(trailsForJourney("anything", false)).toBe(0);
    expect(TRAILS_JOURNEY_STRENGTH["first-snow"]).toBeDefined();
    expect(TRAILS_JOURNEY_STRENGTH.ghost).toBeDefined();
    for (const k of Object.values(TRAILS_JOURNEY_STRENGTH)) expect(k).toBeGreaterThanOrEqual(0);
    expect(trailsStrengthFor("unlisted")).toBe(1);
  });
});

describe("resonance trails — seizure safety: the mote spreads, it never brightens", () => {
  it("integrated light never exceeds the untrailed mote's, and stays ≥ 90 % of it (spread, not dimmed)", () => {
    for (const r0 of [0.5, 1, 1.5, 3, 8]) {
      for (const coc of [0, 0.4]) {
        const e0 = raster(disc(r0), coc);
        for (const speedPx of [20, 80, 200, 1000, 1e5]) {
          for (const gain of [0.2, 0.6, 1]) {
            const g = trailGeometry({ ...base, r0, coc, speedPx, gain });
            const e = raster(g, coc);
            expect(g.scale).toBeLessThanOrEqual(1);
            expect(e.energy).toBeLessThanOrEqual(e0.energy * 1.02);
            expect(e.energy).toBeGreaterThanOrEqual(e0.energy * 0.9);
            expect(e.peak).toBeLessThanOrEqual(e0.peak * 1.001);
          }
        }
      }
    }
  });

  it("the streak's energy is direction-independent (no shimmer as a mote turns)", () => {
    const g = trailGeometry(base);
    const a = raster(g, 0, [1, 0]).energy, b = raster(g, 0, [Math.SQRT1_2, Math.SQRT1_2]).energy, c = raster(g, 0, [0.28, -0.96]).energy;
    expect(Math.abs(a - b) / a).toBeLessThan(0.02);
    expect(Math.abs(a - c) / a).toBeLessThan(0.02);
  });

  it("the shader constants are the profiles' integrals (one source of truth)", () => {
    const vs = withTrails(DRAW_VS);
    expect(vs).toContain(`TR_G2C = ${TRAIL_INTEGRALS.core.g2.toFixed(6)}`);
    expect(vs).toContain(`TR_G1S = ${TRAIL_INTEGRALS.soft.g1.toFixed(6)}`);
    // the profiles' peaks: a tail is never brighter than the core
    expect(softProfile(0)).toBeCloseTo(coreProfile(0), 6);
    expect(bokehProfile(0)).toBeLessThanOrEqual(coreProfile(0));
  });
});

describe("resonance trails — no shimmer: wide, soft, capped tails", () => {
  it("a tail is ≥ 1.5 px wide (FWHM at mid-tail) with a feathered rim", () => {
    for (const r0 of [0.5, 1]) {
      for (const speedPx of [60, 300, 5000]) {
        const g = trailGeometry({ ...base, r0, speedPx });
        if (g.len < 2) continue;
        expect(g.r).toBeGreaterThanOrEqual(L.MIN_HALF_W_PX - 1e-9);
        const dir: [number, number] = [1, 0];
        const c = trailFragment(0, 0, g, dir, 0);
        let w = 0;
        for (let y = 0; y <= g.r; y += 0.005) if (trailFragment(0, y, g, dir, 0) >= c / 2) w = y;
        expect(2 * w).toBeGreaterThanOrEqual(1.5);
      }
    }
    expect(softProfile(0.999)).toBeLessThan(0.01 * softProfile(0));
  });

  it("length is capped (scaled to the screen) and the sprite never exceeds its cap", () => {
    const g = trailGeometry({ ...base, speedPx: 1e7 });
    expect(g.len).toBeLessThanOrEqual(L.MAX_PX_1080 + 1e-9);
    const g4k = trailGeometry({ ...base, speedPx: 1e7, viewH: 2160 });
    expect(g4k.len).toBeLessThanOrEqual(L.MAX_PX_1080 * 2 + 1e-9);
    // the untrailed sprite is capped at 24 px (r0 ≤ 12)
    for (const r0 of [1, 6, 12]) {
      const big = trailGeometry({ ...base, r0, speedPx: 1e7, viewH: 4320 });
      expect(big.sprite).toBeLessThanOrEqual(L.SPRITE_CAP_PX + 1e-9);
    }
  });

  it("length grows smoothly with speed (no kink at the cap)", () => {
    let prev = 0;
    for (let sp = 0; sp < 20000; sp += 5) {
      const len = trailGeometry({ ...base, speedPx: sp }).len;
      expect(len).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(len - prev).toBeLessThan(0.35);
      prev = len;
    }
  });

  it("no tail: images worn, out-of-focus bokeh, no gain, non-carriers — exactly the untrailed mote", () => {
    for (const p of [{ imgShow: 1 }, { coc: 1 }, { gain: 0 }, { carrier: 0 }, { speedPx: 0 }]) {
      const g = trailGeometry({ ...base, ...p });
      expect(g.len).toBe(0);
      expect(g.scale).toBeCloseTo(1, 9);
      expect(g.r).toBe(base.r0);
    }
  });
});

describe("resonance trails — the sustain meter", () => {
  const DT = 1 / 60;
  const chord = (lvl: number, jitter: number) => Uint8Array.from({ length: 128 }, (_, i) => Math.max(0, Math.min(255, Math.round(lvl - i * 0.8 + ((i + jitter) % 2)))));

  function run(m: SustainMeter, sec: number, frame: (t: number, k: number) => Uint8Array | null, trace: number[]): void {
    const n = Math.round(sec / DT);
    for (let k = 0; k < n; k++) trace.push(m.push(frame(k * DT, k), DT));
  }

  it("the smoothing laws: ≥ 1.5 s up, ≥ 3 s down, full swing ≥ 1.5 s", () => {
    expect(L.UP_TAU_SEC).toBeGreaterThanOrEqual(1.5);
    expect(L.DOWN_TAU_SEC).toBeGreaterThanOrEqual(3);
    expect(1 / L.MAX_GAIN_RATE).toBeGreaterThanOrEqual(L.MIN_SWING_SEC);
    expect(L.MIN_SWING_SEC).toBeGreaterThanOrEqual(1.5);
    expect(trailGain(L.GAIN_DEAD)).toBe(0);
    expect(trailGain(1)).toBe(1);
  });

  it("a held chord rings: tails grow slowly, then shorten as the sound dies away", () => {
    const m = new SustainMeter();
    const tr: number[] = [];
    run(m, 1, () => null, tr);
    run(m, 12, (_t, k) => chord(210, k), tr);
    const heldEnd = tr[tr.length - 1];
    expect(heldEnd).toBeGreaterThan(0.6);
    // slow rise: the tails take ≥ 1.5 s from the chord's start to reach 0.6
    const start = Math.round(1 / DT);
    const reached = tr.findIndex((g, i) => i >= start && g >= 0.6);
    expect((reached - start) * DT).toBeGreaterThanOrEqual(1.5);
    // decay: the chord fades (dB) to silence over 10 s
    run(m, 10, (t, k) => chord(210 - 21 * t, k), tr);
    const after1s = tr[Math.round(14 / DT)];
    expect(after1s).toBeGreaterThan(heldEnd * 0.5);
    run(m, 6, () => null, tr);
    expect(tr[tr.length - 1]).toBeLessThan(0.02);
    // never faster than the slew law, both ways
    for (let i = 1; i < tr.length; i++) expect(Math.abs(tr[i] - tr[i - 1])).toBeLessThanOrEqual(L.MAX_GAIN_RATE * DT + 1e-9);
  });

  it("short staccato passages draw no tails", () => {
    const m = new SustainMeter();
    const tr: number[] = [];
    let lvl = 90;
    run(m, 14, (t, k) => {
      const onNote = k % 12 === 0; // a note every 0.2 s
      lvl = onNote ? 205 : 90 + (lvl - 90) * 0.8;
      return chord(lvl, k);
    }, tr);
    expect(Math.max(...tr.slice(Math.round(4 / DT)))).toBeLessThan(0.08);
  });

  it("a stale analyser feed keeps the last reading; NaN / huge dt are safe", () => {
    const m = new SustainMeter();
    const b = chord(200, 0);
    for (let i = 0; i < 600; i++) m.push(b, DT); // identical frames = stale after the first
    expect(Number.isFinite(m.gain)).toBe(true);
    m.push(b, Number.NaN);
    m.push(null, 1e9);
    expect(m.gain).toBeGreaterThanOrEqual(0);
    expect(m.gain).toBeLessThanOrEqual(1);
  });
});

describe("resonance trails — the shaders", () => {
  it("off = the show build's exact draw source; on = TRAILS defined after #version", () => {
    expect(DRAW_VS.startsWith("#version 300 es\n")).toBe(true);
    const vs = withTrails(DRAW_VS), fs = withTrails(DRAW_FS);
    for (const s of [vs, fs]) {
      expect(s.startsWith("#version 300 es\n#define TRAILS 1\n")).toBe(true);
    }
    expect(DRAW_VS).not.toMatch(/^#define TRAILS/m);
    // the constants follow the float precision statement (the FS has no default)
    for (const s of [vs, fs]) expect(s.indexOf("const float TR_")).toBeGreaterThan(s.search(/^precision \w+ float;/m));
    // every trails line in the base source sits inside an #ifdef TRAILS block
    for (const src of [DRAW_VS, DRAW_FS]) {
      let depth = 0;
      for (const line of src.split("\n")) {
        if (line.startsWith("#ifdef TRAILS")) depth++;
        else if (line.startsWith("#endif") && depth > 0) depth--;
        else if (/uTrail|vTrail|trScale|TR_[A-Z]/.test(line)) expect(depth).toBe(1);
      }
    }
  });
});
