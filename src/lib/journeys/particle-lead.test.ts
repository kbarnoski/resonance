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
  withParticleLeadSupports, PARTICLES_ENABLED, JOURNEY_SIGNATURES, particlePaletteFromImage, particlePaletteFire } from "./particle-lead";
import { MASTERED_JOURNEYS, MASTERED_JOURNEY_NAMES } from "./mastered";
import { dissolveEnvelope, DISSOLVE_SEC, DISSOLVE_SNAP_SEC, SHAPE_SOULS } from "@/lib/particles/souls";
import { TRAMOKYO_SETLIST } from "./installation-sequence";

describe("particle lead registry (v3 rollout)", () => {
  it("casts every profiled journey — the whole kiosk loop", () => {
    expect(PARTICLE_JOURNEY_IDS.length).toBeGreaterThanOrEqual(100);
    for (const id of TRAMOKYO_SETLIST) expect(PARTICLE_LEADS[id], id).toBeTruthy();
    for (const id of [LANTERN_ID, OPEN_JAM_ID, STIR_CRAZY_ID]) expect(PARTICLE_LEADS[id]).toBeTruthy();
  });

  it.skipIf(!PARTICLES_ENABLED)("Snowflake + Ghost get the particle layer ONLY (flagged mastered — shaders untouched)", () => {
    for (const id of MASTERED_JOURNEYS) {
      const cast = particleLeadFor({ id });
      expect(cast, id).toBeTruthy();
      expect(cast!.mastered).toBe(true);
      const f = { shaderMode: "a", dualShaderMode: "b", tertiaryShaderMode: "c" };
      expect(withParticleLeadSupports(f, cast, true)).toBe(f);
    }
    // a path row wrapping a mastered built-in is protected by name too
    expect(particleLeadFor({ id: LANTERN_ID, name: "Ghost" })!.mastered).toBe(true);
    expect(MASTERED_JOURNEY_NAMES.has("snowflake")).toBe(true);
  });

  it("only gathering SHAPE souls are cast — no full-volume swarms (journey signatures aside)", () => {
    for (const c of Object.values(PARTICLE_LEADS)) {
      for (const s of [...Object.values(c.souls), ...c.morphSouls, ...c.formCycle]) expect(SHAPE_SOULS, `${c.name}:${s}`).toContain(s);
    }
  });

  it("never the tree or the cube (Karel 2026-10-05)", () => {
    expect(SHAPE_SOULS).not.toContain("branches");
    expect(SHAPE_SOULS).not.toContain("geometry");
    for (const c of Object.values(PARTICLE_LEADS)) {
      for (const s of [...Object.values(c.souls), ...c.morphSouls]) expect(["branches", "geometry"], `${c.name}:${s}`).not.toContain(s);
    }
  });

  it("Ghost forms its ANGEL (the real angel image) at transcendence + integration — no figurative spirit", () => {
    const g = PARTICLE_LEADS["ghost"];
    expect(g.signatureImage).toBe("angel");
    expect(g.signatureMorphs).toEqual([2, 5]);
    expect(JOURNEY_SIGNATURES["ghost"].image).toBe("angel");
    for (const c of Object.values(PARTICLE_LEADS)) expect([...c.morphSouls, ...c.formCycle]).not.toContain("spirit");
  });

  it("the full-screen still dissolve is rare: about one journey in five, never mastered", () => {
    const all = Object.values(PARTICLE_LEADS);
    const on = all.filter((c) => c.dissolve);
    expect(on.length / all.length).toBeLessThan(0.3);
    for (const c of on) expect(c.mastered).toBe(false);
  });

  it("loop neighbours never share a lead (peak) form, and morph forms change every phase", () => {
    const ids = PARTICLE_JOURNEY_IDS;
    for (let i = 1; i < ids.length; i++) {
      expect(PARTICLE_LEADS[ids[i]].souls.peak, `${PARTICLE_LEADS[ids[i - 1]].name} → ${PARTICLE_LEADS[ids[i]].name}`).not.toBe(PARTICLE_LEADS[ids[i - 1]].souls.peak);
    }
    for (const c of Object.values(PARTICLE_LEADS)) for (let i = 1; i < c.morphSouls.length; i++) expect(c.morphSouls[i]).not.toBe(c.morphSouls[i - 1]);
  });

  it("the whole library gets used across the set (diversity)", () => {
    const used = new Set(Object.values(PARTICLE_LEADS).flatMap((c) => [...Object.values(c.souls), ...c.morphSouls]));
    expect(used.size).toBeGreaterThanOrEqual(12);
  });

  it("palette comes from the journey palette, lifted to read as light", () => {
    const p = particlePaletteFrom({ primary: "#0e0b12", secondary: "#000000", accent: "#9b8fb5", glow: "#fbe6c2" })!;
    expect(Math.max(...p.low)).toBeGreaterThanOrEqual(0.549);
    expect(Math.max(...p.high)).toBeGreaterThanOrEqual(0.699);
    expect(particlePaletteFrom(null)).toBeNull();
  });

  it("strips dual + tertiary only while particles are present", () => {
    const f = { shaderMode: "a", dualShaderMode: "b", tertiaryShaderMode: "c" };
    const cast = PARTICLE_LEADS[LANTERN_ID];
    // supports are never stripped any more (fade-out stutter, 2026-10-06)
    expect(withParticleLeadSupports(f, cast, true)).toBe(f);
    expect(withParticleLeadSupports(f, cast, false)).toBe(f);
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
    expect(dissolveEnvelope(DISSOLVE_SNAP_SEC).imgShow).toBeLessThan(0.01);
    expect(dissolveEnvelope(DISSOLVE_SNAP_SEC).worldFade).toBeLessThan(0.01);
  });
});

describe("particle colour comes from the journey's IMAGES (Karel 2026-10-06)", () => {
  it("every particle journey has an image palette with a key colour", async () => {
    const { JOURNEY_IMAGE_PALETTES } = await import("@/lib/particles/journey-palettes.generated");
    for (const id of Object.keys(PARTICLE_LEADS)) {
      expect(JOURNEY_IMAGE_PALETTES[id]?.key, id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("Realized reads amber: its key colour is warm (red-orange hue)", async () => {
    const { JOURNEY_IMAGE_PALETTES } = await import("@/lib/particles/journey-palettes.generated");
    const pal = particlePaletteFromImage(JOURNEY_IMAGE_PALETTES["inferno"], 0)!;
    const [r, g, b] = pal.low;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});

describe("particles echo the IMAGERY (Karel 2026-10-06 design principle)", () => {
  it("only organic forms are cast — never 3-D ellipses, squares, the tree or the cube", async () => {
    const { BANNED_SOULS } = await import("./particle-motifs");
    for (const c of Object.values(PARTICLE_LEADS)) {
      for (const s of [...Object.values(c.souls), ...c.morphSouls, ...c.formCycle, ...c.windows.map((w) => w.soul), ...(c.phaseChars ?? []).flatMap((p) => p.forms)]) {
        expect(BANNED_SOULS, `${c.name}:${s}`).not.toContain(s);
      }
    }
  });
  it("Realized (lava, fire, embers) casts FLAMES with the fire colour ramp", () => {
    const r = PARTICLE_LEADS["inferno"];
    expect(r.phaseChars?.length).toBeGreaterThan(0);
    expect(r.phaseChars!.filter((p) => p.forms[0] === "flame").length).toBeGreaterThanOrEqual(3);
    expect(r.phaseChars!.some((p) => p.fire)).toBe(true);
  });
  it("Ghost (petals, wings) casts floral / airy forms, never flames", () => {
    const g = PARTICLE_LEADS["ghost"];
    const forms = (g.phaseChars ?? []).flatMap((p) => p.forms);
    expect(forms).not.toContain("flame");
    expect(forms.some((f) => ["blossom", "petalfall", "ribbons", "rose"].includes(f))).toBe(true);
  });
  it("every particle journey has vision-tagged phases", () => {
    for (const [id, c] of Object.entries(PARTICLE_LEADS)) expect(c.phaseChars?.length ?? 0, id).toBeGreaterThan(0);
  });
  it("the fire palette runs from a blue hearth to hot tips", () => {
    const p = particlePaletteFire({ key: "#ad4a1a", colors: ["#1e1617", "#602511", "#ad4a1a", "#e5943d", "#364755"] }, 0);
    expect(p.low[2]).toBeGreaterThan(p.low[0]); // blue at the hearth
    expect(p.high[0]).toBeGreaterThan(p.high[2]); // hot at the tips
  });
});
