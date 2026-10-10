// Rise Above batch 1 (2026-10-09 overnight, Karel: "I need all 111 up to
// par") — the album/featured members of Karel's self-running Rise Above
// loop, raised to the Journey Archetype with the Expansion method.
//
//  - Shot lists: rise-above-A.mjs (Grasshopper, Yellow Bird, The First
//    (Expanded), Bath, Afterglow), rise-above-B.mjs (The Summit, Cosmic
//    Drift, Mycelium Dream — built-ins), rise-above-C.mjs (Realized —
//    built-in, scripted shader take kept as is). First Light and
//    Testimony 3 keep their Karel-approved Vigil shot lists (vigil.mjs).
//  - KEEP: First Light and Realized keep the stills their existing travel
//    morphs were cut between (so the morphs still land on their own frames)
//    and re-render everything else; Testimony 3 keeps all its stills (it
//    only failed centring, and new stills would orphan its morphs).
//  - Shaders: phase-owned casts written into featured-recast.json /
//    journey-casts.generated.ts by cast-owned-featured.mjs (Realized keeps
//    its scripted take; KEEP_OPACITY keeps its mastered shaderOpacity).
//  - shaderOpacity: the Expansion arc (opacityArc).

import { existsSync } from "node:fs";
import { opacityArc } from "./expansion-batch.mjs";
import { JOURNEYS as VIGIL } from "./vigil.mjs";

export const SET = { key: "rise-above-b1", presenting: "Rise Above" };
export const ALLOW_WORDS = ["window", "door"];
export const KEEP = {
  "87e106f9-4d74-4886-b944-fd625a827b02": "morph-ends", // First Light
  "dc8d9705-785a-485e-b91f-a12c85bf7b92": "morph-ends", // Testimony 3 (re-rendered for centring P2 44%)
  inferno: "morph-ends", // Realized
};
export const KEEP_OPACITY = ["inferno"];

const here = (f) => new URL(`./${f}`, import.meta.url);
const parts = [];
for (const k of ["A", "B", "C"]) if (existsSync(here(`rise-above-${k}.mjs`))) parts.push(...(await import(here(`rise-above-${k}.mjs`))).JOURNEYS);
const vigil = VIGIL.filter((j) => ["87e106f9-4d74-4886-b944-fd625a827b02", "dc8d9705-785a-485e-b91f-a12c85bf7b92"].includes(j.id));

export const JOURNEYS = [...vigil, ...parts].map((j) => {
  const arc = opacityArc(j.phases);
  return { ...j, phases: j.phases.map((p, i) => ({ ...p, shaderOpacity: arc[i] })) };
});
