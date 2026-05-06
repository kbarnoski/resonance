#!/usr/bin/env node
/**
 * Batch-transcode every WAV used by the installation kiosk to AAC/M4A.
 * Streaming an 80MB WAV via HTTP range requests over expiring signed
 * URLs has been the recurring "Ghost stalls at ~3s" failure mode.
 * Compressed AAC at 192k is ~6% the size and range-fetches reliably.
 *
 * Idempotent — skips any recording that already has aac_file_name set.
 *
 * Usage:
 *   node --env-file=.env.local scripts/transcode-installation-tracks.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { writeFile, readFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const BITRATE = "192k";

// Karel's user id (paired tracks are scoped to the creator's recordings).
// We discover this dynamically from the Ghost recording row, which is the
// one journey with an explicit recordingId in code.
const GHOST_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

// Patterns from PAIRED_TRACKS for journeys in INSTALLATION_SEQUENCE.
// Mirrors lib/journeys/paired-tracks.ts — keep in sync if pairings change.
// Format: { pattern, exact? }
//   "%foo%" → ILIKE pattern (first match)
//   "=Foo"  → exact title match
const TRACK_PATTERNS = [
  { id: "the-ascension", pattern: "17th St 63", exact: true },
  { id: "inferno",       pattern: "%KB_REALIZED%" },
  { id: "first-snow",    pattern: "KB_SFLAKE_TK1_REF_2.0", exact: true },
  { id: "abyssal-dive",  pattern: "%Folsom St 9%" },
  { id: "ghost",         pattern: "%KB_GHOST_REF%" },
];

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    console.error("Run with: node --env-file=.env.local scripts/...");
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
      "-movflags", "+faststart",
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

async function findRecording(supabase, userId, spec) {
  let query = supabase
    .from("recordings")
    .select("id, file_name, aac_file_name, audio_codec, title")
    .eq("user_id", userId);
  if (spec.exact) {
    query = query.eq("title", spec.pattern);
  } else {
    const ilike = spec.pattern.replace(/^%|%$/g, "");
    query = query.ilike("title", `%${ilike}%`);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    console.warn(`  [${spec.id}] DB query failed:`, error.message);
    return null;
  }
  return data;
}

async function transcodeOne(supabase, rec) {
  const ext = (rec.file_name?.split(".").pop() ?? "").toLowerCase();
  if (rec.aac_file_name) {
    console.log(`  ✓ aac_file_name already set → skip`);
    return { skipped: true };
  }
  if (!rec.file_name) {
    console.log(`  ✗ no file_name → skip`);
    return { skipped: true };
  }
  // If the original is already a compressed format that streams well,
  // no point transcoding. WAV is what we're targeting; ALAC also
  // benefits since ALAC is uncompressed-ish. M4A/MP3 already fine.
  if (ext === "m4a" || ext === "mp3" || ext === "aac") {
    console.log(`  ✓ already compressed (${ext}) → skip`);
    return { skipped: true };
  }

  const workDir = path.join(tmpdir(), `transcode-${rec.id}-${Date.now()}`);
  await mkdir(workDir, { recursive: true });
  const inputPath = path.join(workDir, `input.${ext || "bin"}`);
  const outputPath = path.join(workDir, "output.m4a");

  try {
    process.stdout.write(`  download… `);
    const { data: blob, error: dlErr } = await supabase.storage
      .from("recordings")
      .download(rec.file_name);
    if (dlErr || !blob) throw new Error(`download failed: ${dlErr?.message}`);
    const inBytes = Buffer.from(await blob.arrayBuffer());
    await writeFile(inputPath, inBytes);
    process.stdout.write(`${(inBytes.length / 1024 / 1024).toFixed(1)} MB. `);

    process.stdout.write(`transcode… `);
    await transcode(inputPath, outputPath);
    const outBytes = await readFile(outputPath);
    process.stdout.write(`${(outBytes.length / 1024 / 1024).toFixed(1)} MB ` +
      `(${((outBytes.length / inBytes.length) * 100).toFixed(0)}%). `);

    const baseName = rec.file_name.replace(/\.[^.]+$/, "");
    const m4aFileName = `${baseName}.m4a`;

    process.stdout.write(`upload… `);
    const { error: upErr } = await supabase.storage
      .from("recordings")
      .upload(m4aFileName, outBytes, {
        contentType: "audio/mp4",
        upsert: true,
      });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);

    process.stdout.write(`update DB… `);
    const { error: updErr } = await supabase
      .from("recordings")
      .update({ aac_file_name: m4aFileName })
      .eq("id", rec.id);
    if (updErr) throw new Error(`update failed: ${updErr.message}`);

    console.log(`done.`);
    return { transcoded: true, savedPct: 100 - Math.round((outBytes.length / inBytes.length) * 100) };
  } finally {
    try { await unlink(inputPath); } catch { /* ok */ }
    try { await unlink(outputPath); } catch { /* ok */ }
  }
}

async function main() {
  const { url, key } = readEnv();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Discover Karel's user_id from the Ghost recording.
  const { data: ghostRow } = await supabase
    .from("recordings")
    .select("user_id")
    .eq("id", GHOST_RECORDING_ID)
    .single();
  if (!ghostRow?.user_id) {
    console.error("Could not resolve Karel's user_id from Ghost recording");
    process.exit(1);
  }
  const userId = ghostRow.user_id;
  console.log(`Operating on recordings for user ${userId}\n`);

  let total = 0;
  let transcoded = 0;
  let skipped = 0;
  const failures = [];

  for (const spec of TRACK_PATTERNS) {
    total += 1;
    console.log(`[${spec.id}] looking up "${spec.pattern}"…`);
    const rec = await findRecording(supabase, userId, spec);
    if (!rec) {
      console.log(`  ✗ no matching recording`);
      failures.push(spec.id);
      continue;
    }
    console.log(`  found: ${rec.title}  (${rec.file_name?.split("/").pop()})`);
    try {
      const result = await transcodeOne(supabase, rec);
      if (result.transcoded) transcoded += 1;
      if (result.skipped) skipped += 1;
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
      failures.push(spec.id);
    }
  }

  console.log(`\nSummary: ${transcoded} transcoded · ${skipped} skipped · ${failures.length} failed (of ${total} total)`);
  if (failures.length > 0) {
    console.log(`Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
