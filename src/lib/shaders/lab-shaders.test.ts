/**
 * LAB shaders are registered for audition only. No journey, cast, vetted
 * pool, scripted take or automatic pick may ever contain one until Karel
 * approves it and it is removed from LAB_SHADERS.
 *
 * The SUN lab (2026-10-12) was promoted 2026-10-13 on Karel's keep of all
 * six, so LAB_SHADERS is empty; the mechanism stays for the next lab. The
 * guards below hold for whatever it contains, and the promoted sun shaders
 * are checked to be fully known (vetting verdict, mean luma, hue, pools).
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LAB_SHADERS, MODE_META, SHADERS } from "./index";
import { SHADER_MEAN_LUMA, VETTED_POOL } from "./shader-brightness.generated";
import { SHADER_HUES } from "./shader-hues.generated";
import { JOURNEY_CASTS, VETTED_SHADER_POOL } from "@/lib/journeys/journey-casts.generated";
import { SCRIPTED_TAKES, TAKE_FINALE_SHADERS } from "@/lib/journeys/pinned-takes";
import { JOURNEYS, RECAST_SAFELIST, castJourneyShaders, regenerateJourneyShaders } from "@/lib/journeys/journeys";
import { createSeededRandom } from "@/lib/journeys/seeded-random";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { SUN_SHADERS } from "@/lib/journeys/shader-balance";
import type { VisualizerMode } from "@/lib/audio/vibe-detection";

const LAB = [...LAB_SHADERS];
const labIn = (modes: Iterable<string>) => [...modes].filter((m) => LAB_SHADERS.has(m));
const vet = JSON.parse(readFileSync(join(process.cwd(), "scripts/shader-vetting.json"), "utf8")) as {
  pass: string[]; pool: string[]; excluded: Record<string, string>; verdicts: Record<string, { pass: boolean; gainedPass: boolean; mean: number; p5: number; hue: string }>;
};

describe("LAB shaders — registered, but never in rotation", () => {
  it("the SUN lab was promoted (Karel kept all six, 2026-10-13): LAB_SHADERS is empty", () => {
    expect(LAB).toEqual([]);
  });

  it("is in no vetted pool (generated or scripts/shader-vetting.json)", () => {
    expect(labIn(VETTED_POOL)).toEqual([]);
    expect(labIn(VETTED_SHADER_POOL)).toEqual([]);
    expect(labIn(vet.pass)).toEqual([]);
    expect(labIn(vet.pool)).toEqual([]);
  });

  it("is in no journey cast, scripted take, finale, safelist or built-in journey", () => {
    const found: string[] = [];
    for (const [id, { cast }] of Object.entries(JOURNEY_CASTS)) for (const list of Object.values(cast)) found.push(...labIn(list).map((m) => `cast ${id}: ${m}`));
    for (const [id, take] of Object.entries(SCRIPTED_TAKES)) found.push(...labIn(take.map((e) => e.mode)).map((m) => `take ${id}: ${m}`));
    found.push(...labIn(Object.values(TAKE_FINALE_SHADERS)));
    for (const list of Object.values(RECAST_SAFELIST)) found.push(...labIn(list));
    for (const j of JOURNEYS) for (const p of j.phases) found.push(...labIn(p.shaderModes ?? []).map((m) => `${j.id}/${p.id}: ${m}`));
    expect(found).toEqual([]);
  });

  it("random regeneration and casting never pick one (every built-in journey, many seeds)", () => {
    for (const j of JOURNEYS) {
      for (const seed of [1, 7, 42, 1234]) {
        const r = regenerateJourneyShaders(j, createSeededRandom(seed), 900);
        for (const p of r.phases) expect(labIn(p.shaderModes ?? []), `${j.id} seed ${seed}`).toEqual([]);
      }
      const c = castJourneyShaders(j);
      for (const p of c?.phases ?? []) expect(labIn(p.shaderModes ?? []), j.id).toEqual([]);
    }
  });

  describe("the engine's pick-time gate", () => {
    afterEach(() => getJourneyEngine().stop());
    it("refuses every LAB shader and allows the promoted sun shaders", () => {
      const peek = getJourneyEngine() as unknown as { isShaderAllowed(m: string): boolean };
      for (const m of LAB) expect(peek.isShaderAllowed(m), m).toBe(false);
      expect(peek.isShaderAllowed("seraph")).toBe(true);
      for (const m of SUN_SHADERS) expect(peek.isShaderAllowed(m), m).toBe(true);
    });
  });
});

describe("the promoted SUN shaders are fully known", () => {
  it("six registered Visionary sun-* shaders", () => {
    expect(SUN_SHADERS).toHaveLength(6);
    for (const m of SUN_SHADERS) {
      expect(m.startsWith("sun-"), m).toBe(true);
      expect(SHADERS[m as VisualizerMode], m).toBeTruthy();
      expect(MODE_META.find((x) => x.mode === m)?.category, m).toBe("Visionary");
    }
  });

  it("vetted (verdict + pass + pool), with a measured mean luma and a hue class", () => {
    for (const m of SUN_SHADERS) {
      const v = vet.verdicts[m];
      expect(v, m).toBeTruthy();
      expect(v.pass && v.gainedPass, m).toBe(true);
      expect(v.p5, m).toBe(0); // black floor: centre-out light out of darkness
      expect(vet.pass, m).toContain(m);
      expect(vet.pool, m).toContain(m);
      expect(vet.excluded[m], m).toBeUndefined();
      expect(VETTED_SHADER_POOL.has(m), m).toBe(true);
      expect(SHADER_MEAN_LUMA[m], m).toBe(v.mean);
      expect(SHADER_HUES[m], m).toBeTruthy();
      expect(v.hue, m).toBe(SHADER_HUES[m]);
    }
  });

  it("stays out of the engine's kindred-borrow pool (cast placements only; mastered kin picks unchanged)", () => {
    for (const m of SUN_SHADERS) expect(VETTED_POOL, m).not.toContain(m);
  });
});
