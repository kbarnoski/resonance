#!/usr/bin/env node
/**
 * Read-only: list ALL of Karel's recordings with their current public status.
 * Usage: node --env-file=.env.local scripts/list-all-tracks.mjs
 */
import { createClient } from "@supabase/supabase-js";

const KAREL_USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data, error } = await supabase
  .from("recordings")
  .select("id, title, duration, is_featured, share_token, created_at")
  .eq("user_id", KAREL_USER_ID)
  .order("created_at", { ascending: true });

if (error) { console.error(error); process.exit(1); }

let featured = 0, shared = 0, exposed = 0;
console.log(`Found ${data.length} recordings for Karel:\n`);
for (const r of data) {
  const dur = r.duration ? `${Math.floor(r.duration/60)}:${String(Math.floor(r.duration%60)).padStart(2,"0")}` : "?";
  const pub = r.is_featured || r.share_token;
  if (r.is_featured) featured++;
  if (r.share_token) shared++;
  if (pub) exposed++;
  const flags = [r.is_featured ? "FEATURED" : null, r.share_token ? "SHARED" : null].filter(Boolean).join("+") || "private";
  console.log(`  ${(r.title ?? "(untitled)").padEnd(40)} ${dur.padStart(6)}  ${flags.padEnd(16)} ${r.id}`);
}
console.log(`\nTotals: ${data.length} recordings · ${featured} featured · ${shared} shared · ${exposed} anon-servable · ${data.length - exposed} private`);
