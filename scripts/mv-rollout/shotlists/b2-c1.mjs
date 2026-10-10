// Archetype rollout batch 2, chunk 1 (2026-10-10, Karel: "I need all 111 up
// to par"). Shot lists: b2-c1A.mjs (March Light), b2-c1B.mjs (The Ascension, The Bloom), and Vigil (vigil.mjs, Karel-approved 2026-10-05: Vespers 3, Vespers 2 and Calling re-rendered for near-dup/centring; Open Jam recast only, stills kept) (analysis-derived, validated with
// apply-shotlists --check). Same method as rise-above-b1.mjs:
//  - KEEP "morph-ends" for every journey that already has travel morphs
//    (the stills each morph was cut between stay, so installed morphs still
//    land on their own frames); everything else is re-rendered.
//  - shaders: phase-owned casts written into featured-recast.json /
//    journey-casts.generated.ts by cast-owned-featured.mjs.
//  - shaderOpacity: the Expansion arc (opacityArc).
import { existsSync, readFileSync } from "node:fs";
import { opacityArc } from "./expansion-batch.mjs";
import { JOURNEYS as VIGIL } from "./vigil.mjs";
export const SET = { key: "b2-c1", presenting: "March Light" };
export const ALLOW_WORDS = ["window", "door"];

const here = (f) => new URL(`./${f}`, import.meta.url);
const parts = [];
for (const k of ["b2-c1A", "b2-c1B"]) if (existsSync(here(`${k}.mjs`))) parts.push(...(await import(here(`${k}.mjs`))).JOURNEYS);
parts.push(...VIGIL.filter((j) => ["01c987f6-17de-469b-b155-000922b479a1", "4413b320-e6b5-471e-9163-10d1c496a67d", "d92c2d3a-4283-4300-abc3-d71ed7c6848d", "bd748991-a67b-41dc-af94-ac3f612a27c4"].includes(j.id)));
const clips = JSON.parse(readFileSync(new URL("../../../public/tramokyo-pack/local-clips.json", import.meta.url), "utf8"));
export const KEEP = Object.fromEntries(parts.filter((j) => Object.keys(clips[j.id] ?? {}).some((k) => /^t\d$/.test(k))).map((j) => [j.id, "morph-ends"]));
KEEP["bd748991-a67b-41dc-af94-ac3f612a27c4"] = "all"; // Open Jam: stills pass; shaders only
export const JOURNEYS = parts.map((j) => {
  const arc = opacityArc(j.phases);
  return { ...j, phases: j.phases.map((p, i) => ({ ...p, shaderOpacity: arc[i] })) };
});
