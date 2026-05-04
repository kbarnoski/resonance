import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Identify Karel's user_id by email so we can filter his recordings
// only — earlier version of this script queried unfiltered with the
// service role key, which surfaced other users' tracks. Bug.
const KAREL_EMAIL = process.env.ADMIN_EMAIL || "kbarnoski@gmail.com";

const { data: users } = await supabase.auth.admin.listUsers();
const karel = users?.users?.find((u) => u.email === KAREL_EMAIL);
if (!karel) {
  console.error(`could not find user with email ${KAREL_EMAIL}`);
  process.exit(1);
}
console.log(`Karel's user_id: ${karel.id}\n`);

const { data, error } = await supabase
  .from("recordings")
  .select("id, title, artist, duration, audio_codec, is_featured, created_at, user_id")
  .eq("user_id", karel.id)
  .order("created_at", { ascending: true });

if (error) { console.error(error); process.exit(1); }

console.log(`total (Karel's only): ${data.length}\n`);
for (const r of data) {
  const dur = r.duration
    ? `${Math.floor(r.duration / 60)}:${String(Math.floor(r.duration % 60)).padStart(2, "0")}`
    : "?";
  const flag = r.is_featured ? " ★" : "";
  console.log(`${flag.padStart(2)} ${dur.padStart(5)}  ${r.audio_codec ?? "?"}  ${r.title ?? "(untitled)"}  [${r.id.slice(0, 8)}]`);
}
