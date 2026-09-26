#!/usr/bin/env node
// harvest-journey-clips.mjs — Wave 2 pilot (2026-09-25): living hero
// shots. For each phase of the given built-in journeys, take the phase's
// first pack still and animate it with Wan 2.6 image-to-video (5s, 720p)
// using the phase's own motion language. Clips land in the offline pack
// and local-clips.json maps journeyId → { phaseIdx: url } for playback.
//
// Usage: node --env-file=.env.local scripts/harvest-journey-clips.mjs inferno first-snow
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const ROOT = process.cwd();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function encodeDual(rawPath, outBase) {
  const opts = { stdio: "pipe", maxBuffer: 32 * 1024 * 1024 };
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", rawPath, "-vf", "gradfun=strength=4:radius=16",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", `${outBase}.mp4`], opts);
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", rawPath, "-vf", "gradfun=strength=4:radius=16",
    "-c:v", "libx265", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p10le",
    "-tag:v", "hvc1", "-movflags", "+faststart", "-an", `${outBase}.hevc.mp4`], opts);
}

async function resolveJourney(jid, JOURNEYS) {
  const builtin = JOURNEYS.find((j) => j.id === jid);
  if (builtin) return builtin;
  const { data } = await supabase.from("journeys").select("id, name, phases").eq("id", jid).single();
  return data ?? null;
}
fal.config({ credentials: process.env.FAL_KEY });

const journeyIds = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (journeyIds.length === 0) {
  console.error("usage: harvest-journey-clips.mjs <journey-id> [...]");
  process.exit(1);
}

// Bundle journeys.ts for phases + allocation weights (same trick as image harvest)
const outfile = path.join(ROOT, ".tmp-clips-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { JOURNEYS } from "@/lib/journeys/journeys";
      export { allocateByPhase } from "@/lib/journeys/pack-image-allocation";
      export { TRAMOKYO_PHASE_WEIGHT } from "@/lib/journeys/prompt-decoration";
    `,
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", packages: "external",
  alias: { "@": path.join(ROOT, "src") },
  outfile,
});
let app;
try {
  app = await import(pathToFileURL(outfile).href);
} finally {
  await rm(outfile, { force: true });
}

const PACK = path.join(ROOT, "public", "tramokyo-pack");
const manifestPath = path.join(PACK, "local-clips.json");
const manifest = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : {};

let spent = 0;
const COST_PER_CLIP = 0.5; // Wan 2.6 1080p ≈ $0.05/s × 10s

for (const jid of journeyIds) {
  const journey = await resolveJourney(jid, app.JOURNEYS);
  if (!journey) { console.warn(`skip: no built-in journey ${jid}`); continue; }
  const imgDir = path.join(PACK, "images", "journeys", jid);
  if (!existsSync(imgDir)) { console.warn(`skip: no pack images for ${jid}`); continue; }
  const clipDir = path.join(PACK, "clips", "journeys", jid);
  await mkdir(clipDir, { recursive: true });
  manifest[jid] = manifest[jid] ?? {};

  // Phase → first image index, via the same largest-remainder allocation
  // the image harvest used (90 images, tramokyo weights).
  const counts = app.allocateByPhase(journey.phases, 90, app.TRAMOKYO_PHASE_WEIGHT);
  let cursor = 0;
  for (let pi = 0; pi < journey.phases.length; pi++) {
    const firstIdx = cursor;
    cursor += counts[pi];
    const outBase = path.join(clipDir, `phase-${pi}`);
    const clipPath = `${outBase}.mp4`;
    const publicUrl = `/tramokyo-pack/clips/journeys/${jid}/phase-${pi}.mp4`;
    if (existsSync(clipPath)) {
      const hevcPath = clipPath.replace(/\.mp4$/, ".hevc.mp4");
      manifest[jid][String(pi)] = existsSync(hevcPath)
        ? { h264: publicUrl, hevc: publicUrl.replace(/\.mp4$/, ".hevc.mp4") }
        : publicUrl;
      console.log(`  keep ${jid} phase ${pi}`);
      continue;
    }
    const stillPath = path.join(imgDir, `gen-${String(firstIdx).padStart(3, "0")}.jpg`);
    if (!existsSync(stillPath)) { console.warn(`  no still for ${jid} phase ${pi}`); continue; }

    const b64 = (await readFile(stillPath)).toString("base64");
    const phase = journey.phases[pi];
    const motion = (phase.aiPrompt ?? "").split(",").slice(0, 3).join(",");
    const prompt =
      `slow cinematic camera drift through this scene, ${motion}, ` +
      `gentle continuous motion, elements drifting and breathing, meditative pace, ` +
      `seamless dreamlike movement, no cuts, no camera shake`;

    console.log(`  → ${jid} phase ${pi} (from gen-${String(firstIdx).padStart(3, "0")})`);
    try {
      const result = await fal.subscribe("wan/v2.6/image-to-video", {
        input: {
          prompt,
          image_url: `data:image/jpeg;base64,${b64}`,
          duration: "10",
          resolution: "1080p",
          negative_prompt: "text, watermark, captions, people, faces, jump cut, flicker",
          enable_prompt_expansion: false,
        },
        logs: false,
      });
      const url = result?.data?.video?.url ?? result?.video?.url;
      if (!url) throw new Error("no video url in result");
      const res = await fetch(url);
      const raw = `${outBase}.raw.mp4`;
      await writeFile(raw, Buffer.from(await res.arrayBuffer()));
      try {
        encodeDual(raw, outBase);
      } finally {
        await rm(raw, { force: true });
      }
      spent += COST_PER_CLIP;
      manifest[jid][String(pi)] = { h264: publicUrl, hevc: publicUrl.replace(/\.mp4$/, ".hevc.mp4") };
      console.log(`  ✓ ${jid} phase ${pi} ($${spent.toFixed(2)})`);
    } catch (err) {
      console.error(`  ✗ ${jid} phase ${pi}: ${err.message ?? err}`);
      if (err.stderr) console.error(String(err.stderr).slice(-1500));
    }
  }
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\nmanifest → ${manifestPath}`);
console.log(`est spend ≈ $${spent.toFixed(2)}`);
