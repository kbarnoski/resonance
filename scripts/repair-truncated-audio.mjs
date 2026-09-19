// One-off: repair the three truncated Tramokyo pack audio files by
// re-downloading the ORIGINAL uploads and transcoding locally, then
// verifying real duration against the DB metadata.
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import { spawn, execSync } from "node:child_process";
import { writeFile, unlink, rename } from "node:fs/promises";
import path from "node:path";

const IDS = [
  "2ff2768b-98a7-44eb-a498-473d9b7c33dc", // 17th St 63 spectre (The Tempest)
  "64c5cca9-a1db-41b8-8ebf-e3a6f6ede9f5", // 17th St 62 (Abyssal Dive)
  "808f253c-bca9-42e6-b0f7-5762b8d92a92", // Folsom St 5 (The Ascent)
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const AUDIO_DIR = path.join(process.cwd(), "public", "tramokyo-pack", "audio");

function transcode(inp, out) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ["-y", "-i", inp, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}: ${err.slice(-300)}`))));
    p.on("error", reject);
  });
}

function realDuration(f) {
  const out = execSync(`afinfo "${f}"`, { encoding: "utf8" });
  return parseFloat(out.match(/estimated duration: ([\d.]+)/)?.[1] ?? "NaN");
}

const { data: recs, error } = await supabase
  .from("recordings")
  .select("id, title, duration, file_name, aac_file_name")
  .in("id", IDS);
if (error) throw error;

for (const rec of recs) {
  console.log(`\n── ${rec.title} (db ${rec.duration?.toFixed(0)}s)`);
  console.log(`   original: ${rec.file_name} · persisted aac: ${rec.aac_file_name ?? "none"}`);

  // Diagnose the persisted AAC too, if there is one.
  for (const src of [rec.aac_file_name, rec.file_name].filter(Boolean)) {
    const { data: blob, error: dlErr } = await supabase.storage.from("recordings").download(src);
    if (dlErr || !blob) { console.log(`   ✗ download failed for ${src}: ${dlErr?.message}`); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const tmp = path.join(AUDIO_DIR, `${rec.id}.check.m4a`);
    await writeFile(tmp, buf);
    let dur = NaN;
    try { dur = realDuration(tmp); } catch { /* unreadable */ }
    console.log(`   source ${src}: ${(buf.length / 1024 / 1024).toFixed(1)}MB, real ${dur.toFixed(0)}s`);
    // The uploads themselves are truncated (2026-09-18 finding): the DB
    // duration is aspirational, the REAL audio is what we have. Install a
    // clean re-encode whose header matches the real audio so Chrome fires
    // `ended` at the true end instead of stalling on a long header.
    const out = path.join(AUDIO_DIR, `${rec.id}.new.m4a`);
    await transcode(tmp, out);
    await unlink(tmp).catch(() => {});
    const outDur = realDuration(out);
    if (!(outDur > 10) || Math.abs(outDur - dur) > 5) { console.log(`   ✗ re-encode came out ${outDur.toFixed(0)}s vs source ${dur.toFixed(0)}s — NOT installing`); await unlink(out).catch(() => {}); continue; }
    await rename(out, path.join(AUDIO_DIR, `${rec.id}.m4a`));
    console.log(`   ✓ INSTALLED clean ${outDur.toFixed(0)}s AAC from ${src}`);
    // Correct the DB duration to reality so journey caps + displays agree.
    const { error: upErr } = await supabase.from("recordings").update({ duration: Math.round(outDur * 1000) / 1000 }).eq("id", rec.id);
    console.log(upErr ? `   ✗ db duration update failed: ${upErr.message}` : `   ✓ db duration corrected ${rec.duration?.toFixed(0)}s → ${outDur.toFixed(0)}s`);
    break;
  }
}
console.log("\ndone");
