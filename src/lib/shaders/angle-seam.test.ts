/**
 * Angle branch-cut seam lint (kiosk film 2026-10-10: maelstrom drew a hard
 * straight line along the left half of the centre line — atan's ±π cut fed
 * into fbm/snoise). Every registered shader that still calls a raw
 * two-argument atan() must be on VERIFIED below: each entry was rendered
 * with the cut moved to +x (scripts audit, 2026-10-10) and either renders
 * identically (properly 2π-periodic) or was measured to have no visible
 * seam. Any NEW atan shader fails here until it is wrapped with
 * withAngleSeamBlend() or verified the same way.
 */
import { describe, it, expect } from "vitest";
import { SHADERS } from "./index";
import { ANGLE_SEAM_GLSL, twoArgAtanCalls, withAngleSeamBlend } from "./angle-seam";
import { SCRIPTED_TAKES, TAKE_FINALE_SHADERS } from "@/lib/journeys/pinned-takes";

const PERIODIC = "periodic: alt-cut render identical";
const NO_SEAM = "measured: jump at the cut < ~1 grey level / not from the angle";
const VERIFIED: Record<string, string> = {
  // 2π-periodic uses only (integer angular frequency, fract(a/2π * n), cos/sin of a)
  astral: PERIODIC, dusk: PERIODIC, neon: PERIODIC, redshift: PERIODIC, singularity: PERIODIC,
  stigmata: PERIODIC, flagella: PERIODIC, gnosis: PERIODIC, doppler: PERIODIC, merkaba: PERIODIC,
  estuary: PERIODIC, quatrefoil: PERIODIC, involute: PERIODIC, hubble: PERIODIC, "dark-crystal": PERIODIC,
  pelagic: PERIODIC, zooid: PERIODIC, meristem: PERIODIC, rime: PERIODIC, kenosis: PERIODIC,
  jubilee: PERIODIC, "fibonacci-spiral": PERIODIC, kairos: PERIODIC, "r3-sleepingbloom": PERIODIC,
  "r2-spiralgal": PERIODIC, "r2-magnetic": PERIODIC, "r3-magneticwisps": PERIODIC, "r3-fernunfurl": PERIODIC,
  kepler: PERIODIC, "r-kaleido": PERIODIC, credo: PERIODIC, pilgrimage: PERIODIC,
  // LOCKED (Snowflake / Ghost takes) — never edited here
  yantra: "LOCKED Ghost roster; periodic",
  "eclipse-ring": "LOCKED Snowflake roster; tiny non-periodic term, centre seam ratio <= 0.4 (invisible)",
  // non-periodic angle somewhere, but no visible seam
  halo: NO_SEAM, satori: NO_SEAM, nadir: NO_SEAM, chakra: NO_SEAM, vestige: NO_SEAM, seraph: NO_SEAM,
  whorl: NO_SEAM, "shadow-fire": NO_SEAM, trefoil: NO_SEAM, "event-horizon": NO_SEAM,
  empyrean: "cut centre sits above the frame (atan(uv.y - 0.6, ..)) — never on screen",
  pollen: "per-grain spike angles; cut falls between spikes (seam ratio <= 0.6)",
  covenant: "arc angle-range tests (intentional arc ends); seam blend would break the arcs",
  "resonant-rings": "cell index floor(a * n / 2π): the cut is already a cell border",
  // fixed in source with a term-level seam blend (crisp integer-frequency rays)
  "r3-coronastreams": "term-level seam blend on the fbm(a) warp",
};

const stripHelper = (s: string) => s.replace(ANGLE_SEAM_GLSL, "");

describe("withAngleSeamBlend", () => {
  const src = `
precision highp float;
uniform vec2 u_resolution;
float f(float a) { return atan(a); }
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float a = atan(uv.y - (0.5), max(uv.x, 0.1) - 0.5);
  gl_FragColor = vec4(f(a), sin(a), 0.0, 1.0);
}
`;
  const out = withAngleSeamBlend(src);
  it("rewrites only two-argument atan calls", () => {
    expect(out).toContain("rsSeamAtan(uv.y - (0.5), max(uv.x, 0.1) - 0.5)");
    expect(out).toContain("return atan(a);");
    expect(twoArgAtanCalls(stripHelper(out))).toHaveLength(0);
  });
  it("renames main, routes gl_FragColor and adds the blending main", () => {
    expect(out.match(/void main\(\)/g)).toHaveLength(1);
    expect(out).toContain("void rsSeamMain()");
    expect(out).toContain("rsSeamOut = vec4(f(a), sin(a), 0.0, 1.0);");
    expect(out.trim().endsWith("}")).toBe(true);
    // helper sits after the precision statement
    expect(out.indexOf("rsSeamAtan(float")).toBeGreaterThan(out.indexOf("precision highp float;"));
  });
  it("is idempotent and refuses shaders it cannot help", () => {
    expect(withAngleSeamBlend(out)).toBe(out);
    expect(() => withAngleSeamBlend("precision highp float; void main() { gl_FragColor = vec4(atan(1.0)); }")).toThrow();
  });
});

describe("shader registry — atan branch-cut seams", () => {
  const entries = Object.entries(SHADERS) as [string, string][];

  it("every raw two-argument atan shader is wrapped or verified", () => {
    const unverified = entries
      .filter(([, s]) => twoArgAtanCalls(stripHelper(s)).length > 0)
      .map(([m]) => m)
      .filter((m) => !VERIFIED[m]);
    expect(unverified, "atan(y, x) jumps ±π on the left half of the centre line — wrap with withAngleSeamBlend() or verify (see angle-seam.ts)").toEqual([]);
  });

  it("wrapped shaders carry no raw atan cut and exactly one main", () => {
    for (const [m, s] of entries) {
      if (!s.includes("rsSeamAtan")) continue;
      expect(twoArgAtanCalls(stripHelper(s)), m).toHaveLength(0);
      expect(s.match(/\bvoid\s+main\s*\(/g), m).toHaveLength(1);
    }
  });

  it("allowlist has no stale entries", () => {
    for (const m of Object.keys(VERIFIED)) {
      const s = SHADERS[m as keyof typeof SHADERS];
      expect(s, `${m} not registered`).toBeTruthy();
      expect(twoArgAtanCalls(stripHelper(s!)).length, `${m} no longer uses atan — drop it from VERIFIED`).toBeGreaterThan(0);
    }
  });

  it("mastered Snowflake / Ghost shaders are untouched by the seam blend", () => {
    const locked = new Set<string>();
    for (const id of ["first-snow", "ghost"]) {
      for (const e of SCRIPTED_TAKES[id] ?? []) if (e.mode) locked.add(e.mode);
      if (TAKE_FINALE_SHADERS[id]) locked.add(TAKE_FINALE_SHADERS[id]);
    }
    for (const m of locked) expect(SHADERS[m as keyof typeof SHADERS]?.includes("rsSeamAtan") ?? false, m).toBe(false);
  });
});
