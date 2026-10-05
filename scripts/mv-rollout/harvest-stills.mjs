#!/usr/bin/env node
// harvest-stills.mjs — Snowflake-Standard stills for one rollout set,
// staged OUTSIDE the pack (never touches public/tramokyo-pack).
//
// Slots: allocateByPhase(phases, N, TRAMOKYO_PHASE_WEIGHT) — the exact
// split the kiosk player uses — with N (default 36) raised until every
// phase holds >= 3 slots, so all three POV shots of every phase appear.
// Slot i in a phase renders shot floor(i/count*3) (the harvest/player
// convention). Each slot gets 2 options (a/b); pick-stills.mjs scores
// them and the human-eye QA swaps/re-rolls before install.
// Pipeline = the house harvest: fal-ai/flux/dev 28 steps / 3.5 / 1024²,
// strict camera (no POV rotation), Tramokyo grade by the phase's gradeAs,
// TRAMOKYO_STYLE_SUFFIX, GLOBAL + TRAMOKYO extra + material negatives.
//
// Usage: node --env-file=.env.local scripts/mv-rollout/harvest-stills.mjs <set> --out=<dir> [--only=id,..] [--slots=a,b] [--options=2] [--reroll=<journeyId>:<slot>,...]
import { fal } from "@fal-ai/client";
import { createJiti } from "jiti";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TAIL } from "./tail.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT + "src" } });
const D = await jiti.import("../../src/lib/journeys/prompt-decoration.ts");
const A = await jiti.import("../../src/lib/journeys/pack-image-allocation.ts");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const setKey = process.argv[2];
const OUT = arg("out");
if (!OUT) throw new Error("--out=<dir> required");
const ONLY = arg("only")?.split(",");
const OPTIONS = Number(arg("options") ?? 2);
const REROLL = arg("reroll")?.split(",").map((x) => x.split(":"));
const { JOURNEYS } = await import(`./shotlists/${setKey}.mjs`);
fal.config({ credentials: process.env.FAL_KEY });

export function planSlots(j, base = 36) {
  let n = base, counts;
  for (;; n++) { counts = A.allocateByPhase(j.phases, n, D.TRAMOKYO_PHASE_WEIGHT); if (Math.min(...counts) >= 3 || n > 60) break; }
  const slots = [];
  j.phases.forEach((p, pi) => { for (let i = 0; i < counts[pi]; i++) { const si = Math.min(2, Math.floor((i / counts[pi]) * 3)); slots.push({ slot: slots.length, phase: p.id, phaseIdx: pi, shotIdx: si, reg: p.shots[si].reg, gradeAs: p.gradeAs, text: p.shots[si].text }); } });
  return { n, counts, slots };
}

const jobs = [];
const manifest = {};
for (const j of JOURNEYS) {
  if (ONLY && !ONLY.includes(j.id)) continue;
  const plan = planSlots(j);
  const dir = `${OUT}/${j.name.replace(/\s+/g, "-")}/opt`;
  mkdirSync(dir, { recursive: true });
  manifest[j.id] = { name: j.name, n: plan.n, counts: plan.counts, slots: plan.slots.map(({ text, ...s }) => s) };
  for (const s of plan.slots) {
    const prompt = `${s.text}, ${TAIL}, ${D.tramokyoGradeForPhase(s.gradeAs)}, ${D.TRAMOKYO_STYLE_SUFFIX}`;
    const stem = `gen-${String(s.slot).padStart(3, "0")}`;
    const letters = REROLL ? REROLL.filter(([id, sl]) => id === j.id && Number(sl) === s.slot).map(() => null) : null;
    if (REROLL && letters.length === 0) continue;
    const taken = (l) => existsSync(`${dir}/${stem}-${l}.jpg`);
    const opts = REROLL ? "cdefghijklmn".split("").filter((l) => !taken(l)).slice(0, 2) : "abcdefgh".slice(0, OPTIONS).split("");
    for (const o of opts) { const f = `${dir}/${stem}-${o}.jpg`; if (!existsSync(f)) jobs.push({ f, prompt }); }
  }
}
writeFileSync(`${OUT}/slots.json`, JSON.stringify(manifest, null, 1));
const negative = `${D.GLOBAL_NEGATIVE}, ${D.TRAMOKYO_EXTRA_NEGATIVE}, ${D.TRAMOKYO_MATERIAL_NEGATIVE}`;
console.log(`${jobs.length} stills to render (~$${(jobs.length * 0.025).toFixed(2)})`);
let next = 0, ok = 0, bad = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fal.subscribe("fal-ai/flux/dev", { input: { prompt: j.prompt, negative_prompt: negative, image_size: { width: 1024, height: 1024 }, num_inference_steps: 28, guidance_scale: 3.5, seed: Math.floor(Math.random() * 4294967295), enable_safety_checker: true } });
        const url = r.data?.images?.[0]?.url; if (!url) throw new Error("no image");
        writeFileSync(j.f, Buffer.from(await (await fetch(url)).arrayBuffer())); ok++; break;
      } catch (e) { if (attempt === 2) { bad++; console.log("✗", j.f.split("/").slice(-3).join("/"), e.message ?? e); } }
    }
    if ((ok + bad) % 25 === 0) console.log(`  ${ok + bad}/${jobs.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`done: ${ok} ok, ${bad} failed · spent ~$${(ok * 0.025).toFixed(2)}`);
