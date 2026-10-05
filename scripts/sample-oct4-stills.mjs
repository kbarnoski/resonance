#!/usr/bin/env node
// SAMPLES ONLY (sample-before-batch law): 2 stills per Oct 4 journey —
// the PEAK phase's world shot + the first gathering phase's world shot —
// through the exact harvest-journey-images.mjs --treatment=tramokyo
// recipe (fal-ai/flux/dev, 1024², 28 steps, guidance 3.5, POV +
// interpretation + mood decoration, Tramokyo grade, style suffix, real
// negatives), except the grade is keyed by the phase's measured ROLE
// (phase.gradeAs) instead of its positional id. Writes to --out (never
// the pack). Karel approves before any full harvest.
// Usage: node --env-file=.env.local scripts/sample-oct4-stills.mjs --out=<dir>
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (!OUT) throw new Error("--out=<dir> required");
mkdirSync(OUT, { recursive: true });
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const D = await jiti.import("../src/lib/journeys/prompt-decoration.ts");
fal.config({ credentials: process.env.FAL_KEY });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = JSON.parse(readFileSync("scripts/oct4-output.json", "utf8"));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const jobs = [];
for (const j of out.journeys) {
  const { data: row } = await sb.from("journeys").select("name,phases").eq("id", j.journeyId).single();
  const peak = row.phases.find((p) => p.analysisRole === "peak");
  const early = row.phases.find((p, i) => i > 0 && p.analysisRole === "gathering" && p !== peak) ?? row.phases[1];
  for (const [tag, ph] of [["a-early", early], ["b-peak", peak]]) {
    const base = ph.aiPromptSequence.find((s) => !/^(DARK BACKGROUND — )?(close|macro|extreme close|abstract)/.test(s)) ?? ph.aiPromptSequence[0];
    const grade = ph.gradeAs ?? ph.id;
    const povs = D.CINEMATIC_PERSPECTIVES[grade] ?? D.CINEMATIC_PERSPECTIVES.threshold;
    const varied = `${base}, ${pick(povs)}, ${pick(D.PROMPT_INTERPRETATIONS)}, ${pick(D.PROMPT_MOODS)}, ${D.tramokyoGradeForPhase(grade)}`;
    jobs.push({ title: row.name, tag, phase: ph.id, role: ph.analysisRole, prompt: `${varied}, ${D.TRAMOKYO_STYLE_SUFFIX}` });
  }
}
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? null; // "Title:a-early"
if (ONLY) jobs.splice(0, jobs.length, ...jobs.filter((j) => ONLY.includes(`${j.title}:${j.tag}`)));
if (!ONLY) writeFileSync(path.join(OUT, "plan.json"), JSON.stringify(jobs, null, 1));
if (process.argv.includes("--plan-only")) { console.log(`${jobs.length} prompts -> ${path.join(OUT, "plan.json")}`); process.exit(0); }
const negative = `${D.GLOBAL_NEGATIVE}, ${D.TRAMOKYO_EXTRA_NEGATIVE}, ${D.TRAMOKYO_MATERIAL_NEGATIVE}`;
let spent = 0;
const log = [];
await Promise.all(jobs.map(async (job) => {
  const seed = Math.floor(Math.random() * 4294967295);
  const r = await fal.subscribe("fal-ai/flux/dev", { input: { prompt: job.prompt, negative_prompt: negative, image_size: { width: 1024, height: 1024 }, num_inference_steps: 28, guidance_scale: 3.5, seed, enable_safety_checker: true } });
  const url = r.data?.images?.[0]?.url;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const file = path.join(OUT, `${job.title.replace(/\W+/g, "_")}-${job.tag}.jpg`);
  writeFileSync(file, buf);
  spent += 0.025;
  log.push({ ...job, seed, file });
  console.log(`✓ ${job.title} ${job.tag} (${job.phase}/${job.role})`);
}));
writeFileSync(path.join(OUT, ONLY ? `samples-reroll-${Date.now()}.json` : "samples.json"), JSON.stringify(log, null, 1));
console.log(`${log.length} stills, ~$${spent.toFixed(2)}`);
