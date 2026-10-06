import { describe, it, expect } from "vitest";
import {
  PARTICLE_LEADS,
  PARTICLE_JOURNEY_IDS,
  LANTERN_ID,
  STIR_CRAZY_ID,
  OPEN_JAM_ID,
  dissolveAllowed,
  MORPH_GUARD_SEC,
  particleLeadFor,
  particlePaletteFrom,
  withParticleLeadSupports,
} from "./particle-lead";
import { MASTERED_JOURNEYS, MASTERED_JOURNEY_NAMES } from "./mastered";
import { dissolveEnvelope, DISSOLVE_SEC, SOULS } from "@/lib/particles/souls";

describe("particle lead registry", () => {
  it("casts exactly the three review journeys", () => {
    expect(Object.keys(PARTICLE_LEADS).sort()).toEqual([LANTERN_ID, OPEN_JAM_ID, STIR_CRAZY_ID].sort());
    expect(PARTICLE_JOURNEY_IDS).toHaveLength(3);
    expect(particleLeadFor({ id: "9f7d1b51-aeac-4dfc-a39f-b00101a403f9", name: "Chemiluminescence 1" })).toBeNull();
  });

  it("never casts a mastered journey (Snowflake, Ghost)", () => {
    for (const [id, cast] of Object.entries(PARTICLE_LEADS)) {
      expect(MASTERED_JOURNEYS.has(id)).toBe(false);
      expect(MASTERED_JOURNEY_NAMES.has(cast.name.toLowerCase())).toBe(false);
    }
    for (const id of MASTERED_JOURNEYS) expect(particleLeadFor({ id })).toBeNull();
    expect(particleLeadFor({ id: LANTERN_ID, name: "Ghost" })).toBeNull();
    expect(particleLeadFor({ id: LANTERN_ID, name: "Snowflake" })).toBeNull();
  });

  it("the review set shares no soul — diversity at a glance", () => {
    const all = Object.values(PARTICLE_LEADS).flatMap((c) => Object.values(c.souls));
    expect(new Set(all).size).toBe(all.length);
    const ids = new Set(SOULS.map((s) => s.id));
    for (const s of all) expect(ids.has(s)).toBe(true);
  });

  it("palette comes from the journey palette, lifted to read as light", () => {
    const p = particlePaletteFrom({ primary: "#0e0b12", secondary: "#000000", accent: "#9b8fb5", glow: "#fbe6c2" })!;
    expect(Math.max(...p.low)).toBeGreaterThanOrEqual(0.549);
    expect(Math.max(...p.high)).toBeGreaterThanOrEqual(0.699);
    expect(particlePaletteFrom(null)).toBeNull();
  });

  it("strips dual + tertiary only while particles lead", () => {
    const f = { shaderMode: "a", dualShaderMode: "b", tertiaryShaderMode: "c" };
    const cast = PARTICLE_LEADS[LANTERN_ID];
    expect(withParticleLeadSupports(f, cast)).toEqual({ shaderMode: "a", dualShaderMode: undefined, tertiaryShaderMode: undefined });
    expect(withParticleLeadSupports(f, null)).toBe(f);
  });
});

describe("dissolve: only some transitions, never fighting a morph", () => {
  const ok = { inTransitionWindow: true, windowAlreadyDissolved: false, sincePhaseChange: 30, boundarySettle: false };
  it("opens once inside a conducted transition window", () => {
    expect(dissolveAllowed(ok)).toBe(true);
    expect(dissolveAllowed({ ...ok, windowAlreadyDissolved: true })).toBe(false);
    expect(dissolveAllowed({ ...ok, inTransitionWindow: false })).toBe(false);
  });
  it("never during a travel morph (they ride phase changes) or a handoff", () => {
    expect(dissolveAllowed({ ...ok, boundarySettle: true })).toBe(false);
    expect(dissolveAllowed({ ...ok, sincePhaseChange: 3 })).toBe(false);
    expect(dissolveAllowed({ ...ok, sincePhaseChange: MORPH_GUARD_SEC - 1 })).toBe(false);
    expect(dissolveAllowed({ ...ok, sincePhaseChange: MORPH_GUARD_SEC + 1 })).toBe(true);
    expect(dissolveAllowed({ ...ok, untilPhaseChange: 6 })).toBe(false);
  });
  it("envelope is continuous (no abrupt step anywhere)", () => {
    let prev = dissolveEnvelope(0);
    for (let t = 0.01; t <= DISSOLVE_SEC + 0.2; t += 0.01) {
      const cur = dissolveEnvelope(t);
      for (const k of ["worldFade", "imgShow", "imgForm", "colorMix"] as const) {
        if (k === "colorMix" && t >= DISSOLVE_SEC) continue;
        expect(Math.abs(cur[k] - prev[k])).toBeLessThan(0.04);
      }
      prev = cur;
    }
  });
  it("the snap is invisible: image presence is 0 when the field teleports", () => {
    expect(dissolveEnvelope(0.6).imgShow).toBeLessThan(0.01);
    expect(dissolveEnvelope(0.6).worldFade).toBeLessThan(0.01);
  });
});
