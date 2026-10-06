import { describe, it, expect } from "vitest";
import {
  castJourney,
  castSet,
  presenceAt,
  presenceFraction,
  colorAt,
  playfulnessOf,
  darknessOf,
  type ParticleProfile,
} from "./particle-casting";
import { PARTICLE_PROFILES } from "./particle-profiles.generated";
import { LANTERN_ID, STIR_CRAZY_ID, OPEN_JAM_ID } from "./particle-lead";
import { SOULS, SOUL_IDS } from "@/lib/particles/souls";

const profiles = Object.values(PARTICLE_PROFILES);
const reviewProfiles = [LANTERN_ID, STIR_CRAZY_ID, OPEN_JAM_ID].map((id) => PARTICLE_PROFILES[id]);

describe("soul library", () => {
  it("is a tremendous palette: 28 distinct souls, indices = shader branches", () => {
    expect(SOULS.length).toBeGreaterThanOrEqual(25);
    expect(SOULS.map((s) => s.index)).toEqual(SOULS.map((_, i) => i));
    expect(new Set(SOULS.map((s) => s.id)).size).toBe(SOULS.length);
    expect(SOULS.map((s) => s.id)).toEqual([...SOUL_IDS]);
  });
  it("never names the banned imagery (ice/frost/crystal, rain, lightning)", () => {
    for (const s of SOULS) expect(`${s.id} ${s.title} ${s.line}`).not.toMatch(/\bice\b|frost|crystal|\brain\b|lightning/i);
  });
});

describe("conducting — restraint (every journey)", () => {
  it("every journey rests most of the time and keeps a summit + coda", () => {
    for (const p of profiles) {
      const c = castJourney(p);
      const f = presenceFraction(c, p.duration);
      expect(f, p.name).toBeLessThanOrEqual(0.4); // + runtime morph-end emergences
      expect(c.windows.some((w) => w.kind === "peak"), p.name).toBe(true);
      expect(c.windows.some((w) => w.kind === "coda"), p.name).toBe(true);
      for (const x of p.phaseBounds ?? []) for (const b of c.breaks) expect(x >= b.end + 1 - 1e-6 || x <= b.start - 14 + 1e-6, p.name).toBe(true);
    }
  });
  it("colour travels through the journey's OWN palette: voicing changes every section, hue drift stays small", () => {
    for (const p of profiles.filter((x) => x.sections.length >= 3)) {
      const cs = castJourney(p).colors;
      for (let i = 1; i < cs.length; i++) expect(cs[i].voice, `${p.name} §${i}`).not.toBe(cs[i - 1].voice);
      expect(new Set(cs.map((c) => c.voice)).size, p.name).toBeGreaterThanOrEqual(2);
      for (const c of cs) expect(Math.abs(c.hue), p.name).toBeLessThanOrEqual(0.12);
    }
  });
});

describe("conducting — review set detail", () => {
  for (const p of reviewProfiles) {
    const cast = castJourney(p);
    it(`${p.name}: conducted windows stay sparse (≤ 40%)`, () => {
      expect(presenceFraction(cast, p.duration)).toBeLessThanOrEqual(0.4);
      expect(presenceFraction(cast, p.duration)).toBeGreaterThan(0.12);
    });
    it(`${p.name}: has the summit, a coda, and 1–3 particle-only breaks`, () => {
      expect(cast.windows.some((w) => w.kind === "peak")).toBe(true);
      expect(cast.windows.some((w) => w.kind === "coda")).toBe(true);
      expect(cast.breaks.length).toBeGreaterThanOrEqual(1);
      expect(cast.breaks.length).toBeLessThanOrEqual(3);
      for (const b of cast.breaks) {
        expect(b.start).toBeGreaterThan(25);
        expect(b.end).toBeLessThan(p.duration - 20);
        expect(b.end - b.start).toBeLessThanOrEqual(10); // a few seconds, a breath
      }
    });
    it(`${p.name}: windows never overlap and presence/veil ramp smoothly`, () => {
      const ws = cast.windows;
      for (let i = 1; i < ws.length; i++) expect(ws[i].start).toBeGreaterThanOrEqual(ws[i - 1].end - 1e-6);
      let prev = presenceAt(cast, 0);
      for (let t = 0.05; t < p.duration; t += 0.05) {
        const cur = presenceAt(cast, t);
        expect(Math.abs(cur.presence - prev.presence)).toBeLessThan(0.05);
        expect(Math.abs(cur.breakVeil - prev.breakVeil)).toBeLessThan(0.05);
        prev = cur;
      }
    });
    it(`${p.name}: breaks and transitions stay clear of the phase changes (travel morphs)`, () => {
      for (const x of p.phaseBounds ?? []) {
        // a break never contains a phase change and starts ≥14 s after one
        for (const b of cast.breaks) expect(x >= b.end + 1 || x <= b.start - 14).toBe(true);
      }
    });
    it(`${p.name}: keeps some image transitions (Karel liked those)`, () => {
      expect(cast.windows.filter((w) => w.kind === "transition").length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("casting from analysis", () => {
  const lantern = PARTICLE_PROFILES[LANTERN_ID];
  const stir = PARTICLE_PROFILES[STIR_CRAZY_ID];
  const jam = PARTICLE_PROFILES[OPEN_JAM_ID];
  it("the rhythmic piece is playful, the devotional and brooding ones are calm", () => {
    expect(playfulnessOf(stir)).toBeGreaterThan(0.6);
    expect(playfulnessOf(lantern)).toBeLessThan(0.4);
    expect(playfulnessOf(jam)).toBeLessThan(0.4);
    expect(castJourney(stir).rhythmic).toBe(true);
  });
  it("the brooding minor piece reads darker than the devotional major one", () => {
    expect(darknessOf(jam)).toBeGreaterThan(darknessOf(lantern));
  });
  it("colour follows harmony: a minor section turns cooler than a major one", () => {
    const base: ParticleProfile = { ...lantern, sections: [
      { ...lantern.sections[0], start: 0, end: 10, major: 0.7, minor: 0.1, localKey: lantern.key },
      { ...lantern.sections[0], start: 10, end: 20, major: 0.1, minor: 0.7, localKey: lantern.key },
    ] };
    const c = castJourney(base);
    expect(colorAt(c, 15).hue).toBeGreaterThan(colorAt(c, 5).hue);
  });
  it("neighbours in the loop never share a soul", () => {
    const set = castSet([lantern, jam, stir]);
    for (let i = 1; i < set.length; i++) {
      const a = new Set(Object.values(set[i - 1].souls));
      for (const s of Object.values(set[i].souls)) expect(a.has(s)).toBe(false);
    }
  });
  it("is deterministic", () => {
    expect(castJourney(lantern)).toEqual(castJourney(lantern));
  });
});
