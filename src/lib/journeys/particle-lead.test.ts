import { describe, it, expect } from "vitest";
import {
  PARTICLE_LEADS,
  LANTERN_ID,
  LANTERN_ARC,
  arcAt,
  dissolveAllowed,
  particleLeadFor,
  soulForPhase,
  particlePaletteFrom,
  withParticleLeadSupports,
} from "./particle-lead";
import { dissolveEnvelope, DISSOLVE_SEC } from "@/lib/particles/souls";
import { MASTERED_JOURNEYS, MASTERED_JOURNEY_NAMES } from "./mastered";
import { SOULS } from "@/lib/particles/souls";

describe("particle lead casting", () => {
  it("is opt-in for exactly ONE pilot journey: Lantern", () => {
    expect(Object.keys(PARTICLE_LEADS)).toEqual([LANTERN_ID]);
    expect(PARTICLE_LEADS[LANTERN_ID].name).toBe("Lantern");
    expect(particleLeadFor({ id: "9f7d1b51-aeac-4dfc-a39f-b00101a403f9", name: "Chemiluminescence 1" })).toBeNull();
    expect(particleLeadFor({ id: "4fda2ae1-d3a7-4e23-b5ca-8f696b537ad1", name: "Tranquility 36" })).toBeNull();
  });

  it("never casts a mastered journey (Snowflake, Ghost)", () => {
    for (const [id, cast] of Object.entries(PARTICLE_LEADS)) {
      expect(MASTERED_JOURNEYS.has(id)).toBe(false);
      expect(MASTERED_JOURNEY_NAMES.has(cast.name.toLowerCase())).toBe(false);
    }
    for (const id of MASTERED_JOURNEYS) expect(particleLeadFor({ id })).toBeNull();
    // even a listed id refuses when it plays under a mastered name
    const anyId = Object.keys(PARTICLE_LEADS)[0];
    expect(particleLeadFor({ id: anyId, name: "Ghost" })).toBeNull();
    expect(particleLeadFor({ id: anyId, name: "Snowflake" })).toBeNull();
  });

  it("unlisted journeys get nothing", () => {
    expect(particleLeadFor({ id: "not-a-journey", name: "Rolling 2" })).toBeNull();
    expect(particleLeadFor(null)).toBeNull();
  });

  it("souls are real and follow the phase arc", () => {
    const ids = new Set(SOULS.map((s) => s.id));
    for (const cast of Object.values(PARTICLE_LEADS)) for (const s of cast.souls) expect(ids.has(s)).toBe(true);
    const cast = { name: "x", souls: ["murmuration", "smoke", "vortex"] as const };
    expect(soulForPhase(cast, "threshold")).toBe("murmuration");
    expect(soulForPhase(cast, "transcendence")).toBe("vortex");
    expect(soulForPhase(cast, "return")).toBe("smoke"); // index 4 wraps to 1
    expect(soulForPhase(cast, "bogus")).toBe("murmuration");
  });

  it("palette comes from the journey palette, lifted to read as light", () => {
    const p = particlePaletteFrom({ primary: "#0e0b12", secondary: "#000000", accent: "#9b8fb5", glow: "#fbe6c2" })!;
    expect(Math.max(...p.low)).toBeGreaterThanOrEqual(0.549);
    expect(Math.max(...p.high)).toBeGreaterThanOrEqual(0.699);
    expect(particlePaletteFrom(null)).toBeNull();
  });

  it("strips dual + tertiary only while particles lead", () => {
    const f = { shaderMode: "a", dualShaderMode: "b", tertiaryShaderMode: "c" };
    const cast = Object.values(PARTICLE_LEADS)[0];
    expect(withParticleLeadSupports(f, cast)).toEqual({ shaderMode: "a", dualShaderMode: undefined, tertiaryShaderMode: undefined });
    expect(withParticleLeadSupports(f, null)).toBe(f);
  });
});

describe("Lantern arc (from its v2 deep analysis)", () => {
  it("is sparse in the opening and valleys, a swarm on builds, full at the summit, one ember at the end", () => {
    expect(arcAt(LANTERN_ARC, 5)).toMatchObject({ soul: "motes" });
    expect(arcAt(LANTERN_ARC, 5).density).toBeLessThan(0.02);
    expect(arcAt(LANTERN_ARC, 45).soul).toBe("murmuration");
    expect(arcAt(LANTERN_ARC, 85).soul).toBe("motes");
    expect(arcAt(LANTERN_ARC, 140).soul).toBe("motes");
    const summit = arcAt(LANTERN_ARC, 221); // D♭maj13
    expect(summit.soul).toBe("vortex");
    expect(summit.density).toBeGreaterThan(0.9);
    expect(arcAt(LANTERN_ARC, 305)).toEqual({ soul: "motes", density: 0 });
  });
  it("keys are time-ordered", () => {
    for (let i = 1; i < LANTERN_ARC.length; i++) expect(LANTERN_ARC[i].t).toBeGreaterThan(LANTERN_ARC[i - 1].t);
  });
});

describe("dissolve restraint + envelope", () => {
  const ok = { t: 60, duration: 308, density: 0.1, sinceLastDissolve: 30, sincePhaseChange: 30, morphActive: false, boundarySettle: false };
  it("allows a calm mid-phase still change", () => expect(dissolveAllowed(ok)).toBe(true));
  it("never fights a travel morph, a handoff, or a phase change", () => {
    expect(dissolveAllowed({ ...ok, morphActive: true })).toBe(false);
    expect(dissolveAllowed({ ...ok, boundarySettle: true })).toBe(false);
    expect(dissolveAllowed({ ...ok, sincePhaseChange: 3 })).toBe(false);
  });
  it("keeps restraint: spacing, summit, opening, ending", () => {
    expect(dissolveAllowed({ ...ok, sinceLastDissolve: 10 })).toBe(false);
    expect(dissolveAllowed({ ...ok, density: 1 })).toBe(false);
    expect(dissolveAllowed({ ...ok, t: 5 })).toBe(false);
    expect(dissolveAllowed({ ...ok, t: 300 })).toBe(false);
  });
  it("envelope is continuous (no abrupt step anywhere)", () => {
    let prev = dissolveEnvelope(0);
    for (let t = 0.01; t <= DISSOLVE_SEC + 0.2; t += 0.01) {
      const cur = dissolveEnvelope(t);
      for (const k of ["worldFade", "imgShow", "imgForm", "colorMix"] as const) {
        // colorMix may reset to 0 after the end, when imgShow is already 0
        if (k === "colorMix" && t >= DISSOLVE_SEC) continue;
        expect(Math.abs(cur[k] - prev[k])).toBeLessThan(0.04);
      }
      prev = cur;
    }
    expect(dissolveEnvelope(null)).toEqual({ worldFade: 1, imgShow: 0, imgForm: 0, colorMix: 0 });
  });
  it("the snap is invisible: image presence is 0 when the field teleports", () => {
    expect(dissolveEnvelope(0.6).imgShow).toBeLessThan(0.01);
    expect(dissolveEnvelope(0.6).worldFade).toBeLessThan(0.01);
  });
});
