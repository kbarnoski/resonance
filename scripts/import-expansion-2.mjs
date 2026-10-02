// Import Expansion set 2 (Karel 2026-10-01: "cue up the entire folder
// ignoring duplicates") — every file in ~/Desktop/Suno Songs/ whose
// asterisk-stripped title is not already a recording (DB or pack).
// Same transcode/upload/idempotency pattern as import-expansion.mjs.
// NAMING LAW: title = "<Name> <take>" exactly — the filename asterisks
// are Karel's file marks and are stripped (a trailing "*" breaks the
// title-card "No. N" split).
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const SRC = path.join(process.env.HOME, "Desktop", "Suno Songs");
const TMP = path.join(process.env.HOME, "Desktop", ".expansion-aac-tmp");
const OUT = "scripts/expansion2-import.json";
await mkdir(TMP, { recursive: true });

const norm = (t) => (t || "").replace(/\*/g, "").trim().toLowerCase();
const { data: recs, error: recErr } = await supabase.from("recordings").select("id,title,file_size").eq("user_id", USER_ID);
if (recErr) throw recErr;
const pack = JSON.parse(readFileSync("public/tramokyo-pack/data/recordings.json", "utf8"));
const packRows = Array.isArray(pack) ? pack : pack.recordings;
// Prior run of THIS script: those titles are ours (idempotent re-run).
let prior = [];
try { prior = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
const ours = new Set(prior.map((p) => norm(p.title)));
const have = new Set([...recs, ...packRows].map((r) => norm(r.title)).filter((t) => !ours.has(t)));

const files = readdirSync(SRC).filter((f) => /\.m4a$/i.test(f)).sort();
const imported = [...prior];
for (const file of files) {
  const title = file.replace(/\.m4a$/i, "").replace(/\*/g, "").trim();
  if (have.has(norm(title))) { console.log(`  - skip (already in Resonance): ${title}`); continue; }
  if (imported.some((p) => norm(p.title) === norm(title) && p.id)) { console.log(`  = done: ${title}`); continue; }
  const aacPath = path.join(TMP, `${title.replace(/[^\w]/g, "_")}.m4a`);
  const r = spawnSync(ffmpegPath, ["-y", "-nostdin", "-i", path.join(SRC, file), "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", aacPath], { stdio: "pipe" });
  if (r.status !== 0) { console.log(`  x transcode ${title}: ${r.stderr.toString().slice(-200)}`); continue; }
  const buf = await readFile(aacPath);
  const probe = spawnSync(ffmpegPath, ["-nostdin", "-i", aacPath], { stdio: "pipe" }).stderr.toString();
  const dm = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const dur = dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]) : 0;

  const dup = recs.find((e) => e.title === title && e.file_size === buf.length);
  if (dup) { console.log(`  = exists: ${title}`); imported.push({ title, id: dup.id, duration: dur }); continue; }

  const storagePath = `${USER_ID}/${Date.now()}-EXP2-${title.replace(/[^\w\- ()]/g, "")}.m4a`;
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
  console.log(`  + ${title.padEnd(24)} ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")}  ${row.id.slice(0, 8)}`);
  imported.push({ title, id: row.id, duration: dur });
  writeFileSync(OUT, JSON.stringify(imported, null, 2));
}
writeFileSync(OUT, JSON.stringify(imported, null, 2));
console.log(`\n${imported.length} tracks -> ${OUT}`);
