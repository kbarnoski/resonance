// Import Karel's Oct 4 2026 studio session (~/Desktop/KAREL B - OCT 4 2026/,
// engineer's 24-bit/48k WAV ref mixes) — the core of Resonance: real solo
// piano, classic featured journeys (not kinetic).
//
// NAMING LAW (Karel 2026-10-05): "<Name> <take>" — the name part of the
// engineer's file name, the take number from his "tkN" tag (title cards
// render "Name" + "No. N"); no take tag → plain name. The OCT4 date and the
// "1.2_BSREF" mix-version tag are the engineer's, not part of the title.
//   CALLING_tk3 → "Calling 3"   TESTIMONY_tk3 → "Testimony 3"
//   VESPERS_tk2 → "Vespers 2"   VESPERS_tk3 → "Vespers 3"
//   FIRSTLIGHT → "First Light"  LANTERN → "Lantern"  OPENJAM → "Open Jam"
// Transcode = the app's streaming/pack spec (AAC-LC 192k, 48 kHz stereo,
// +faststart — same as the Expansion imports). Idempotent.
// Usage: node --env-file=.env.local scripts/import-oct4-studio.mjs
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const SRC = path.join(process.env.HOME, "Desktop", "KAREL B - OCT 4 2026");
const TMP = path.join(process.env.HOME, "Desktop", ".oct4-aac-tmp");
const OUT = "scripts/oct4-import.json";
await mkdir(TMP, { recursive: true });

// Spaced names the engineer wrote as one word.
const NAME_FIX = { FIRSTLIGHT: "First Light", OPENJAM: "Open Jam" };
export function titleFromFile(file) {
  const stem = file.replace(/\.wav$/i, "");
  const m = stem.match(/^([A-Z]+)(?:_tk(\d+))?_/i);
  if (!m) throw new Error(`unparsed file name ${file}`);
  const raw = m[1].toUpperCase();
  const name = NAME_FIX[raw] ?? raw.charAt(0) + raw.slice(1).toLowerCase();
  return m[2] ? `${name} ${Number(m[2])}` : name;
}

let prior = [];
try { prior = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
const { data: recs, error: recErr } = await supabase.from("recordings").select("id,title,file_size").eq("user_id", USER_ID);
if (recErr) throw recErr;

const files = readdirSync(SRC).filter((f) => /\.wav$/i.test(f)).sort();
const imported = [...prior];
for (const file of files) {
  const title = titleFromFile(file);
  if (imported.some((p) => p.title === title && p.id)) { console.log(`  = done: ${title}`); continue; }
  if (recs.some((r) => r.title === title)) { console.log(`  ! a recording titled "${title}" already exists — skipping (check by hand)`); continue; }
  const aacPath = path.join(TMP, `${title.replace(/[^\w]/g, "_")}.m4a`);
  const r = spawnSync(ffmpegPath, ["-y", "-nostdin", "-i", path.join(SRC, file), "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", aacPath], { stdio: "pipe" });
  if (r.status !== 0) { console.log(`  x transcode ${title}: ${r.stderr.toString().slice(-200)}`); continue; }
  const buf = await readFile(aacPath);
  const probe = spawnSync(ffmpegPath, ["-nostdin", "-i", aacPath], { stdio: "pipe" }).stderr.toString();
  const dm = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const dur = dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]) : 0;
  const storagePath = `${USER_ID}/${Date.now()}-OCT4-${title.replace(/[^\w\- ()]/g, "")}.m4a`;
  const { error: upErr } = await supabase.storage.from("recordings").upload(storagePath, buf, { contentType: "audio/mp4" });
  if (upErr) { console.log(`  x upload ${title}: ${upErr.message}`); continue; }
  const row = {
    id: randomUUID(), user_id: USER_ID, title, artist: "Karel Barnoski",
    file_name: storagePath, audio_url: storagePath, aac_file_name: storagePath,
    audio_codec: "aac", duration: dur, file_size: buf.length,
    recorded_at: "2026-10-04T12:00:00.000Z",
    description: `Studio session, Oct 4 2026 (engineer's ref mix ${file}).`,
    share_token: randomUUID().replace(/-/g, "").slice(0, 16), is_featured: false,
  };
  const { error: insErr } = await supabase.from("recordings").insert(row);
  if (insErr) { console.log(`  x insert ${title}: ${insErr.message}`); continue; }
  console.log(`  + ${title.padEnd(14)} ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")}  ${row.id}  <- ${file}`);
  imported.push({ title, id: row.id, duration: dur, source: file });
  writeFileSync(OUT, JSON.stringify(imported, null, 2));
}
writeFileSync(OUT, JSON.stringify(imported, null, 2));
console.log(`\n${imported.length} tracks -> ${OUT}`);
