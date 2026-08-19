#!/usr/bin/env node
/**
 * Build the Tramokyo offline content pack.
 *
 * Exports everything the app needs to run journeys, paths, and library
 * playback with ZERO network: table snapshots (recordings, analyses,
 * markers, journeys, journey_paths) as JSON, plus every audio file and
 * every journey local image, into public/tramokyo-pack/ (gitignored).
 *
 * The app serves the pack when OFFLINE_PACK=1 — see src/lib/offline/pack.ts.
 * Audio/images are served statically by Next from /tramokyo-pack/... so
 * range requests work with no custom streaming code.
 *
 * Idempotent: re-runs skip audio/images already on disk (manifest-tracked).
 * ALAC originals without a persisted AAC are transcoded locally so
 * Chromium can play them offline.
 *
 * Usage:
 *   node --env-file=.env.local scripts/build-tramokyo-pack.mjs
 *   node --env-file=.env.local scripts/build-tramokyo-pack.mjs --skip-audio
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const PACK_DIR = path.join(process.cwd(), "public", "tramokyo-pack");
const DATA_DIR = path.join(PACK_DIR, "data");
const AUDIO_DIR = path.join(PACK_DIR, "audio");
const IMAGES_DIR = path.join(PACK_DIR, "images");

const SKIP_AUDIO = process.argv.includes("--skip-audio");
const SKIP_IMAGES = process.argv.includes("--skip-images");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Run with: node --env-file=.env.local scripts/build-tramokyo-pack.mjs");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAll(table, modify) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select("*").range(from, from + PAGE - 1);
    if (modify) q = modify(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function isALAC(bytes) {
  const searchLen = Math.min(bytes.length, 500000);
  for (let i = 0; i < searchLen - 3; i++) {
    if (bytes[i] === 0x61 && bytes[i + 1] === 0x6c && bytes[i + 2] === 0x61 && bytes[i + 3] === 0x63) {
      return true;
    }
  }
  return false;
}

async function transcodeToAAC(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      "-y", "-i", inputPath,
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      outputPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
      else resolve();
    });
    proc.on("error", reject);
  });
}

async function fileExists(p) {
  return access(p).then(() => true, () => false);
}

async function loadPriorManifest() {
  try {
    return JSON.parse(await readFile(path.join(PACK_DIR, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

async function exportAudio(recordings, priorAudio) {
  const audioIndex = {};
  let downloaded = 0, skipped = 0, transcoded = 0, failed = 0;

  for (const rec of recordings) {
    const prior = priorAudio?.[rec.id];
    if (prior && (await fileExists(path.join(PACK_DIR, prior.file)))) {
      audioIndex[rec.id] = prior;
      skipped++;
      continue;
    }

    const sourceName = rec.aac_file_name ?? rec.file_name;
    if (!sourceName) {
      console.warn(`  ! ${rec.title ?? rec.id}: no file_name, skipping`);
      failed++;
      continue;
    }

    const { data: blob, error } = await supabase.storage.from("recordings").download(sourceName);
    if (error || !blob) {
      console.warn(`  ! ${rec.title ?? rec.id}: download failed (${error?.message})`);
      failed++;
      continue;
    }
    const buf = Buffer.from(await blob.arrayBuffer());

    let ext = rec.aac_file_name
      ? "m4a"
      : (sourceName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "m4a").toLowerCase();
    let outName = `${rec.id}.${ext}`;
    let outPath = path.join(AUDIO_DIR, outName);
    let codec = rec.aac_file_name ? "aac" : (rec.audio_codec ?? null);

    if (!rec.aac_file_name && isALAC(buf)) {
      // Chromium can't play ALAC — transcode locally so offline playback
      // works in the kiosk browser, same as the /api/audio transcode path.
      const rawPath = path.join(AUDIO_DIR, `${rec.id}.orig.m4a`);
      await writeFile(rawPath, buf);
      outName = `${rec.id}.m4a`;
      outPath = path.join(AUDIO_DIR, outName);
      try {
        await transcodeToAAC(rawPath, outPath);
        codec = "aac";
        transcoded++;
      } catch (err) {
        console.warn(`  ! ${rec.title ?? rec.id}: transcode failed (${err.message}) — keeping original`);
        await writeFile(outPath, buf);
      }
      await (await import("node:fs/promises")).unlink(rawPath).catch(() => {});
    } else {
      await writeFile(outPath, buf);
    }

    audioIndex[rec.id] = {
      file: path.posix.join("audio", outName),
      codec,
      hasAac: !!rec.aac_file_name || codec === "aac",
    };
    downloaded++;
    console.log(`  ✓ ${rec.title ?? rec.id} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log(`Audio: ${downloaded} downloaded (${transcoded} transcoded), ${skipped} already present, ${failed} failed`);
  return audioIndex;
}

async function exportJourneyImages(journeys, priorImages) {
  const imageIndex = priorImages ?? {};
  let downloaded = 0, skipped = 0;

  for (const j of journeys) {
    const urls = Array.isArray(j.local_image_urls) ? j.local_image_urls : [];
    if (urls.length === 0) continue;
    const dir = path.join(IMAGES_DIR, "journeys", j.id);
    await mkdir(dir, { recursive: true });

    const localUrls = [];
    for (let i = 0; i < urls.length; i++) {
      const src = urls[i];
      if (typeof src !== "string") continue;
      if (src.startsWith("/tramokyo-pack/")) { localUrls.push(src); continue; }
      const ext = (src.match(/\.(jpe?g|png|webp|gif|avif)(\?|$)/i)?.[1] ?? "jpg").toLowerCase();
      const rel = path.posix.join("images", "journeys", j.id, `${i}.${ext}`);
      const dest = path.join(PACK_DIR, rel);
      if (await fileExists(dest)) {
        localUrls.push(`/tramokyo-pack/${rel}`);
        skipped++;
        continue;
      }
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await writeFile(dest, Buffer.from(await res.arrayBuffer()));
        localUrls.push(`/tramokyo-pack/${rel}`);
        downloaded++;
      } catch (err) {
        console.warn(`  ! journey ${j.name}: image ${i} failed (${err.message})`);
      }
    }
    if (localUrls.length > 0) imageIndex[j.id] = localUrls;
  }

  console.log(`Journey images: ${downloaded} downloaded, ${skipped} already present`);
  return imageIndex;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(AUDIO_DIR, { recursive: true });
  await mkdir(IMAGES_DIR, { recursive: true });

  const prior = await loadPriorManifest();

  console.log("Fetching tables…");
  const [recordings, analyses, markers, journeys, journeyPaths] = await Promise.all([
    fetchAll("recordings"),
    fetchAll("analyses", (q) => q.eq("status", "completed")),
    fetchAll("markers"),
    fetchAll("journeys"),
    fetchAll("journey_paths"),
  ]);
  console.log(
    `  recordings=${recordings.length} analyses=${analyses.length} markers=${markers.length} ` +
    `journeys=${journeys.length} journey_paths=${journeyPaths.length}`,
  );

  let audioIndex = prior?.audio ?? {};
  if (!SKIP_AUDIO) {
    console.log("Downloading audio…");
    audioIndex = await exportAudio(recordings, prior?.audio);
  }

  let imageIndex = prior?.journeyImages ?? {};
  if (!SKIP_IMAGES) {
    console.log("Downloading journey images…");
    imageIndex = await exportJourneyImages(journeys, prior?.journeyImages);
  }

  // Rewrite local_image_urls in the journeys snapshot to pack-relative
  // paths so AiImageLayer cycles local files offline.
  const journeysOut = journeys.map((j) =>
    imageIndex[j.id] ? { ...j, local_image_urls: imageIndex[j.id] } : j,
  );

  await writeFile(path.join(DATA_DIR, "recordings.json"), JSON.stringify(recordings));
  await writeFile(path.join(DATA_DIR, "analyses.json"), JSON.stringify(analyses));
  await writeFile(path.join(DATA_DIR, "markers.json"), JSON.stringify(markers));
  await writeFile(path.join(DATA_DIR, "journeys.json"), JSON.stringify(journeysOut));
  await writeFile(path.join(DATA_DIR, "journey_paths.json"), JSON.stringify(journeyPaths));
  await writeFile(
    path.join(PACK_DIR, "manifest.json"),
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        counts: {
          recordings: recordings.length,
          analyses: analyses.length,
          markers: markers.length,
          journeys: journeys.length,
          journeyPaths: journeyPaths.length,
          audioFiles: Object.keys(audioIndex).length,
        },
        audio: audioIndex,
        journeyImages: imageIndex,
      },
      null,
      2,
    ),
  );

  console.log(`\nPack written to ${PACK_DIR}`);
  const missing = recordings.filter((r) => !audioIndex[r.id]);
  if (missing.length > 0) {
    console.warn(`\n${missing.length} recordings have NO audio in the pack:`);
    for (const r of missing) console.warn(`  - ${r.title ?? r.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
