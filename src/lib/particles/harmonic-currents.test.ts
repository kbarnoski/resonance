/**
 * HARMONIC CURRENTS — the laws (harmonic-currents.ts), on every journey's baked
 * deep-analysis profile (always present in the kiosk build).
 */
import { describe, it, expect } from "vitest";
import {
  conductCurrents, currentAt, clearestRelease, createTide, tideStep, withTide, currentsEnabled, currentFreedom,
  CURRENTS_DEFAULT, CURRENTS_LAWS, CURRENTS_LOCKED_JOURNEYS, CURRENTS_SESSION_KEY, NEUTRAL_CURRENT,
  type CurrentInput,
} from "./harmonic-currents";
import { PARTICLE_PROFILES } from "@/lib/journeys/particle-profiles.generated";
import { SOUL_IDS, SHAPE_SOULS } from "./souls";
import { SIM_FS, DRAW_VS, DRAW_FS, COMP_FS } from "./shaders";

const L = CURRENTS_LAWS;
const ALL = Object.entries(PARTICLE_PROFILES);

/** A synthetic piece: quiet major opening, a dense minor build with a key
 *  change into a climax at 120 s, then a long major release. */
function synthetic(): CurrentInput {
  const curve: [number, number][] = [];
  for (let t = 0; t <= 200; t += 5) curve.push([t, t < 60 ? 0.25 : t <= 120 ? 0.25 + ((t - 60) / 60) * 0.7 : Math.max(0.15, 0.95 - ((t - 120) / 40) * 0.8)]);
  return {
    duration: 200,
    climaxTime: 120,
    curve,
    sections: [
      { start: 0, end: 60, trend: "steady", intensity: 0.3, onsetRate: 2, localKey: "C Major", major: 0.6, minor: 0.1, suspended: 0.1, diminished: 0 },
      { start: 60, end: 90, trend: "building", intensity: 0.7, onsetRate: 4, localKey: "A Minor", major: 0.2, minor: 0.5, suspended: 0.15, diminished: 0.1 },
      { start: 90, end: 125, trend: "building", intensity: 1, onsetRate: 5, localKey: "E Minor", major: 0.15, minor: 0.55, suspended: 0.1, diminished: 0.15 },
      { start: 125, end: 200, trend: "receding", intensity: 0.3, onsetRate: 1.5, localKey: "C Major", major: 0.65, minor: 0.1, suspended: 0.05, diminished: 0 },
    ],
  };
}

describe("harmonic currents — timeline", () => {
  it("tension gathers into the dense minor build and the climax, and opens after it", () => {
    const tl = conductCurrents(synthetic(), "synthetic")!;
    expect(tl).not.toBeNull();
    const at = (t: number) => currentAt(tl, t).tension;
    expect(at(110)).toBeGreaterThan(0.7);
    expect(at(40)).toBeLessThan(0.4);
    expect(at(165)).toBeLessThan(0.3);
    expect(at(110) - at(165)).toBeGreaterThan(0.5);
    const rel = clearestRelease(tl)!;
    expect(rel.from).toBeGreaterThan(95);
    expect(rel.from).toBeLessThan(135);
    expect(rel.drop).toBeGreaterThan(0.5);
    expect(tl.marks.some((m) => m.kind === "gather" && m.t > 95 && m.t < 135)).toBe(true);
    expect(tl.marks.some((m) => m.kind === "open" && m.t > 125)).toBe(true);
  });

  it("is deterministic", () => {
    const a = conductCurrents(synthetic(), "x"), b = conductCurrents(synthetic(), "x");
    expect(a).toEqual(b);
  });

  it("the mastered journeys are never carried (null timeline → neutral state)", () => {
    for (const id of ["first-snow", "ghost"]) {
      expect(CURRENTS_LOCKED_JOURNEYS.has(id)).toBe(true);
      expect(conductCurrents(PARTICLE_PROFILES[id], id)).toBeNull();
      expect(currentAt(conductCurrents(PARTICLE_PROFILES[id], id), 100)).toEqual(NEUTRAL_CURRENT);
    }
  });

  it("degenerate input → null / neutral, never NaN", () => {
    expect(conductCurrents({ duration: 0, sections: [], curve: [] })).toBeNull();
    expect(conductCurrents({ duration: 200, sections: [], curve: [] })).toBeNull();
    const tl = conductCurrents({ duration: 120, sections: [{ start: 0, end: 120, trend: "steady", intensity: 0.5 }], curve: [] })!;
    for (let t = -5; t < 130; t += 0.7) {
      const s = currentAt(tl, t);
      for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true);
    }
    expect(currentAt(tl, NaN)).toEqual(NEUTRAL_CURRENT);
  });

  for (const [id, p] of ALL) {
    if (CURRENTS_LOCKED_JOURNEYS.has(id)) continue;
    it(`laws hold on ${p.name} (${id.slice(0, 13)})`, () => {
      const tl = conductCurrents(p, id);
      if (!tl) { expect(p.duration < 60 || !p.sections.length).toBe(true); return; }
      const T = tl.tension, A = tl.amount;
      expect(T.length).toBe(Math.floor(p.duration / L.GRID_SEC) + 1);
      for (let i = 0; i < T.length; i++) {
        expect(T[i]).toBeGreaterThanOrEqual(0);
        expect(T[i]).toBeLessThanOrEqual(1);
        expect(A[i]).toBeGreaterThanOrEqual(0);
        expect(A[i]).toBeLessThanOrEqual(1);
      }
      // NEVER PER-BEAT: the character never moves faster than the slew law
      for (let i = 1; i < T.length; i++) expect(Math.abs(T[i] - T[i - 1]), `${id} @${i}`).toBeLessThanOrEqual(L.MAX_RATE_PER_SEC * L.GRID_SEC + 0.0015);
      // …so a visible change (half the range) takes ≥ MIN_SWING_SEC
      for (let i = 0; i < T.length; i++) {
        for (let j = i + 1; j < Math.min(T.length, i + L.MIN_SWING_SEC / L.GRID_SEC); j++) expect(Math.abs(T[j] - T[i])).toBeLessThan(0.5 + 1e-9);
      }
      // no beat-scale wobble: within any 8 s the curve turns at most once (no
      // up-down-up flicker) — counting direction reversals larger than 0.01
      for (let i = 0; i + 8 < T.length; i++) {
        let turns = 0, dir = 0;
        for (let j = i + 1; j <= i + 8; j++) {
          const d = T[j] - T[j - 1];
          if (Math.abs(d) < 0.01) continue;
          const s = Math.sign(d);
          if (dir && s !== dir) turns++;
          dir = s;
        }
        expect(turns, `${id} wobble @${i}`).toBeLessThanOrEqual(1);
      }
      // EMBLEMS UNTOUCHED: no current through the opening emblem, none at the close
      for (let t = 0; t <= L.OPENING_END_SEC; t++) expect(A[t]).toBe(0);
      for (let t = Math.ceil(p.duration - L.END_CLEAR_SEC); t < A.length; t++) expect(A[t]).toBe(0);
      // the amount itself eases (fade-in / fade-out ≥ 18 s)
      for (let i = 1; i < A.length; i++) expect(Math.abs(A[i] - A[i - 1])).toBeLessThanOrEqual(1.5 / L.FADE_IN_SEC + 0.002);
      // music has a shape: every non-trivial track gets a real tension → release somewhere
      const rel = clearestRelease(tl);
      expect(rel).not.toBeNull();
    });
  }

  it("most journeys have a strong (≥ 0.5) tension → release to see", () => {
    const strong = ALL.filter(([id, p]) => (clearestRelease(conductCurrents(p, id))?.drop ?? 0) >= 0.5).length;
    expect(strong / (ALL.length - 2)).toBeGreaterThan(0.7);
  });
});

describe("harmonic currents — state", () => {
  it("layering follows tension; no luminance channel exists", () => {
    const tl = conductCurrents(synthetic(), "s")!;
    const hi = currentAt(tl, 115), lo = currentAt(tl, 170);
    expect(hi.layering).toBeGreaterThan(lo.layering);
    expect(Object.keys(hi).sort()).toEqual(["amount", "layering", "tension"]);
  });

  it("interpolates continuously between grid points", () => {
    const tl = conductCurrents(synthetic(), "s")!;
    for (let t = 20; t < 170; t += 0.1) expect(Math.abs(currentAt(tl, t + 0.1).tension - currentAt(tl, t).tension)).toBeLessThanOrEqual(L.MAX_RATE_PER_SEC * 0.1 + 0.002);
  });
});

describe("harmonic currents — the tide", () => {
  it("is slow: a sudden full-scale level jump moves the tide ≤ 0.2 per second", () => {
    const tide = createTide();
    for (let i = 0; i < 600; i++) tideStep(tide, 0.2, 0.1); // settle
    let prev = tideStep(tide, 0.2, 0.1);
    for (let i = 0; i < 300; i++) {
      const k = tideStep(tide, 0.9, 0.1);
      expect(Math.abs(k - prev)).toBeLessThanOrEqual(0.02 + 1e-9); // per 0.1 s
      prev = k;
    }
    expect(prev).toBeGreaterThan(0.3); // a long swell does lean it
  });

  it("returns to zero on a steady level, survives NaN / huge dt", () => {
    const tide = createTide();
    for (let i = 0; i < 6000; i++) tideStep(tide, 0.4, 0.1);
    expect(Math.abs(tideStep(tide, 0.4, 0.1))).toBeLessThan(0.01);
    expect(Number.isFinite(tideStep(tide, NaN, 5))).toBe(true);
  });

  it("leans the state within its reach, never past 0..1", () => {
    const s = { amount: 0.9, tension: 0.95, layering: 0.965 };
    const up = withTide(s, 1), down = withTide(s, -1);
    expect(up.tension).toBeLessThanOrEqual(1);
    expect(up.amount).toBeLessThanOrEqual(1);
    expect(s.tension - down.tension).toBeCloseTo(L.TIDE_TENSION, 5);
    expect(withTide({ amount: 0, tension: 0, layering: 0.3 }, 1).amount).toBe(0); // off stays off
  });
});

describe("harmonic currents — freedom", () => {
  it("geometric figures feel nothing; the volume souls are fully carried", () => {
    for (const id of ["mandala", "girih", "medallion", "kaleido", "rose", "lissajous", "rings", "torus", "harmonics", "blossom", "spirit"]) expect(currentFreedom(id)).toBe(0);
    for (const id of ["smoke", "pollen", "fireflies", "duststorm", "ink", "nebula"]) expect(currentFreedom(id)).toBe(1);
    for (const id of SOUL_IDS) { expect(currentFreedom(id)).toBeGreaterThanOrEqual(0); expect(currentFreedom(id)).toBeLessThanOrEqual(1); }
    // the journeys' rotation has free souls to carry
    expect(SHAPE_SOULS.filter((s) => currentFreedom(s) > 0.5).length).toBeGreaterThanOrEqual(8);
  });
});

describe("harmonic currents — flag", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
  it("on by default (Karel kept it 2026-10-13); ?currents=1 turns it on and is kept for the session; ?currents=0 off", () => {
    expect(CURRENTS_DEFAULT).toBe(true);
    const st = mem();
    expect(currentsEnabled("", st)).toBe(true);
    expect(currentsEnabled("?currents=1", st)).toBe(true);
    expect(st.m.get(CURRENTS_SESSION_KEY)).toBe("1");
    expect(currentsEnabled("?journey=x", st)).toBe(true);
    expect(currentsEnabled("?currents=0", st)).toBe(false);
    expect(currentsEnabled("", st)).toBe(false);
    expect(currentsEnabled("?currents=1", null)).toBe(true);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(currentsEnabled("", broken)).toBe(true);
    expect(currentsEnabled("?currents=1", broken)).toBe(true);
  });
});

describe("harmonic currents — the shader", () => {
  const start = SIM_FS.indexOf("float curG = uCur.x");
  const end = SIM_FS.indexOf("f.xyz += fc * curG;");
  const block = SIM_FS.slice(start, end + 20);
  it("is one gated block in the sim, after the hover and before the image pull", () => {
    expect(start).toBeGreaterThan(SIM_FS.indexOf("f.w = mix(f.w, 1.6, uHover);"));
    expect(end).toBeLessThan(SIM_FS.indexOf("vec3 imgT = vec3(0.0);"));
    expect(block).toContain("(1.0 - uImgForm) * (1.0 - uImgShow)"); // images + emblems untouched
    expect(block).toContain("if (curG > 0.001)"); // off = skipped
  });
  it("is a FORCE only: never sets a position or velocity, never touches light", () => {
    expect(block).not.toMatch(/(^|[^.\w])[pv]\s*[+\-*]?=(?!=)/m);
    expect(block).not.toMatch(/uAlpha|uGain|uDensity|uHue|uSat|oPos|oVel/);
    // its clock is its own (steady), never the music's dilated clocks or bands
    expect(block).not.toMatch(/uClock|uBands|uBandLv|uSwell|drv|lvl/);
    for (const src of [DRAW_VS, DRAW_FS, COMP_FS]) expect(src).not.toContain("uCur");
  });
});
