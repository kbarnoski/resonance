// Import the March Light album (10 tracks, 24/96 WAV masters) into
// Resonance. Transcodes to AAC 192k/48k first (SBL pattern: AAC-native,
// no downstream transcoding). Titles WITHOUT track numbers; numbers set
// the set order. Title collisions with the existing library
// ("Surrounded By Light", "Grasshopper") are EXPECTED distinct
// recordings — idempotency keys on title+file_size of the AAC.
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import { spawnSync, execSync } from "node:child_process";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const SRC = path.join(process.env.HOME, "Desktop", "Karel Barnoski - March Light 2496");
const TMP = path.join(process.env.HOME, "Desktop", ".ml-aac-tmp");
await mkdir(TMP, { recursive: true });

const files = (await readdir(SRC)).filter((f) => f.endsWith(".wav")).sort();
console.log(`March Light: ${files.length} masters`);
const imported = [];
for (const f of files) {
  const m = f.match(/^(\d+)\s+(.+)\.wav$/);
  if (!m) { console.log(`  !! unparseable: ${f}`); continue; }
  const order = Number(m[1]);
  const title = m[2].replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

  const aacPath = path.join(TMP, `${order}.m4a`);
  const r = spawnSync(ffmpegPath, ["-y", "-i", path.join(SRC, f), "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", aacPath], { stdio: "pipe" });
  if (r.status !== 0) { console.log(`  ✗ transcode failed ${title}: ${r.stderr.toString().slice(-200)}`); continue; }
  const buf = await readFile(aacPath);
  const dur = parseFloat(execSync(`afinfo "${aacPath}"`, { encoding: "utf8" }).match(/estimated duration: ([\d.]+)/)?.[1] ?? "0");

  // Idempotency: same title AND same AAC byte size = this exact import.
  const { data: existing } = await supabase.from("recordings").select("id, file_size").eq("user_id", USER_ID).eq("title", title);
  const dup = (existing ?? []).find((e) => e.file_size === buf.length);
  if (dup) { console.log(`  = exists: ${title}`); imported.push({ order, title, id: dup.id, duration: dur }); continue; }

  const storagePath = `${USER_ID}/${Date.now()}-ML-${title.replace(/[^\w\- ()]/g, "")}.m4a`;
  const { error: upErr } = await supabase.storage.from("recordings").upload(storagePath, buf, { contentType: "audio/mp4" });
  if (upErr) { console.log(`  ✗ upload ${title}: ${upErr.message}`); continue; }
  const row = {
    id: randomUUID(), user_id: USER_ID, title, artist: "Karel Barnoski",
    file_name: storagePath, audio_url: storagePath, aac_file_name: storagePath,
    audio_codec: "aac", duration: dur, file_size: buf.length,
    recorded_at: "2025-12-01T00:00:00+00:00",
    share_token: randomUUID().replace(/-/g, "").slice(0, 16), is_featured: false,
  };
  const { error: insErr } = await supabase.from("recordings").insert(row);
  if (insErr) { console.log(`  ✗ insert ${title}: ${insErr.message}`); continue; }
  console.log(`  ✓ ${String(order).padStart(2, "0")} ${title.padEnd(26)} ${Math.floor(dur/60)}:${String(Math.round(dur%60)).padStart(2,"0")}  ${row.id.slice(0,8)}`);
  imported.push({ order, title, id: row.id, duration: dur });
}
const sorted = imported.sort((a, b) => a.order - b.order);
(await import("node:fs")).writeFileSync("scripts/ml-import.json", JSON.stringify(sorted, null, 2));
console.log(`\n${sorted.length} tracks → scripts/ml-import.json`);
