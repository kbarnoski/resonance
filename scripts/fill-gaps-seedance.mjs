#!/usr/bin/env node
// fill-gaps-seedance.mjs — third-provider pass for clips both wan and
// Kling moderation refused (glowing mushrooms, flame content). Seedance
// accepts them. Reads local-clips.json for hero/morph gaps, generates
// via Seedance (end-frame supported for morphs where the API allows),
// QA-gates, dual-encodes. Crossfade fallback stands where even this fails.
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { build } from "esbuild";
import { readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const ROOT = process.cwd();
const PACK = path.join(ROOT, "public", "tramokyo-pack");
fal.config({ credentials: process.env.FAL_KEY });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const outfile = path.join(ROOT, ".tmp-gaps-bundle.mjs");
await build({
  stdin: { contents: `
    export { JOURNEYS } from "@/lib/journeys/journeys";
    export { allocateByPhase } from "@/lib/journeys/pack-image-allocation";
    export { TRAMOKYO_PHASE_WEIGHT } from "@/lib/journeys/prompt-decoration";
  `, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "esm", platform: "node", packages: "external",
  alias: { "@": path.join(ROOT, "src") }, outfile,
});
let app;
try { app = await import(pathToFileURL(outfile).href); }
finally { await rm(outfile, { force: true }); }

const MOTION_SOUL = {
  "mycelium-dream": "creeping organic spread — pulses traveling filaments, spores lofting, the network breathing",
  "inferno": "the motion of fire — heat shimmer, embers rising, flame tongues licking upward, consuming and breathing",
  "the-bloom": "organic unfurling — petals opening, fronds uncoiling, growth in slow bloom",
};
const ROLE = ["one element stirring in stillness", "gradual building motion", "full flowing motion at many depths, unhurried", "hovering micro-drift, light breathing", "settling motion, coming to rest softly", "near-stillness, one small motion remaining"];
const GUARD = "smooth constant camera speed, single continuous take, meditative pace throughout, no speed ramps, no time-lapse, no sudden bursts";

function qaClip(p) {
  try {
    const out = execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-i", p, "-vf", "select='gt(scene,0.35)',metadata=print:file=-", "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8e6 }).toString();
    return (out.match(/scene_score/g) || []).length === 0;
  } catch (e) {
    const out = String(e.stdout ?? "");
    return out.length > 0 && (out.match(/scene_score/g) || []).length === 0;
  }
}
function encodeDual(raw, base) {
  const opts = { stdio: "pipe", maxBuffer: 32e6 };
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", raw, "-vf", "gradfun=strength=4:radius=16", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", `${base}.mp4`], opts);
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", raw, "-vf", "gradfun=strength=4:radius=16", "-c:v", "libx265", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", "-movflags", "+faststart", "-an", `${base}.hevc.mp4`], opts);
}
async function seedance(prompt, startB64, endB64) {
  const inputs = endB64
    ? [{ prompt, image_url: `data:image/jpeg;base64,${startB64}`, end_image_url: `data:image/jpeg;base64,${endB64}`, duration: "5", resolution: "1080p" },
       { prompt, image_url: `data:image/jpeg;base64,${startB64}`, duration: "5", resolution: "1080p" }]
    : [{ prompt, image_url: `data:image/jpeg;base64,${startB64}`, duration: "10", resolution: "1080p" }];
  let lastErr;
  for (const input of inputs) {
    try {
      const r = await fal.subscribe("fal-ai/bytedance/seedance/v1/pro/image-to-video", { input, logs: false });
      const u = r?.data?.video?.url ?? r?.video?.url;
      if (u) return u;
      lastErr = new Error("no url");
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("seedance failed");
}

const manifest = JSON.parse(await readFile(path.join(PACK, "local-clips.json"), "utf8"));
async function resolveJourney(jid) {
  const b = app.JOURNEYS.find((j) => j.id === jid);
  if (b) return b;
  const { data } = await supabase.from("journeys").select("id, name, phases").eq("id", jid).single();
  return data;
}

for (const jid of Object.keys(manifest)) {
  const entry = manifest[jid];
  const heroGaps = [];
  const morphGaps = [];
  for (let i = 0; i < 6; i++) if (!entry[String(i)]) heroGaps.push(i);
  for (let i = 0; i < 5; i++) if (!entry[`t${i}`]) morphGaps.push(i);
  if (heroGaps.length === 0 && morphGaps.length === 0) continue;

  const journey = await resolveJourney(jid);
  if (!journey) continue;
  const imgDir = path.join(PACK, "images", "journeys", jid);
  const clipDir = path.join(PACK, "clips", "journeys", jid);
  const counts = app.allocateByPhase(journey.phases, 90, app.TRAMOKYO_PHASE_WEIGHT);
  const starts = []; let c = 0;
  for (const n of counts) { starts.push(c); c += n; }
  const soul = MOTION_SOUL[jid] ?? "";
  console.log(`${jid}: hero gaps [${heroGaps}], morph gaps [${morphGaps}]`);

  for (const pi of heroGaps) {
    const still = path.join(imgDir, `gen-${String(starts[pi]).padStart(3, "0")}.jpg`);
    if (!existsSync(still)) continue;
    const motifs = (journey.phases[pi].aiPrompt ?? "").split(",").slice(0, 3).join(",");
    const prompt = `${soul ? soul + ", " : ""}${ROLE[pi]}, ${motifs}, ${GUARD}`;
    try {
      const url = await seedance(prompt, (await readFile(still)).toString("base64"), null);
      const raw = path.join(clipDir, `phase-${pi}.raw.mp4`);
      await writeFile(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
      if (!qaClip(raw)) { await rm(raw, { force: true }); console.warn(`  ⟳ phase ${pi}: QA fail — leaving stills`); continue; }
      try { encodeDual(raw, path.join(clipDir, `phase-${pi}`)); } finally { await rm(raw, { force: true }); }
      console.log(`  ✓ hero ${pi} via seedance`);
    } catch (e) { console.error(`  ✗ hero ${pi}: ${String(e.body?.detail ?? e.message).slice(0, 80)}`); }
  }
  for (const pi of morphGaps) {
    const fromP = path.join(imgDir, `gen-${String(starts[pi] + counts[pi] - 1).padStart(3, "0")}.jpg`);
    const toP = path.join(imgDir, `gen-${String(starts[pi + 1]).padStart(3, "0")}.jpg`);
    if (!existsSync(fromP) || !existsSync(toP)) continue;
    const prompt = `one continuous slow cinematic camera journey from the first scene into the second scene, the world transforming gradually and seamlessly, ${soul}, ${GUARD}`;
    try {
      const url = await seedance(prompt, (await readFile(fromP)).toString("base64"), (await readFile(toP)).toString("base64"));
      const raw = path.join(clipDir, `travel-${pi}.raw.mp4`);
      await writeFile(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
      if (!qaClip(raw)) { await rm(raw, { force: true }); console.warn(`  ⟳ t${pi}: QA fail — crossfade stands`); continue; }
      try { encodeDual(raw, path.join(clipDir, `travel-${pi}`)); } finally { await rm(raw, { force: true }); }
      console.log(`  ✓ morph t${pi} via seedance`);
    } catch (e) { console.error(`  ✗ t${pi}: ${String(e.body?.detail ?? e.message).slice(0, 80)}`); }
  }
}
console.log("gap fill complete — run rebuild-pack-manifests.mjs");
