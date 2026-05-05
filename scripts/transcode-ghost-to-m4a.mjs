#!/usr/bin/env node
/**
 * One-shot: download Ghost's WAV from Supabase Storage, transcode to
 * AAC/M4A with ffmpeg-static, upload alongside the original, and
 * update the recordings row's aac_file_name. The /api/audio/{id}
 * endpoint already prefers aac_file_name over file_name when both
 * exist, so the kiosk picks up the smaller compressed file
 * automatically.
 *
 * Why: KB_GHOST_REF_2.0.wav is ~17MB uncompressed. Streaming it via
 * HTTP range requests over expiring signed URLs has been flaky —
 * audio stalls at ~3s on 2nd-cycle replays as the browser fails to
 * fetch the next byte range. Compressed AAC at 192kbps is ~5MB and
 * range-fetches reliably.
 *
 * Usage:
 *   node scripts/transcode-ghost-to-m4a.mjs
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from
 * .env.local. Idempotent — re-running just overwrites the m4a.
 */

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { writeFile, readFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import "dotenv/config";

const GHOST_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";
const BITRATE = "192k";

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  return { url, key };
}

async function transcode(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-c:a", "aac",
      "-b:a", BITRATE,
      "-movflags", "+faststart", // moov atom at the front for fast streaming
      outputPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(stderr);
        reject(new Error(`ffmpeg exited with code ${code}`));
      } else {
        resolve();
      }
    });
    proc.on("error", reject);
  });
}

async function main() {
  const { url, key } = readEnv();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Fetching recording row for ${GHOST_RECORDING_ID}…`);
  const { data: rec, error: recErr } = await supabase
    .from("recordings")
    .select("id, file_name, aac_file_name, audio_codec, title")
    .eq("id", GHOST_RECORDING_ID)
    .single();

  if (recErr || !rec) {
    console.error("Failed to fetch recording:", recErr);
    process.exit(1);
  }
  console.log(`  title: ${rec.title}`);
  console.log(`  file_name: ${rec.file_name}`);
  console.log(`  aac_file_name (current): ${rec.aac_file_name ?? "(none)"}`);

  if (!rec.file_name) {
    console.error("Recording has no file_name — cannot transcode");
    process.exit(1);
  }

  const workDir = path.join(tmpdir(), `ghost-transcode-${Date.now()}`);
  await mkdir(workDir, { recursive: true });
  const inputPath = path.join(workDir, "input.wav");
  const outputPath = path.join(workDir, "output.m4a");

  console.log(`Downloading WAV from storage bucket "recordings/${rec.file_name}"…`);
  const { data: blob, error: dlErr } = await supabase.storage
    .from("recordings")
    .download(rec.file_name);
  if (dlErr || !blob) {
    console.error("Download failed:", dlErr);
    process.exit(1);
  }
  const wavBytes = Buffer.from(await blob.arrayBuffer());
  await writeFile(inputPath, wavBytes);
  console.log(`  downloaded ${(wavBytes.length / 1024 / 1024).toFixed(1)} MB`);

  console.log(`Transcoding to AAC at ${BITRATE}…`);
  await transcode(inputPath, outputPath);
  const m4aBytes = await readFile(outputPath);
  console.log(`  produced ${(m4aBytes.length / 1024 / 1024).toFixed(1)} MB ` +
    `(${((m4aBytes.length / wavBytes.length) * 100).toFixed(0)}% of original)`);

  // Use a sibling filename — same base, .m4a extension.
  const baseName = rec.file_name.replace(/\.wav$/i, "");
  const m4aFileName = `${baseName}.m4a`;

  console.log(`Uploading to "recordings/${m4aFileName}"…`);
  const { error: upErr } = await supabase.storage
    .from("recordings")
    .upload(m4aFileName, m4aBytes, {
      contentType: "audio/mp4",
      upsert: true,
    });
  if (upErr) {
    console.error("Upload failed:", upErr);
    process.exit(1);
  }
  console.log("  uploaded");

  console.log(`Updating recordings.aac_file_name = "${m4aFileName}"…`);
  const { error: updErr } = await supabase
    .from("recordings")
    .update({ aac_file_name: m4aFileName })
    .eq("id", GHOST_RECORDING_ID);
  if (updErr) {
    console.error("DB update failed:", updErr);
    process.exit(1);
  }

  // Cleanup tmp files
  try { await unlink(inputPath); } catch { /* ok */ }
  try { await unlink(outputPath); } catch { /* ok */ }

  console.log("\nDone. The /api/audio/{id} endpoint will now serve the M4A");
  console.log("by default. The original WAV stays in storage as a fallback.");
  console.log("\nClear sessionStorage in the kiosk browser (or hard-refresh)");
  console.log("to bust the audio-url cache and pick up the new file.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
