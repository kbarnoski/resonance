import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data, error } = await supabase
  .from("recordings")
  .select("id, title, artist, duration, audio_codec, is_featured, created_at, user_id")
  .order("created_at", { ascending: true });

if (error) { console.error(error); process.exit(1); }

console.log(`total: ${data.length}\n`);
for (const r of data) {
  const dur = r.duration ? `${Math.floor(r.duration/60)}:${String(Math.floor(r.duration%60)).padStart(2,'0')}` : "?";
  const flag = r.is_featured ? " ★" : "";
  console.log(`${flag.padStart(2)} ${dur.padStart(5)}  ${r.audio_codec ?? "?"}  ${r.title ?? "(untitled)"}  [${r.id.slice(0,8)}]`);
}
