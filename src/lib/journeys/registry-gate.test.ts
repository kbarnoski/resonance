/**
 * Registry gate (2026-09-27, Johnny/Joseph review): CI-enforced content
 * index. The maturity QA gate screens clips for GLITCHES; this gate
 * screens the catalog for CONTENT-LAW integrity — so drift between
 * sessions fails the build instead of premiering in front of guests.
 *
 * It validates the two committed artifacts of the content pipeline:
 *   docs/journey-registry.json           (scripts/generate-journey-registry.mjs)
 *   docs/journey-material-audit-*.json   (frame audit, scripts/audit-extract-frames.mjs)
 * against the live code (shader registry, builtin journey defs).
 *
 * Ratchet allowlists below hold the KNOWN debt — shrink them as content
 * is regenerated; never grow them without a matching audit entry.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JOURNEYS, GLOBAL_SHADER_BLOCKLIST, RETIRED_POOL_SLOT_MODES } from "./journeys";
import { MODE_META } from "@/lib/shaders";

const registry = JSON.parse(
  readFileSync(join(process.cwd(), "docs/journey-registry.json"), "utf8"),
) as {
  auditFile: string;
  journeys: Record<
    string,
    {
      name: string;
      source?: string;
      shaders?: string[][];
      duplicateShadersWithinJourney?: string[];
      clips?: { heroes: number; travels: number } | null;
      audit?: { verdict?: string };
    }
  >;
};

const VALID_VERDICTS = new Set(["clean", "violations", "needs-recheck", "reference"]);
const KNOWN_MODES = new Set(MODE_META.map((m) => m.mode as string));

// Ratchet: DB rows whose stored shader lists reference shaders that no
// longer exist in the registry (April-era rows predating shader removals).
// Regenerating those journeys' shaders removes them from this list.
const KNOWN_DEAD_SHADER_REFS: Record<string, string[]> = {
  "f23b613b-7bc5-4ada-8e92-1d4ee79d30a9": ["nebula"], // Realized (April 11)
  "1895014a-ce59-4640-aa23-b9421b588d70": ["nebula"], // Snowflake (April 14) — caught by this gate's first run
};

// The banned shaders deleted from the codebase 2026-10-13 (Karel reviewed on
// film: "reviewed and marked all banned. might as well remove from the code
// too"). ~38 stored DB rows still name some of them; every one stays in
// GLOBAL_SHADER_BLOCKLIST, which the journey engine strips from every phase
// before anything plays (withoutGlobalBlocked), so those refs are inert.
// Regenerating a row's casts drops them; never add a NEW deleted name here.
const DELETED_2026_10_13 = new Set([
  "credo", "dharma", "biofilm", "r3-monsoonveil", "interference", "doppler", "quasar", "neon", "roulette",
  "r3-moltenglass", "agape", "cascade", "empyrean", "r2-kelvin", "r2-marble", "r3-heatshimmer",
  "r3-peelingbark", "r3-shadowflow", "thermal", "whirlpool", "lightning", "snow", "rain", "night-rain",
  "abyss-light", "terminus", "onyx", "estuary", "hollow", "dark-bloom", "fog",
  "swell", "revelation", "portal", "numinous", "biolume",
]);

describe("journey content registry gate", () => {
  it("every journey that ships clips has a material-audit verdict", () => {
    const missing = Object.entries(registry.journeys)
      .filter(([, j]) => j.clips && (j.clips.heroes > 0 || j.clips.travels > 0))
      .filter(([, j]) => !VALID_VERDICTS.has(j.audit?.verdict ?? ""))
      .map(([id, j]) => `${j.name} (${id})`);
    expect(missing, "clips without a material audit — run the frame audit before shipping").toEqual([]);
  });

  it("DB journeys reference only shaders that exist (ratcheted)", () => {
    const unexpected: string[] = [];
    for (const [id, j] of Object.entries(registry.journeys)) {
      const refs = (j.shaders ?? []).flat();
      const dead = [...new Set(refs.filter((s) => !KNOWN_MODES.has(s)))];
      const allowed = new Set(KNOWN_DEAD_SHADER_REFS[id] ?? []);
      for (const s of dead) if (!allowed.has(s) && !DELETED_2026_10_13.has(s)) unexpected.push(`${j.name} (${id}): ${s}`);
    }
    expect(unexpected, "new dead shader reference — fix the journey or the registry").toEqual([]);
  });

  it("the 2026-10-13 deletions are gone from the registry and guarded at runtime", () => {
    for (const s of DELETED_2026_10_13) {
      expect(KNOWN_MODES.has(s), `${s} is back in MODE_META`).toBe(false);
      expect(GLOBAL_SHADER_BLOCKLIST, s).toContain(s);
    }
  });

  it("no journey's stored phase lists repeat a shader (data-level variety law)", () => {
    const offenders = Object.entries(registry.journeys)
      .filter(([, j]) => (j.duplicateShadersWithinJourney ?? []).length > 0)
      .map(([id, j]) => `${j.name} (${id}): ${j.duplicateShadersWithinJourney!.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("builtin journeys reference only shaders that exist", () => {
    const dead: string[] = [];
    for (const j of JOURNEYS) {
      for (const p of j.phases ?? []) {
        for (const s of p.shaderModes ?? []) {
          // retired pool slots (snow, lightning) are placeholders the engine refuses at every pick
          if (!KNOWN_MODES.has(s) && !RETIRED_POOL_SLOT_MODES.has(s)) dead.push(`${j.id}/${p.id}: ${s}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it("builtin journeys don't repeat a shader across their phase lists", () => {
    const offenders: string[] = [];
    for (const j of JOURNEYS) {
      const seen = new Set<string>();
      for (const p of j.phases ?? []) {
        for (const s of p.shaderModes ?? []) {
          if (seen.has(s)) offenders.push(`${j.id}: ${s}`);
          seen.add(s);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every registered shader carries a hue-family tag (palette coordination)", async () => {
    const { SHADER_HUES } = await import("@/lib/shaders/shader-hues.generated");
    const missing = MODE_META
      .filter((m) => m.category !== "AI Imagery" && !(m.mode in SHADER_HUES))
      .map((m) => m.mode);
    expect(missing, "run scripts/analyze-shader-hues.mjs after adding shaders").toEqual([]);
  });

  it("audit file referenced by the registry exists and parses", () => {
    const audit = JSON.parse(readFileSync(join(process.cwd(), registry.auditFile), "utf8"));
    expect(audit.journeys).toBeTruthy();
  });
});
