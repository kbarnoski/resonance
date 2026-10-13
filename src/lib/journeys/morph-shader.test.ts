/**
 * Morph-shader arrival (Karel 2026-10-13: "all morphs there should be shaders
 * over them as they approach their end frame so the screen is never a full
 * page static image").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pickMorphShader, morphShaderLeadSec, morphShaderDue, finaleSwitchRedundant, morphShaderTiming,
  registerMorphArrivalFade, takeMorphArrivalFade,
  morphShaderEnabled, MORPH_SHADER_LAWS, MORPH_SHADER_DEFAULT, type MorphShaderPickInput,
} from "./morph-shader";
import { fadeMsFor, SHADER_FADE_DURATION_MS } from "@/lib/shaders/shader-fade";
import { getJourneyEngine } from "./journey-engine";
import { defaultPhases, GLOBAL_SHADER_BLOCKLIST } from "./journeys";
import { markVideoActive, resetVideoActivity } from "./video-activity";
import type { Journey } from "./types";

const LUMA: Record<string, number> = { dim: 3, dim2: 5, mid: 20, mid2: 24, bright: 60, blaze: 120, unk: 20 };
const fade = (a: string, b: string) => 2500 * (1 + Math.max(0, (LUMA[b] ?? 20) - (LUMA[a] ?? 20)) / 75);

function input(over: Partial<MorphShaderPickInput> = {}): MorphShaderPickInput {
  return {
    phaseModes: ["dim2", "mid", "bright"],
    nextPhaseModes: ["mid2", "blaze"],
    owned: false,
    current: "dim",
    dual: null,
    tertiary: null,
    seen: new Set<string>(),
    allowed: () => true,
    random: () => 0,
    luma: LUMA,
    fadeMs: fade,
    ...over,
  };
}

describe("flag", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  it("is ON by default (Karel 2026-10-13: shaders over every morph's end)", () => {
    expect(MORPH_SHADER_DEFAULT).toBe(true);
    expect(morphShaderEnabled("", store())).toBe(true);
  });
  it("?morphshader=1 turns it on and is kept for the session; =0 turns it off", () => {
    const s = store();
    expect(morphShaderEnabled("?morphshader=1", s)).toBe(true);
    expect(morphShaderEnabled("", s)).toBe(true);
    expect(morphShaderEnabled("?morphshader=0", s)).toBe(false);
    expect(morphShaderEnabled("", s)).toBe(false);
  });
});

describe("pickMorphShader", () => {
  it("prefers a shader that reads clearly with a gentle fade from the current primary", () => {
    // from a 20-luma current: mid (2.5 s) beats mid2 (2.63 s); bright (3.8 s) is out
    const p = pickMorphShader(input({ current: "unk", phaseModes: ["mid2", "mid", "bright"], random: () => 0.99 }));
    expect(p?.mode).toBe("mid");
    expect(p!.fadeMs).toBeLessThanOrEqual(MORPH_SHADER_LAWS.PREFERRED_FADE_MS);
  });
  it("never picks a dim/sparse shader when a clear one fits the fade budget", () => {
    const p = pickMorphShader(input());
    expect(p?.mode).toBe("mid"); // dim2 is dim; bright's fade from dim is 4.4 s
    expect(p!.fadeMs).toBeLessThanOrEqual(MORPH_SHADER_LAWS.MAX_FADE_MS);
  });
  it("falls through to the next phase's cast, unseen first", () => {
    const p = pickMorphShader(input({ phaseModes: ["dim2"], seen: new Set(["dim2"]) }));
    expect(p?.mode).toBe("mid2");
  });
  it("prefers unseen in the phase over seen", () => {
    const p = pickMorphShader(input({ phaseModes: ["mid", "mid2"], seen: new Set(["mid"]), current: "mid2b" }));
    expect(p?.mode).toBe("mid2");
  });
  it("phase-owned: only the phase's own shaders", () => {
    const p = pickMorphShader(input({ owned: true, phaseModes: ["dim2"], nextPhaseModes: ["mid"] }));
    expect(p?.mode).toBe("dim2"); // dim, but the cast law wins; any motion beats a static frame
  });
  it("never a shader live on another layer, never a banned one", () => {
    const p = pickMorphShader(input({ dual: "mid", tertiary: "mid2", allowed: (m) => m !== "bright" }));
    expect(p?.mode).not.toBe("mid");
    expect(p?.mode).not.toBe("mid2");
    expect(p?.mode).not.toBe("bright");
  });
  it("avoids solo primaries while a dual is live (dropping the dual = a second change)", () => {
    const p = pickMorphShader(input({ dual: "x", phaseModes: ["mid"], nextPhaseModes: ["mid2"], soloPrimaries: new Set(["mid"]) }));
    expect(p?.mode).toBe("mid2");
  });
  it("returns null when nothing is usable", () => {
    expect(pickMorphShader(input({ allowed: () => false }))).toBeNull();
    expect(pickMorphShader(input({ phaseModes: ["dim"], nextPhaseModes: [] }))).toBeNull(); // only the current
  });
  it("draws from random only among equals", () => {
    const a = pickMorphShader(input({ phaseModes: ["mid", "mid2"], random: () => 0 }));
    const b = pickMorphShader(input({ phaseModes: ["mid", "mid2"], random: () => 0.99 }));
    expect(new Set([a?.mode, b?.mode])).toEqual(new Set(["mid", "mid2"]));
  });
});

describe("timing", () => {
  it("the shared fade module matches the visualizer's brightness-aware fade", () => {
    expect(fadeMsFor("drift", "drift")).toBe(SHADER_FADE_DURATION_MS);
    expect(fadeMsFor(null, null)).toBe(SHADER_FADE_DURATION_MS);
    expect(fadeMsFor("plasma", "cataphatic")).toBeGreaterThan(SHADER_FADE_DURATION_MS);
    expect(fadeMsFor("plasma", "cataphatic")).toBeLessThanOrEqual(7000);
  });
  // Karel 2026-10-13: "your shaders come in a bit late such that when the
  // final frames of the morph are reached they are still coming in but should
  // already be there" — the arrival is FULLY IN ≥ 1.5 s before the end frame.
  const L = MORPH_SHADER_LAWS;
  it("long morph: begins ~7 s before the end, fully in ≥ 1.5 s before it (natural fade kept)", () => {
    const t = morphShaderTiming(2500, 12);
    expect(t.leadSec).toBe(7);
    expect(t.fadeMs).toBe(2500);
    expect(t.fullyInSec).toBeGreaterThanOrEqual(L.FULLY_IN_BEFORE_END_SEC);
    expect(morphShaderLeadSec(2500, 12)).toBe(7);
  });
  it("a long (brightness-stretched) fade starts earlier still, up to the cap", () => {
    const t = morphShaderTiming(7000, 20);
    expect(t.leadSec).toBeCloseTo(9, 5); // 7 + 1.5 + 0.5
    expect(t.fadeMs).toBe(7000);
    expect(t.fullyInSec).toBeGreaterThanOrEqual(L.FULLY_IN_BEFORE_END_SEC - 1e-9);
  });
  it("the real ~5 s travel morph: lands as the clip starts, natural 2.5 s fade fits, fully in ≥ 1.5 s early", () => {
    const t = morphShaderTiming(2500, 5.04);
    expect(t.leadSec).toBeCloseTo(5.04 - L.MIN_PLAYED_SEC, 5);
    expect(t.fadeMs).toBe(2500);
    expect(t.fullyInSec).toBeGreaterThanOrEqual(L.FULLY_IN_BEFORE_END_SEC);
    // vs the old law (landed 3.1 s before the end: fully in only 0.6 s early)
    expect(t.leadSec).toBeGreaterThan(4.5);
  });
  it("short morph: the fade is shortened to finish in time — never under the never-abrupt floor", () => {
    const t = morphShaderTiming(3400, 5);
    expect(t.fadeMs).toBeLessThan(3400);
    expect(t.fadeMs).toBeGreaterThanOrEqual(L.MIN_FADE_MS);
    expect(t.fullyInSec).toBeCloseTo(L.FULLY_IN_BEFORE_END_SEC, 5);
    const tiny = morphShaderTiming(2500, 3);
    expect(tiny.fadeMs).toBe(L.MIN_FADE_MS);
    expect(tiny.leadSec).toBeCloseTo(3 - L.MIN_PLAYED_SEC, 5);
    expect(tiny.fullyInSec).toBeGreaterThan(0); // still completes before the end
  });
  it("every clip length 3-15 s and fade 1.8-7 s: in before the end, ≥ 1.5 s whenever the clip allows", () => {
    for (let dur = 3; dur <= 15; dur += 0.25) {
      for (let f = 1800; f <= 7000; f += 400) {
        const t = morphShaderTiming(f, dur);
        expect(t.fadeMs).toBeLessThanOrEqual(f);
        expect(t.fadeMs).toBeGreaterThanOrEqual(Math.min(f, L.MIN_FADE_MS));
        expect(t.leadSec).toBeLessThanOrEqual(dur - L.MIN_PLAYED_SEC + 1e-9);
        expect(t.fullyInSec).toBeGreaterThan(0);
        if (dur - L.MIN_PLAYED_SEC >= L.LAND_SLACK_SEC + L.FULLY_IN_BEFORE_END_SEC + L.MIN_FADE_MS / 1000) {
          expect(t.fullyInSec).toBeGreaterThanOrEqual(L.FULLY_IN_BEFORE_END_SEC - 1e-9);
        }
      }
    }
  });
  it("never lands before the staged shader has had its prewarm (compile + sync + warm draw)", () => {
    // canplay 0.2 s after staging: the clip must play ≥ 1.0 s more first
    const quick = morphShaderTiming(2500, 5.04, 0.2);
    expect(quick.leadSec).toBeCloseTo(5.04 - (L.PREWARM_MIN_SEC - 0.2), 5);
    expect(quick.fullyInSec).toBeGreaterThan(0);
    expect(quick.fadeMs).toBeGreaterThanOrEqual(L.MIN_FADE_MS);
    // a slow load already covered the prewarm: only MIN_PLAYED applies
    expect(morphShaderTiming(2500, 5.04, 3).leadSec).toBeCloseTo(5.04 - L.MIN_PLAYED_SEC, 5);
  });
  it("unknown duration is treated as a 5 s clip", () => {
    expect(morphShaderLeadSec(2500, NaN)).toBeCloseTo(5 - L.MIN_PLAYED_SEC, 5);
  });
  it("the arrival fade is handed to the visualizer once, for that shader only, while fresh", () => {
    registerMorphArrivalFade("mid", 2100);
    expect(takeMorphArrivalFade("other")).toBeNull();
    expect(takeMorphArrivalFade("mid")).toBe(2100);
    expect(takeMorphArrivalFade("mid")).toBeNull(); // consumed
  });
  it("due when the remaining time reaches the lead", () => {
    expect(morphShaderDue(3.5, 3.1)).toBe(false);
    expect(morphShaderDue(3.1, 3.1)).toBe(true);
    expect(morphShaderDue(NaN, 3.1)).toBe(false);
  });
  it("finale switch is redundant right after an arrival", () => {
    expect(finaleSwitchRedundant(4000)).toBe(true);
    expect(finaleSwitchRedundant(MORPH_SHADER_LAWS.FINALE_SKIP_WINDOW_MS + 1)).toBe(false);
  });
});

function makeJourney(id = "test-morph-shader"): Journey {
  return { id, name: "Morph Shader Test", subtitle: "", description: "", realmId: "cosmos", aiEnabled: false, phases: defaultPhases("cosmos", {}) };
}

describe("engine plan → land", () => {
  let clock = 0;
  beforeEach(() => {
    clock = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    resetVideoActivity();
  });
  afterEach(() => { getJourneyEngine().stop(); vi.restoreAllMocks(); resetVideoActivity(); });

  it("stages a shader (frame.stagedShaderMode), lands it under the playing morph, one switch only", () => {
    const eng = getJourneyEngine();
    eng.start(makeJourney(), { seed: 7, trackDuration: 300 });
    for (let i = 0; i < 40; i++) { clock += 500; eng.getFrame(0.3); }
    const before = eng.getFrame(0.3)!;
    markVideoActive(9500); // the morph is on screen — rotation is quiet
    const plan = eng.planMorphShader();
    expect(plan).not.toBeNull();
    const staged = eng.getFrame(0.3)!;
    expect(staged.stagedShaderMode).toBe(plan!.mode);
    expect(staged.shaderMode).toBe(before.shaderMode); // staging alone switches nothing
    expect([before.shaderMode, before.dualShaderMode, before.tertiaryShaderMode]).not.toContain(plan!.mode);
    for (const b of GLOBAL_SHADER_BLOCKLIST) expect(plan!.mode).not.toBe(b);
    clock += 1500;
    const timing = morphShaderTiming(plan!.fadeMs, 5.04);
    expect(eng.landMorphShader(4.79, timing.fadeMs)).toBe(plan!.mode);
    // the visualizer runs the fade the landing time was computed for
    expect(takeMorphArrivalFade(plan!.mode)).toBe(timing.fadeMs);
    const landed = eng.getFrame(0.3)!;
    expect(landed.shaderMode).toBe(plan!.mode);
    expect(landed.stagedShaderMode).toBeUndefined();
    expect(eng.morphArrivalFresh()).toBe(true);
    // the clip ends: no second switch rides in right behind the arrival
    for (let i = 0; i < 12; i++) { clock += 500; expect(eng.getFrame(0.3)!.shaderMode).toBe(plan!.mode); }
  });

  it("a cancelled or already-landed plan never lands twice", () => {
    const eng = getJourneyEngine();
    eng.start(makeJourney(), { seed: 7, trackDuration: 300 });
    clock += 2000; eng.getFrame(0.3);
    eng.planMorphShader();
    eng.cancelMorphShader();
    expect(eng.getStagedShaderMode()).toBeNull();
    expect(eng.landMorphShader(3)).toBeNull();
  });

  it("scripted takes plan nothing (their scripts already decide)", () => {
    const eng = getJourneyEngine();
    eng.start(makeJourney(), { seed: 7, trackDuration: 300, script: [{ p: 0, role: "primary", mode: "cosmos" }] as never });
    clock += 2000; eng.getFrame(0.3);
    expect(eng.planMorphShader()).toBeNull();
  });
});
