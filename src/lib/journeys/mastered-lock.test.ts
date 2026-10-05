/**
 * Mastered-journey lock (Karel 2026-10-05: protect Snowflake, Realized and
 * Ghost from global work). Fingerprints everything that defines how they
 * play and fails on ANY drift. Intentional changes (Karel's own mastering
 * notes) re-snapshot with: UPDATE_MASTERED_LOCK=1 npx vitest run mastered-lock
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { JOURNEYS } from "./journeys";
import { SCRIPTED_TAKES, TAKE_INTRO_STILLS, TAKE_FINALE_STILLS, TAKE_FINALE_SHADERS } from "./pinned-takes";
import { MASTERED_JOURNEYS, LEGACY_SLIDESHOW_JOURNEYS } from "./mastered";

const LOCK = "docs/mastered-lock.json";
const h = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

function fingerprint() {
  const out: Record<string, Record<string, string>> = {};
  for (const id of MASTERED_JOURNEYS) {
    const j = JOURNEYS.find((x) => x.id === id);
    const f: Record<string, string> = {
      definition: h(j ? { ...j, phases: j.phases.map((p) => ({ ...p, shaderModes: undefined })) } : null),
      scriptedTake: h(SCRIPTED_TAKES[id] ?? null),
      introStill: h(TAKE_INTRO_STILLS[id] ?? null),
      finaleStill: h(TAKE_FINALE_STILLS[id] ?? null),
      finaleShader: h(TAKE_FINALE_SHADERS[id] ?? null),
      legacySlideshow: String(LEGACY_SLIDESHOW_JOURNEYS.has(id)),
    };
    // Pack stills (gitignored — checked where the pack exists, i.e. the kiosk Mac).
    const dir = `public/tramokyo-pack/images/journeys/${id}`;
    if (existsSync(dir)) {
      const files = readdirSync(dir).filter((x) => x.endsWith(".jpg")).sort();
      f.packStills = h(files.map((x) => createHash("md5").update(readFileSync(`${dir}/${x}`)).digest("hex")));
    }
    out[id] = f;
  }
  return out;
}

describe("mastered journeys are locked", () => {
  it("Snowflake, Realized and Ghost match docs/mastered-lock.json", () => {
    const now = fingerprint();
    if (process.env.UPDATE_MASTERED_LOCK === "1" || !existsSync(LOCK)) {
      writeFileSync(LOCK, JSON.stringify({ updated: new Date().toISOString(), journeys: now }, null, 2) + "\n");
      return;
    }
    const locked = JSON.parse(readFileSync(LOCK, "utf8")).journeys as typeof now;
    for (const id of Object.keys(locked)) {
      for (const [k, v] of Object.entries(locked[id])) {
        if (k === "packStills" && now[id]?.packStills === undefined) continue; // no pack here (CI)
        expect(now[id]?.[k], `${id}.${k} changed — mastered journeys are locked (Karel). Re-snapshot only for his own notes.`).toBe(v);
      }
    }
  });
});
