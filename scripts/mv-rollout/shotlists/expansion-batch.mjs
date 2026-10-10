// Expansion — Journey Archetype BATCH (2026-10-09, after Karel approved the
// three samples in expansion-sample.mjs). Every Expansion journey except the
// three samples, Horses 1 included (Karel approved; horse TRACE shots only).
//
// Same method as the samples:
//  - shot lists: expansion-batch-1..6.mjs (one module per authoring chunk,
//    each validated with apply-shotlists.mjs <part> --check) — analysis-
//    derived, phase bounds/intensities = the journeys' current v2 measured
//    arcs, ONE authored sparse phase at the music's valley;
//  - shaders: phase-owned casts solved loop-wide by cast-shaders.mjs into
//    expansion-batch.casts.json (lead kept, 11–13 per journey, no neighbour
//    sharing, Rise Above hand-offs, raised caps — see that file's header);
//  - shaderOpacity: the per-phase imagery arc, by rule (below), in the
//    kiosk-proven Snowflake range: image opacity = 1 - shaderOpacity, so the
//    imagery swells at the peak and recedes in the sparse valley and at the
//    quiet bookends.

import { existsSync, readFileSync } from "node:fs";

export const SET = { key: "expansion-batch", presenting: "Expansion" };

const here = (f) => new URL(`./${f}`, import.meta.url);
const parts = [];
for (let k = 1; k <= 6; k++) if (existsSync(here(`expansion-batch-${k}.mjs`))) parts.push(...(await import(here(`expansion-batch-${k}.mjs`))).JOURNEYS);
const castsFile = here("expansion-batch.casts.json");
const casts = existsSync(castsFile) ? JSON.parse(readFileSync(castsFile, "utf8")).casts : {};

// Imagery arc (Snowflake 0.45–0.65; Realized 0.58–0.85; the samples).
//  peak phase 0.46 · sparse phase 0.60 · threshold >= 0.62 · a quiet close
//  0.62 (a resurgent close, intensity >= 0.6, stays lit by the formula) ·
//  everything else 0.46 + (1 - intensity) * 0.25, clamped 0.46–0.58.
export function opacityArc(phases) {
  const sparse = phases.findIndex((p) => p.sparse);
  const ints = phases.map((p, i) => (i === sparse ? -1 : p.intensity ?? 0.5));
  const peak = ints.indexOf(Math.max(...ints));
  const r2 = (x) => Math.round(x * 100) / 100;
  return phases.map((p, i) => {
    if (i === sparse) return 0.6;
    if (i === peak) return 0.46;
    const f = r2(Math.min(0.58, Math.max(0.46, 0.46 + (1 - (p.intensity ?? 0.5)) * 0.25)));
    if (i === 0) return Math.max(0.62, f);
    if (i === phases.length - 1 && (p.intensity ?? 0) < 0.6) return 0.62;
    return f;
  });
}

// Only journeys still in the Expansion set (Karel parks takes into PARKING_LOT
// while reviewing — a parked take is simply dropped from the batch).
const seq = readFileSync(new URL("../../../src/lib/journeys/installation-sequence.ts", import.meta.url), "utf8");
const expBlock = seq.slice(seq.indexOf("const EXPANSION = ["), seq.indexOf("] as const", seq.indexOf("const EXPANSION = [")));
const IN_SET = new Set(expBlock.match(/"[0-9a-f-]{36}"/g).map((x) => x.slice(1, -1)));

export const JOURNEYS = parts.filter((j) => IN_SET.has(j.id)).map((j) => {
  const arc = opacityArc(j.phases);
  return { ...j, phases: j.phases.map((p, i) => ({ ...p, shaderOpacity: arc[i], ...(casts[j.id] ? { shaders: casts[j.id].cast[p.id] } : {}) })) };
});
