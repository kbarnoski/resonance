// Import the Surrounded by Light LP (12 AAC tracks) into Resonance.
// Mirrors the Welcome Home rows: title WITHOUT track number (order is
// preserved by the path's journey_ids later), artist Karel Barnoski.
// Album released 2023-03-02 (Karel's birthday); files dated 2023-01-25.
import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const SRC = path.join(process.env.HOME, "Desktop", "Karel Barnoski SBL LP AAC");

const files = (await readdir(SRC)).filter((f) => f.endsWith(".m4a")).sort();
console.log(`importing ${files.length} tracks from ${SRC}`);
const imported = [];
for (const f of files) {
  const m = f.match(/^(\d+)\s+(.+)\.m4a$/);
  if (!m) { console.log(`  !! unparseable name: ${f}`); continue; }
  const order = Number(m[1]);
  const title = m[2].trim();

  // Skip if already imported (idempotent re-runs)
  const { data: existing } = await supabase.from("recordings").select("id").eq("user_id", USER_ID).eq("title", title).maybeSingle();
  if (existing) { console.log(`  = exists: ${title} (${existing.id.slice(0,8)})`); imported.push({ order, title, id: existing.id }); continue; }

  const full = path.join(SRC, f);
  const dur = parseFloat(execSync(`afinfo "${full}"`, { encoding: "utf8" }).match(/estimated duration: ([\d.]+)/)?.[1] ?? "0");
  const buf = await readFile(full);
  const storagePath = `${USER_ID}/${Date.now()}-${title.replace(/[^\w\- ]/g, "")}.m4a`;

  const { error: upErr } = await supabase.storage.from("recordings").upload(storagePath, buf, { contentType: "audio/mp4", upsert: false });
  if (upErr) { console.log(`  ✗ upload failed ${title}: ${upErr.message}`); continue; }

  const row = {
    id: randomUUID(),
    user_id: USER_ID,
    title,
    artist: "Karel Barnoski",
    file_name: storagePath,
    audio_url: storagePath,
    aac_file_name: storagePath, // source IS AAC — no transcode ever needed
    audio_codec: "aac",
    duration: dur,
    file_size: buf.length,
    recorded_at: "2023-01-25T00:00:00+00:00",
    share_token: randomUUID().replace(/-/g, "").slice(0, 16),
    is_featured: false,
  };
  const { error: insErr } = await supabase.from("recordings").insert(row);
  if (insErr) { console.log(`  ✗ insert failed ${title}: ${insErr.message}`); continue; }
  console.log(`  ✓ ${String(order).padStart(2, "0")} ${title.padEnd(22)} ${Math.floor(dur/60)}:${String(Math.round(dur%60)).padStart(2,"0")}  ${row.id.slice(0,8)}`);
  imported.push({ order, title, id: row.id });
}
console.log(JSON.stringify(imported.sort((a,b) => a.order-b.order), null, 0));
