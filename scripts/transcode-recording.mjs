#!/usr/bin/env node
/**
 * Transcode a single recording to AAC/M4A. Useful when:
 *   - User uploads ALAC (Apple Lossless inside M4A) which iOS Safari
 *     plays inconsistently — converting to AAC fixes it.
 *   - User uploads a large WAV that's flaky under range streaming.
 *
 * Idempotent: skips if aac_file_name is already set on the row.
 *
 * Usage:
 *   node --env-file=.env.local scripts/transcode-recording.mjs <recording_id>
 */

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { writeFile, readFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const BITRATE = "256k"; // higher than the 192k installation default — preserves more nuance for one-off journeys

const recordingId = process.argv[2];
if (!recordingId) {
  console.error("Usage: node --env-file=.env.local scripts/transcode-recording.mjs <recording_id>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function transcode(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-c:a", "aac",
      "-b:a", BITRATE,
      "-movflags", "+faststart",
      outputPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(stderr);
        reject(new Error(`ffmpeg exited ${code}`));
      } else {
        resolve();
      }
    });
    proc.on("error", reject);
  });
}

const { data: rec, error } = await supabase
  .from("recordings")
  .select("id, title, file_name, aac_file_name, audio_codec")
  .eq("id", recordingId)
  .single();

if (error || !rec) {
  console.error(`Failed to fetch recording ${recordingId}:`, error?.message);
  process.exit(1);
}

console.log(`Recording: ${rec.title}`);
console.log(`  file_name: ${rec.file_name}`);
console.log(`  audio_codec: ${rec.audio_codec ?? "(unknown)"}`);
console.log(`  aac_file_name: ${rec.aac_file_name ?? "(none)"}`);

if (rec.aac_file_name) {
  console.log("Already has aac_file_name — skipping.");
  process.exit(0);
}
if (!rec.file_name) {
  console.error("No file_name on recording.");
  process.exit(1);
}

const workDir = path.join(tmpdir(), `transcode-${rec.id}-${Date.now()}`);
await mkdir(workDir, { recursive: true });
const ext = (rec.file_name.split(".").pop() ?? "bin").toLowerCase();
const inputPath = path.join(workDir, `input.${ext}`);
const outputPath = path.join(workDir, "output.m4a");

try {
  process.stdout.write(`Downloading… `);
  const { data: blob, error: dlErr } = await supabase.storage.from("recordings").download(rec.file_name);
  if (dlErr || !blob) throw new Error(`download failed: ${dlErr?.message}`);
  const inBytes = Buffer.from(await blob.arrayBuffer());
  await writeFile(inputPath, inBytes);
  console.log(`${(inBytes.length / 1024 / 1024).toFixed(1)} MB`);

  process.stdout.write(`Transcoding to AAC ${BITRATE}… `);
  await transcode(inputPath, outputPath);
  const outBytes = await readFile(outputPath);
  console.log(`${(outBytes.length / 1024 / 1024).toFixed(1)} MB (${((outBytes.length / inBytes.length) * 100).toFixed(0)}%)`);

  const baseName = rec.file_name.replace(/\.[^.]+$/, "");
  const m4aFileName = `${baseName}.m4a`;
  if (m4aFileName === rec.file_name) {
    // Original was already .m4a (just different codec). Append "-aac"
    // so we don't overwrite the original ALAC version.
    const sibling = `${baseName}-aac.m4a`;
    process.stdout.write(`Uploading to ${sibling}… `);
    const { error: upErr } = await supabase.storage.from("recordings")
      .upload(sibling, outBytes, { contentType: "audio/mp4", upsert: true });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);
    console.log(`done`);
    process.stdout.write(`Updating DB… `);
    const { error: updErr } = await supabase.from("recordings")
      .update({ aac_file_name: sibling }).eq("id", rec.id);
    if (updErr) throw new Error(`db update failed: ${updErr.message}`);
    console.log(`done`);
    console.log(`\naac_file_name = ${sibling}`);
  } else {
    process.stdout.write(`Uploading to ${m4aFileName}… `);
    const { error: upErr } = await supabase.storage.from("recordings")
      .upload(m4aFileName, outBytes, { contentType: "audio/mp4", upsert: true });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);
    console.log(`done`);
    process.stdout.write(`Updating DB… `);
    const { error: updErr } = await supabase.from("recordings")
      .update({ aac_file_name: m4aFileName }).eq("id", rec.id);
    if (updErr) throw new Error(`db update failed: ${updErr.message}`);
    console.log(`done`);
    console.log(`\naac_file_name = ${m4aFileName}`);
  }
} finally {
  try { await unlink(inputPath); } catch { /* ok */ }
  try { await unlink(outputPath); } catch { /* ok */ }
}
