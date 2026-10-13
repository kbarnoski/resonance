/**
 * LAB shaders (SUN lab, 2026-10-12) are registered for audition only.
 * No journey, cast, vetted pool, scripted take or automatic pick may ever
 * contain one until Karel approves it and it is removed from LAB_SHADERS.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LAB_SHADERS, MODE_META, SHADERS } from "./index";
import { VETTED_POOL } from "./shader-brightness.generated";
import { JOURNEY_CASTS, VETTED_SHADER_POOL } from "@/lib/journeys/journey-casts.generated";
import { SCRIPTED_TAKES, TAKE_FINALE_SHADERS } from "@/lib/journeys/pinned-takes";
import { JOURNEYS, RECAST_SAFELIST, castJourneyShaders, regenerateJourneyShaders } from "@/lib/journeys/journeys";
import { createSeededRandom } from "@/lib/journeys/seeded-random";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import type { VisualizerMode } from "@/lib/audio/vibe-detection";

const LAB = [...LAB_SHADERS];
const labIn = (modes: Iterable<string>) => [...modes].filter((m) => LAB_SHADERS.has(m));

describe("LAB shaders — registered, but never in rotation", () => {
  it("the SUN lab is six registered Visionary sun-* shaders", () => {
    expect(LAB).toHaveLength(6);
    for (const m of LAB) {
      expect(m.startsWith("sun-"), m).toBe(true);
      expect(SHADERS[m as VisualizerMode], m).toBeTruthy();
      expect(MODE_META.find((x) => x.mode === m)?.category, m).toBe("Visionary");
    }
  });

  it("is in no vetted pool (generated or scripts/shader-vetting.json)", () => {
    expect(labIn(VETTED_POOL)).toEqual([]);
    expect(labIn(VETTED_SHADER_POOL)).toEqual([]);
    const vet = JSON.parse(readFileSync(join(process.cwd(), "scripts/shader-vetting.json"), "utf8")) as { pass: string[]; pool: string[] };
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
    it("refuses every LAB shader", () => {
      const peek = getJourneyEngine() as unknown as { isShaderAllowed(m: string): boolean };
      for (const m of LAB) expect(peek.isShaderAllowed(m), m).toBe(false);
      expect(peek.isShaderAllowed("seraph")).toBe(true);
    });
  });
});
