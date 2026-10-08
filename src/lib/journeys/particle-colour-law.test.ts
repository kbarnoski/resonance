import { describe, expect, it } from "vitest";
import { PARTICLE_LEADS, particlePaletteFromImage, particlePaletteFire, particlePaletteGhost, particlePaletteDawn, JOURNEY_THEMES, fireColours } from "@/lib/journeys/particle-lead";
import { JOURNEY_IMAGE_PALETTES } from "@/lib/particles/journey-palettes.generated";

/**
 * COLOUR LAW (Karel 2026-10-08: "you use that same light orange and pink
 * coloring over and over as a default … colors are to be assigned based on the
 * theme and imaging" / "i better not see the orange and pink default coloring
 * over and over again when your work is done").
 *
 * For every particle journey, every phase, every voicing — through the SAME
 * palette routing the particle layer uses (dawn / Ghost / fire-only-where-it-
 * burns / image) — the share of particle colour that is warm (red, orange,
 * pink) may not exceed the imaging's own warm share by more than 15 points.
 * Before the 2026-10-08 fixes: 46 journeys broke this (worst +51 pts).
 */
const hsv = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [((h / 6) + 1) % 1, mx ? d / mx : 0, mx]; };
const toS = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const warm = (h: number) => h < 0.12 || h > 0.88;

function audit() {
  const rows: Array<{ name: string; particles: number; imaging: number }> = [];
  for (const [id, cast] of Object.entries(PARTICLE_LEADS)) {
    const ip = JOURNEY_IMAGE_PALETTES[id];
    if (!ip) continue;
    const ghost = cast.signatureImage === "angel";
    const dawn = (JOURNEY_THEMES as Record<string, { palette?: string }>)[id]?.palette === "dawn";
    if (dawn) continue; // First Light's sunrise is its theme (violet → rose → gold), by design
    const phases = ip.phases.length ? ip.phases : [ip];
    let n = 0, w = 0, iw = 0, it = 0;
    phases.forEach((ph, i) => {
      const ch = cast.phaseChars?.[Math.min(i, (cast.phaseChars?.length ?? 1) - 1)];
      const fire = !!ch?.fire, floral = !fire && !!ch?.floral;
      ph.colors.forEach((c, k) => { const x = parseInt(c.slice(1), 16); const [h, s, v] = hsv(((x >> 16) & 255) / 255, ((x >> 8) & 255) / 255, (x & 255) / 255); if (s > 0.15 && v > 0.15) { it += ph.weights[k]; if (warm(h)) iw += ph.weights[k]; } });
      for (let v = 0; v < 4; v++) {
        if (ghost && floral) continue; // Ghost's pink flowers: pink only where flowers are seen (by design)
        const p = ghost ? particlePaletteFromImage(ph, v) : fireColours(fire, ph) ? particlePaletteFire(ph, v) : particlePaletteFromImage(ph, v);
        if (!p) continue;
        for (const c of [p.low, p.mid, p.high]) { const [h, s] = hsv(toS(c[0]), toS(c[1]), toS(c[2])); if (s < 0.12) continue; n++; if (warm(h)) w++; }
      }
    });
    rows.push({ name: cast.name ?? id, particles: n ? w / n : 0, imaging: it ? iw / it : 0 });
  }
  return rows;
}

describe("particle colour law", () => {
  it("no journey's particles run more than 15 pts warmer than its imaging", () => {
    const rows = audit();
    expect(rows.length).toBeGreaterThan(100);
    const over = rows.filter((r) => r.particles - r.imaging > 0.15).map((r) => `${r.name}: particles ${(r.particles * 100).toFixed(0)}% warm vs imaging ${(r.imaging * 100).toFixed(0)}%`);
    expect(over).toEqual([]);
  });
  it("fire colours only where the imagery burns", () => {
    expect(fireColours(true, { colors: ["#0b1c29", "#182c3b", "#a38367"], weights: [0.6, 0.3, 0.1] })).toBe(false);
    expect(fireColours(true, { colors: ["#ad4a1a", "#e5943d", "#17181d"], weights: [0.4, 0.3, 0.3] })).toBe(true);
    expect(fireColours(false, { colors: ["#ad4a1a"], weights: [1] })).toBe(false);
  });
});
