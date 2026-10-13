/**
 * BREATH — the laws (breath.ts), on every journey's baked deep-analysis
 * profile (always present in the kiosk build).
 */
import { describe, it, expect } from "vitest";
import {
  conductBreath, breathAt, breathPhrases, breathEnabled, breathFreedom, breathSummary,
  BREATH_DEFAULT, BREATH_LAWS, BREATH_JOURNEY_STRENGTH, BREATH_SESSION_KEY, NEUTRAL_BREATH, breathStrength,
  type BreathInput,
} from "./breath";
import { phraseSeconds } from "./phrase-conductor";
import { PARTICLE_PROFILES } from "@/lib/journeys/particle-profiles.generated";
import { SOUL_IDS } from "./souls";
import { SIM_FS, DRAW_VS, DRAW_FS, COMP_FS } from "./shaders";

const L = BREATH_LAWS;
const G = L.GRID_SEC;
const ALL = Object.entries(PARTICLE_PROFILES);

/** A synthetic piece at 120 bpm (phrase = 8 bars = 16 s): a 64 s quiet section,
 *  a 48 s loud one, a 4 s sliver (joins its neighbour), a 60 s outro. */
function synthetic(): BreathInput {
  return {
    duration: 176,
    tempo: { bpm: 120 },
    sections: [
      { start: 0, end: 64, trend: "steady", intensity: 0.2 },
      { start: 64, end: 112, trend: "building", intensity: 1 },
      { start: 112, end: 116, trend: "steady", intensity: 0.5 },
      { start: 116, end: 176, trend: "receding", intensity: 0.3 },
    ],
  };
}

describe("breath — phrases", () => {
  it("uses the phrase conductor's tempo-aligned grid from every section start", () => {
    const { phraseSec, phrases } = breathPhrases(synthetic());
    expect(phraseSec).toBe(phraseSeconds(120));
    expect(phrases[0].start).toBe(0);
    expect(phrases[phrases.length - 1].end).toBe(176);
    for (let i = 1; i < phrases.length; i++) expect(phrases[i].start).toBe(phrases[i - 1].end);
    // section starts are phrase starts (except the 4 s sliver, which joins)
    expect(phrases.some((p) => p.start === 64)).toBe(true);
    expect(phrases.some((p) => p.start === 112 && p.end === 116)).toBe(false);
    // a phrase ending on a section boundary is a cadence
    expect(phrases.find((p) => p.end === 64)?.cadence).toBe(true);
    expect(phrases.find((p) => p.end === 16)?.cadence).toBe(false);
    // the loud section breathes deeper
    expect(phrases.find((p) => p.start === 64)!.peak).toBeGreaterThan(phrases[0].peak);
  });

  it("the field is inhaled mid-phrase and exhaled + settled as each phrase lands", () => {
    const tl = conductBreath(synthetic(), "s")!;
    const cad = tl.phrases.find((p) => p.cadence && p.end === 64)!;
    const mid = breathAt(tl, cad.start + 0.5 * (cad.end - cad.start));
    const land = breathAt(tl, cad.end - 0.3);
    expect(mid.breath).toBeGreaterThan(0.3);
    expect(land.breath).toBeLessThan(-0.3);
    expect(land.settle).toBeGreaterThan(0.6);
    expect(mid.settle).toBeLessThan(0.2);
    // a cadence lands deeper than an inner phrase end
    const inner = tl.phrases.find((p) => !p.cadence && p.end > 20 && p.end < 64)!;
    expect(breathAt(tl, inner.end - 0.3).settle).toBeLessThan(land.settle);
  });
});

describe("breath — timeline laws", () => {
  it("is deterministic", () => {
    expect(conductBreath(synthetic(), "x")).toEqual(conductBreath(synthetic(), "x"));
  });

  it("the mastered journeys breathe too, each with its own strength knob (default 1)", () => {
    for (const id of ["first-snow", "ghost"]) {
      expect(BREATH_JOURNEY_STRENGTH[id]).toBe(1);
      expect(breathStrength(id)).toBe(1);
      const tl = conductBreath(PARTICLE_PROFILES[id], id);
      expect(tl).not.toBeNull();
      expect(Math.max(...tl!.amount)).toBe(1);
    }
    expect(breathStrength("any-other-journey")).toBe(1);
  });

  it("the strength knob scales the amount only (shape unchanged); 0 = off", () => {
    const full = conductBreath(synthetic(), "s")!, half = conductBreath(synthetic(), "s", 0.5)!;
    expect(half.breath).toEqual(full.breath);
    expect(half.settle).toEqual(full.settle);
    for (let i = 0; i < full.amount.length; i++) expect(half.amount[i]).toBeCloseTo(full.amount[i] * 0.5, 2);
    expect(conductBreath(synthetic(), "s", 0)).toBeNull();
    expect(breathAt(conductBreath(synthetic(), "s", 0), 100)).toEqual(NEUTRAL_BREATH);
  });

  it("degenerate input → null / neutral, never NaN", () => {
    expect(conductBreath({ duration: 0, sections: [] })).toBeNull();
    expect(conductBreath({ duration: 200, sections: [] })).toBeNull();
    const tl = conductBreath({ duration: 120, tempo: null, sections: [{ start: 0, end: 120, trend: "steady", intensity: NaN }] })!;
    for (let t = -5; t < 130; t += 0.7) for (const v of Object.values(breathAt(tl, t))) expect(Number.isFinite(v)).toBe(true);
    expect(breathAt(tl, NaN)).toEqual(NEUTRAL_BREATH);
  });

  for (const [id, p] of ALL) {
    it(`laws hold on ${p.name} (${id.slice(0, 13)})`, () => {
      const tl = conductBreath(p, id);
      if (!tl) { expect(p.duration < 60 || !p.sections.length).toBe(true); return; }
      const B = tl.breath, S = tl.settle, A = tl.amount;
      expect(B.length).toBe(Math.floor(p.duration / G) + 1);
      for (let i = 0; i < B.length; i++) {
        expect(B[i]).toBeGreaterThanOrEqual(-1); expect(B[i]).toBeLessThanOrEqual(1);
        expect(S[i]).toBeGreaterThanOrEqual(0); expect(S[i]).toBeLessThanOrEqual(1);
        expect(A[i]).toBeGreaterThanOrEqual(0); expect(A[i]).toBeLessThanOrEqual(1);
      }
      // SLEW: never faster than the law (per grid step)
      for (let i = 1; i < B.length; i++) {
        expect(Math.abs(B[i] - B[i - 1]), `${id} breath @${i * G}`).toBeLessThanOrEqual(L.MAX_RATE_PER_SEC * G + 0.0015);
        expect(Math.abs(S[i] - S[i - 1]), `${id} settle @${i * G}`).toBeLessThanOrEqual(L.SETTLE_RATE_PER_SEC * G + 0.0015);
      }
      // SEIZURE SAFETY: any visible change (half the range) takes ≥ MIN_CHANGE_SEC
      const win = L.MIN_CHANGE_SEC / G;
      for (let i = 0; i < B.length; i++) {
        for (let j = i + 1; j < Math.min(B.length, i + win); j++) {
          expect(Math.abs(B[j] - B[i])).toBeLessThan(1 + 1e-9);
          expect(Math.abs(S[j] - S[i])).toBeLessThan(0.5 + 1e-9);
        }
      }
      // NEVER ON THE BEAT: one breath per phrase — in ↔ out reversals (larger
      // than 0.005 per step) are ≥ MIN_TURN_SEC apart and each swing is a real
      // breath (≥ 0.4), never a flutter
      const turns: { t: number; v: number }[] = [];
      let dir = 0;
      for (let i = 1; i < B.length; i++) {
        const d = B[i] - B[i - 1];
        if (Math.abs(d) < 0.005) continue;
        const s = Math.sign(d);
        if (dir && s !== dir) turns.push({ t: i * G, v: B[i - 1] });
        dir = s;
      }
      for (let k = 1; k < turns.length; k++) {
        expect(turns[k].t - turns[k - 1].t, `${id} turn @${turns[k].t}`).toBeGreaterThanOrEqual(L.MIN_TURN_SEC);
        expect(Math.abs(turns[k].v - turns[k - 1].v), `${id} swing @${turns[k].t}`).toBeGreaterThanOrEqual(0.4);
      }
      // every breath is phrase-long
      for (const ph of tl.phrases) expect(ph.end - ph.start, `${id} phrase @${ph.start}`).toBeGreaterThanOrEqual(L.MIN_BREATH_SEC - 1e-9);
      // EMBLEMS UNTOUCHED: no breath through the opening emblem, none at the close
      for (let i = 0; i * G <= L.OPENING_END_SEC; i++) expect(A[i]).toBe(0);
      for (let i = Math.ceil((p.duration - L.END_CLEAR_SEC) / G); i < A.length; i++) expect(A[i]).toBe(0);
      // the amount eases (fade-in / fade-out ≥ 18 s), never above the journey's knob
      for (const a of A) expect(a).toBeLessThanOrEqual(breathStrength(id) + 1e-9);
      for (let i = 1; i < A.length; i++) expect(Math.abs(A[i] - A[i - 1])).toBeLessThanOrEqual((1.5 / L.FADE_IN_SEC) * G + 0.002);
      // it really breathes: a clear inhale and a clear landing while on
      const on = B.filter((_, i) => A[i] > 0.9 * breathStrength(id));
      expect(Math.max(...on)).toBeGreaterThan(0.4);
      expect(Math.min(...on)).toBeLessThan(-0.2);
      expect(breathSummary(tl)).toMatch(/^on: \d+ breaths/);
    });
  }
});

describe("breath — state", () => {
  it("no luminance channel exists; interpolates continuously", () => {
    const tl = conductBreath(synthetic(), "s")!;
    expect(Object.keys(breathAt(tl, 50)).sort()).toEqual(["amount", "breath", "settle"]);
    for (let t = 20; t < 170; t += 0.1) expect(Math.abs(breathAt(tl, t + 0.1).breath - breathAt(tl, t).breath)).toBeLessThanOrEqual(L.MAX_RATE_PER_SEC * 0.1 + 0.002);
  });
});

describe("breath — freedom", () => {
  it("figures breathe only as a slight scale; free souls fully", () => {
    for (const id of ["mandala", "girih", "rose", "lissajous"]) expect(breathFreedom(id)).toBeCloseTo(0.35, 5);
    for (const id of ["smoke", "pollen", "fireflies"]) expect(breathFreedom(id)).toBeCloseTo(1, 5);
    for (const id of SOUL_IDS) { expect(breathFreedom(id)).toBeGreaterThan(0); expect(breathFreedom(id)).toBeLessThanOrEqual(1); }
  });
});

describe("breath — flag", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
  it("on by default (Karel kept it); ?breath=1 turns it on and is kept for the session; ?breath=0 off", () => {
    expect(BREATH_DEFAULT).toBe(true);
    const st = mem();
    expect(breathEnabled("", st)).toBe(true);
    expect(breathEnabled("?breath=1", st)).toBe(true);
    expect(st.m.get(BREATH_SESSION_KEY)).toBe("1");
    expect(breathEnabled("?journey=x", st)).toBe(true);
    expect(breathEnabled("?breath=0", st)).toBe(false);
    expect(breathEnabled("", st)).toBe(false);
    expect(breathEnabled("?breath=1", null)).toBe(true);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(breathEnabled("", broken)).toBe(true);
    expect(breathEnabled("?breath=1", broken)).toBe(true);
  });
});

describe("breath — the shader", () => {
  const start = SIM_FS.indexOf("float brG = uBreath.x");
  const end = SIM_FS.indexOf("f.w += uBreath.z");
  const block = SIM_FS.slice(start, SIM_FS.indexOf("}", end) + 1);
  it("is one gated block in the sim, after the currents and before the image pull", () => {
    expect(start).toBeGreaterThan(SIM_FS.indexOf("f.xyz += fc * curG;"));
    expect(end).toBeLessThan(SIM_FS.indexOf("vec3 imgT = vec3(0.0);"));
    expect(block).toContain("(1.0 - uImgForm) * (1.0 - uImgShow)"); // images + emblems untouched
    expect(block).toContain("if (brG > 0.001)"); // off = skipped
  });
  it("is a FORCE only: never sets a position or velocity, never touches light, never the beat", () => {
    expect(block).not.toMatch(/(^|[^.\w])[pv]\s*[+\-*]?=(?!=)/m);
    expect(block).not.toMatch(/uAlpha|uGain|uDensity|uHue|uSat|oPos|oVel/);
    expect(block).not.toMatch(/uClock|uBands|uBandLv|uSwell|uTime|drv|lvl/);
    for (const src of [DRAW_VS, DRAW_FS, COMP_FS]) expect(src).not.toContain("uBreath");
  });
});
