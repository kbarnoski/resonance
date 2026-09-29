// Import the Expansion set (6 Suno-exported takes, Opus in .m4a) into
// Resonance. Same pattern as import-march-light: transcode to AAC
// 192k/48k, upload, insert with idempotency on title+size.
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const SRC = path.join(process.env.HOME, "Desktop", "Suno Songs");
const TMP = path.join(process.env.HOME, "Desktop", ".expansion-aac-tmp");
await mkdir(TMP, { recursive: true });

// Karel 2026-09-29: set order as given. Titles keep the take number —
// they identify the exact take (matches library conventions like
// "Folsom St 5").
const TRACKS = [
  "Surrounded by Light 6",
  "Nothing 30",
  "Night Wind 2",
  "The Other Side 10",
  "Northern Plane 5",
  "No question 8",
];

const imported = [];
for (let i = 0; i < TRACKS.length; i++) {
  const title = TRACKS[i];
  const srcPath = path.join(SRC, `${title}.m4a`);
  const aacPath = path.join(TMP, `${i + 1}.m4a`);
  const r = spawnSync(ffmpegPath, ["-y", "-i", srcPath, "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", aacPath], { stdio: "pipe" });
  if (r.status !== 0) { console.log(`  x transcode ${title}: ${r.stderr.toString().slice(-200)}`); continue; }
  const buf = await readFile(aacPath);
  const probe = spawnSync(ffmpegPath, ["-i", aacPath], { stdio: "pipe" }).stderr.toString();
  const dm = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const dur = dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]) : 0;

  const { data: existing } = await supabase.from("recordings").select("id, file_size").eq("user_id", USER_ID).eq("title", title);
  const dup = (existing ?? []).find((e) => e.file_size === buf.length);
  if (dup) { console.log(`  = exists: ${title}`); imported.push({ order: i + 1, title, id: dup.id, duration: dur }); continue; }

  const storagePath = `${USER_ID}/${Date.now()}-EXP-${title.replace(/[^\w\- ()]/g, "")}.m4a`;
  const { error: upErr } = await supabase.storage.from("recordings").upload(storagePath, buf, { contentType: "audio/mp4" });
  if (upErr) { console.log(`  x upload ${title}: ${upErr.message}`); continue; }
  const row = {
    id: randomUUID(), user_id: USER_ID, title, artist: "Karel Barnoski",
    file_name: storagePath, audio_url: storagePath, aac_file_name: storagePath,
    audio_codec: "aac", duration: dur, file_size: buf.length,
    recorded_at: new Date().toISOString(),
    share_token: randomUUID().replace(/-/g, "").slice(0, 16), is_featured: false,
  };
  const { error: insErr } = await supabase.from("recordings").insert(row);
  if (insErr) { console.log(`  x insert ${title}: ${insErr.message}`); continue; }
  console.log(`  + ${i + 1} ${title.padEnd(24)} ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")}  ${row.id.slice(0, 8)}`);
  imported.push({ order: i + 1, title, id: row.id, duration: dur });
}
const sorted = imported.sort((a, b) => a.order - b.order);
(await import("node:fs")).writeFileSync("scripts/expansion-import.json", JSON.stringify(sorted, null, 2));
console.log(`\n${sorted.length} tracks -> scripts/expansion-import.json`);
