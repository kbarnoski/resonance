#!/usr/bin/env node
// SAMPLES ONLY: 2 stills per RE-THEMED journey (new world lines from
// scripts/retheme-worlds.mjs), same harvest recipe as sample-oct4-stills
// (flux/dev 1024², 28 steps, guidance 3.5, POV/interp/mood decoration,
// Tramokyo grade keyed by the phase's measured role, real negatives).
// Never writes to the pack. Karel approves before any harvest.
// Usage: node --env-file=.env.local scripts/sample-retheme-stills.mjs --out=<dir> [--only=Name:a,Name:b]
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RETHEME } from "./retheme-worlds.mjs";

const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (!OUT) throw new Error("--out=<dir> required");
mkdirSync(OUT, { recursive: true });
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? null;
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const D = await jiti.import("../src/lib/journeys/prompt-decoration.ts");
const J = await jiti.import("../src/lib/journeys/journeys.ts");
fal.config({ credentials: process.env.FAL_KEY });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const report = JSON.parse(readFileSync("scripts/retheme-report.json", "utf8"));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const jobs = [];
for (const [id, e] of Object.entries(RETHEME)) {
  const newIdx = (e.phases ?? []).map((p, i) => (typeof p === "string" ? i : null)).filter((x) => x !== null);
  if (!newIdx.length) continue;
  const phases = J.JOURNEYS.find((b) => b.id === id)?.phases ?? (await sb.from("journeys").select("phases").eq("id", id).single()).data.phases;
  const peak = phases.findIndex((p) => p.analysisRole === "peak");
  const a = newIdx.includes(peak) ? peak : newIdx[0];
  const rest = newIdx.filter((i) => i !== a);
  const b = rest.find((i) => phases[i].analysisRole === "gathering") ?? rest[0] ?? a;
  for (const [tag, i] of [["a", a], ["b", b]]) {
    if (ONLY && !ONLY.includes(`${e.name}:${tag}`)) continue;
    const ph = phases[i];
    const grade = ph.gradeAs ?? ph.id;
    const base = ph.aiPromptSequence.find((s) => !/^(DARK BACKGROUND — )?(close|macro|extreme close|abstract)/.test(s)) ?? ph.aiPrompt;
    const povs = D.CINEMATIC_PERSPECTIVES[grade] ?? D.CINEMATIC_PERSPECTIVES.threshold;
    const prompt = `${base}, ${pick(povs)}, ${pick(D.PROMPT_INTERPRETATIONS)}, ${pick(D.PROMPT_MOODS)}, ${D.tramokyoGradeForPhase(grade)}, ${D.TRAMOKYO_STYLE_SUFFIX}`;
    const r = report.find((x) => x.id === id);
    jobs.push({ id, title: e.name, tag, phase: i, role: ph.analysisRole, prompt, world: e.world, why: e.why, measured: r?.measured ?? e.measured });
  }
}
const negative = `${D.GLOBAL_NEGATIVE}, ${D.TRAMOKYO_EXTRA_NEGATIVE}, ${D.TRAMOKYO_MATERIAL_NEGATIVE}`;
const log = [];
const queue = [...jobs];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const job = queue.shift();
    const seed = Math.floor(Math.random() * 4294967295);
    try {
      const r = await fal.subscribe("fal-ai/flux/dev", { input: { prompt: job.prompt, negative_prompt: negative, image_size: { width: 1024, height: 1024 }, num_inference_steps: 28, guidance_scale: 3.5, seed, enable_safety_checker: true } });
      const buf = Buffer.from(await (await fetch(r.data.images[0].url)).arrayBuffer());
      const file = path.join(OUT, `${job.title.replace(/\W+/g, "_")}-${job.tag}.jpg`);
      writeFileSync(file, buf);
      log.push({ ...job, seed, file });
      console.log(`✓ ${job.title} ${job.tag} (phase ${job.phase} ${job.role})`);
    } catch (err) { console.log(`✗ ${job.title} ${job.tag}: ${err.message}`); }
  }
}));
const prev = (() => { try { return JSON.parse(readFileSync(path.join(OUT, "samples.json"), "utf8")); } catch { return []; } })();
const merged = [...prev.filter((p) => !log.some((l) => l.title === p.title && l.tag === p.tag)), ...log];
writeFileSync(path.join(OUT, "samples.json"), JSON.stringify(merged, null, 1));
console.log(`${log.length} stills, ~$${(log.length * 0.025).toFixed(2)}`);
