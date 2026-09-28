/**
 * Shader ↔ palette coordination (2026-09-27 review): a journey's palette
 * maps to compatible hue families, selection trims clashing shaders, and
 * neutral/prismatic shaders always survive so variety is preserved.
 */
import { describe, expect, it } from "vitest";
import { createSeededRandom } from "./seeded-random";
import { defaultPhases, filterShadersForPalette, paletteHueFamilies, regenerateJourneyShaders } from "./journeys";
import { SHADER_HUES } from "@/lib/shaders/shader-hues.generated";
import type { Journey } from "./types";

const GRASSHOPPER_PALETTE = { primary: "#9fd86a", secondary: "#0a1408", accent: "#e8e05f", glow: "#d0f0a8" };
const OCEAN_PALETTE = { primary: "#2a6fd8", secondary: "#04101e", accent: "#48c8e8", glow: "#a8d8f0" };

describe("paletteHueFamilies", () => {
  it("maps Grasshopper's green-gold palette to its families plus ring neighbors", () => {
    const fams = paletteHueFamilies(GRASSHOPPER_PALETTE);
    expect(fams.has("green")).toBe(true);
    expect(fams.has("gold")).toBe(true);
    expect(fams.has("teal")).toBe(true); // green's neighbor
    expect(fams.has("blue")).toBe(false);
    expect(fams.has("violet")).toBe(false);
  });

  it("returns an empty set (no filtering) for neutral or missing palettes", () => {
    expect(paletteHueFamilies(null).size).toBe(0);
    expect(paletteHueFamilies({ primary: "#1a1a1a", accent: "#2b2b2e", glow: "#333333", secondary: "#000000" }).size).toBe(0);
  });
});

describe("filterShadersForPalette", () => {
  it("removes clashing families, keeps matching, neutral and prismatic", () => {
    const fams = paletteHueFamilies(GRASSHOPPER_PALETTE);
    const pool = ["deep-current", "flame", "galaxy", "aurora-wave", "pollen", "lightning"];
    // deep-current + lightning are blue-family; the rest are gold/neutral/prismatic
    const out = filterShadersForPalette([...pool, ...Array(40).fill("flame")], fams);
    expect(out).not.toContain("deep-current");
    expect(out).not.toContain("lightning");
    expect(out).toContain("flame");
    expect(out).toContain("galaxy");
    expect(out).toContain("aurora-wave");
  });

  it("tops the pool back up when harmony would leave too few shaders", () => {
    const fams = paletteHueFamilies(OCEAN_PALETTE);
    const clashing = Object.keys(SHADER_HUES).filter((m) => SHADER_HUES[m] === "gold").slice(0, 30);
    const out = filterShadersForPalette(clashing, fams);
    expect(out.length).toBe(30); // nothing compatible — everything restored
  });
});

describe("regenerateJourneyShaders palette coordination", () => {
  it("selects only palette-compatible (or neutral/prismatic) shaders for an ocean journey", () => {
    const phases = defaultPhases("ocean").map((p) => ({ ...p, palette: OCEAN_PALETTE }));
    const journey: Journey = {
      id: "palette-test", name: "Palette Test", subtitle: "", description: "",
      realmId: "ocean", aiEnabled: false, phases,
      theme: { palette: OCEAN_PALETTE } as Journey["theme"],
    };
    const fams = paletteHueFamilies(OCEAN_PALETTE);
    const regen = regenerateJourneyShaders(journey, createSeededRandom(9), 300);
    const all = regen.phases.flatMap((p) => p.shaderModes);
    expect(all.length).toBeGreaterThan(10);
    const clashes = all.filter((m) => {
      const f = SHADER_HUES[m];
      return f && f !== "neutral" && f !== "prismatic" && !fams.has(f);
    });
    expect(clashes).toEqual([]);
  });
});
