// Archetype rollout batch 2, chunk 3 (2026-10-10, Karel: "I need all 111 up
// to par"). Shot lists: ["b2-c3A", "b2-c3B"] (analysis-derived, validated with
// apply-shotlists --check). Same method as rise-above-b1.mjs:
//  - KEEP "morph-ends" for every journey that already has travel morphs
//    (the stills each morph was cut between stay, so installed morphs still
//    land on their own frames); everything else is re-rendered.
//  - shaders: phase-owned casts written into featured-recast.json /
//    journey-casts.generated.ts by cast-owned-featured.mjs.
//  - shaderOpacity: the Expansion arc (opacityArc).
import { existsSync, readFileSync } from "node:fs";
import { opacityArc } from "./expansion-batch.mjs";

export const SET = { key: "b2-c3", presenting: "Welcome Home" };
export const ALLOW_WORDS = ["window", "door"];

const here = (f) => new URL(`./${f}`, import.meta.url);
const parts = [];
for (const k of ["b2-c3A", "b2-c3B"]) if (existsSync(here(`${k}.mjs`))) parts.push(...(await import(here(`${k}.mjs`))).JOURNEYS);

const clips = JSON.parse(readFileSync(new URL("../../../public/tramokyo-pack/local-clips.json", import.meta.url), "utf8"));
// Content rules beat keeping a morph (coordinator, 2026-10-10): these
// morphs are dropped (their boundaries crossfade) and the morph-end stills
// that broke the rules are re-rendered. install.mjs installs the surviving
// morphs from <out>/<Journey>/morphs/ (staged copies of the current clips).
export const DROP_MORPHS = {
  "27f52cf0-5fad-420f-8324-8017c414f1f8": { morphs: [3], release: [18, 19] }, // Interplay: slot 19 two glowing human figures; 18 a moon over water
  "019e1e1d-c7e2-4609-a9c6-364a2755b115": { morphs: [3, 4], release: [21, 22, 23] }, // Quarantine: 21/22 rooftops; 23 a drinking glass
};
export const KEEP = Object.fromEntries(parts.filter((j) => Object.keys(clips[j.id] ?? {}).some((k) => /^t\d$/.test(k)))
  .map((j) => [j.id, DROP_MORPHS[j.id] ? { mode: "morph-ends", except: DROP_MORPHS[j.id].release } : "morph-ends"]));

export const JOURNEYS = parts.map((j) => {
  const arc = opacityArc(j.phases);
  return { ...j, phases: j.phases.map((p, i) => ({ ...p, shaderOpacity: arc[i] })) };
});
