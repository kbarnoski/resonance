#!/usr/bin/env node
// harvest-travel-morphs.mjs — travel morphs between phases (Wave 2c).
// One continuous camera move from the LAST still of phase N to the FIRST
// still of phase N+1 via Kling O3 standard (start+end frame). Encoded to
// the same dual-codec (h264 crf18 + hevc main10 gradfun) as hero clips.
// Manifest keys: "t<N>" = transition N→N+1.
// Usage: node --env-file=.env.local scripts/harvest-travel-morphs.mjs inferno first-snow
import { fal } from "@fal-ai/client";
import { build } from "esbuild";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const ROOT = process.cwd();
fal.config({ credentials: process.env.FAL_KEY });
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const outfile = path.join(os.tmpdir(), ".tmp-morph-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { JOURNEYS } from "@/lib/journeys/journeys";
      export { allocateByPhase } from "@/lib/journeys/pack-image-allocation";
      export { TRAMOKYO_PHASE_WEIGHT } from "@/lib/journeys/prompt-decoration";
    `,
    resolveDir: ROOT, loader: "ts",
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
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};

async function kling(prompt, startB64, endB64) {
  const variants = [
    // Known-good shape first (audit #21: the old order burned a guaranteed
    // 422 round-trip per morph).
    { id: "fal-ai/kling-video/o3/standard/image-to-video",
      input: { prompt, image_url: `data:image/jpeg;base64,${startB64}`, end_image_url: `data:image/jpeg;base64,${endB64}`, duration: "5" } },
    { id: "fal-ai/kling-video/o3/standard/image-to-video",
      input: { prompt, start_image_url: `data:image/jpeg;base64,${startB64}`, end_image_url: `data:image/jpeg;base64,${endB64}`, duration: "5" } },
    { id: "fal-ai/kling-video/v2.6/pro/image-to-video",
      input: { prompt, image_url: `data:image/jpeg;base64,${startB64}`, end_image_url: `data:image/jpeg;base64,${endB64}`, duration: "5" } },
  ];
  let lastErr;
  for (const v of variants) {
    try {
      const r = await fal.subscribe(v.id, { input: v.input, logs: false });
      const url = r?.data?.video?.url ?? r?.video?.url;
      if (url) return url;
      lastErr = new Error("no video url");
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function encodeDual(rawPath, outBase) {
  const opts = { stdio: "pipe", maxBuffer: 32 * 1024 * 1024 };
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", rawPath, "-vf", "gradfun=strength=4:radius=16",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", `${outBase}.mp4`], opts);
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", rawPath, "-vf", "gradfun=strength=4:radius=16",
    "-c:v", "libx265", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p10le",
    "-tag:v", "hvc1", "-movflags", "+faststart", "-an", `${outBase}.hevc.mp4`], opts);
}

for (const jid of ids) {
  const journey = app.JOURNEYS.find((j) => j.id === jid);
  if (!journey) { console.warn(`skip ${jid}`); continue; }
  const imgDir = path.join(PACK, "images", "journeys", jid);
  const clipDir = path.join(PACK, "clips", "journeys", jid);
  await mkdir(clipDir, { recursive: true });
  manifest[jid] = manifest[jid] ?? {};
  const counts = app.allocateByPhase(journey.phases, 90, app.TRAMOKYO_PHASE_WEIGHT);
  const starts = [];
  let c = 0;
  for (const n of counts) { starts.push(c); c += n; }

  for (let pi = 0; pi < journey.phases.length - 1; pi++) {
    const outBase = path.join(clipDir, `travel-${pi}`);
    const pub = `/tramokyo-pack/clips/journeys/${jid}/travel-${pi}`;
    if (existsSync(`${outBase}.mp4`)) {
      // Manifest honesty (audit #9): only claim the hevc variant if the
      // file actually exists — a phantom URL silently kills the clip.
      const entry = { h264: `${pub}.mp4` };
      if (existsSync(`${outBase}.hevc.mp4`)) entry.hevc = `${pub}.hevc.mp4`;
      manifest[jid][`t${pi}`] = entry;
      console.log(`  keep ${jid} t${pi}`);
      continue;
    }
    const fromIdx = starts[pi] + counts[pi] - 1;
    const toIdx = starts[pi + 1];
    const fromPath = path.join(imgDir, `gen-${String(fromIdx).padStart(3, "0")}.jpg`);
    const toPath = path.join(imgDir, `gen-${String(toIdx).padStart(3, "0")}.jpg`);
    if (!existsSync(fromPath) || !existsSync(toPath)) { console.warn(`  missing stills for ${jid} t${pi}`); continue; }
    const prompt =
      "one continuous slow cinematic camera journey from the first scene into the second scene, " +
      "the world transforming gradually and seamlessly along the way, dreamlike travel, " +
      "meditative pace, no cuts, no flicker";
    console.log(`  → ${jid} travel ${pi}→${pi + 1}`);
    try {
      const url = await kling(prompt,
        (await readFile(fromPath)).toString("base64"),
        (await readFile(toPath)).toString("base64"));
      const raw = `${outBase}.raw.mp4`;
      const res = await fetch(url);
      await writeFile(raw, Buffer.from(await res.arrayBuffer()));
      try {
        encodeDual(raw, outBase);
      } finally {
        await rm(raw, { force: true }); // never orphan raws in the pack (M6)
      }
      const entry = { h264: `${pub}.mp4` };
      if (existsSync(`${outBase}.hevc.mp4`)) entry.hevc = `${pub}.hevc.mp4`;
      manifest[jid][`t${pi}`] = entry;
      console.log(`  ✓ ${jid} t${pi}`);
    } catch (e) {
      console.error(`  ✗ ${jid} t${pi}: ${e.message ?? e}`);
      if (e.stderr) console.error(String(e.stderr).slice(-2000)); // real ffmpeg cause (audit #21)
    }
  }
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log("manifest updated");
