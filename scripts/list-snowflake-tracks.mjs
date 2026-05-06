#!/usr/bin/env node
/**
 * Quick lookup: list all of Karel's tracks matching SFLAKE/snowflake.
 * Used to verify which one the installation pairing is grabbing.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: ghostRow } = await supabase
  .from("recordings")
  .select("user_id")
  .eq("id", "549fc519-f7fc-4c38-a771-adaad2edbc81")
  .single();

const { data, error } = await supabase
  .from("recordings")
  .select("id, title, file_name, aac_file_name, duration")
  .eq("user_id", ghostRow.user_id)
  .or("title.ilike.%SFLAKE%,title.ilike.%snowflake%")
  .order("created_at", { ascending: true });

if (error) { console.error(error); process.exit(1); }

console.log(`Found ${data.length} matching tracks:\n`);
for (const r of data) {
  const dur = r.duration ? `${Math.floor(r.duration/60)}:${String(Math.floor(r.duration%60)).padStart(2,"0")}` : "?";
  const fmt = r.aac_file_name ? "M4A" : "WAV";
  console.log(`  ${r.title}`);
  console.log(`    duration: ${dur}  ·  format: ${fmt}  ·  id: ${r.id}`);
  console.log("");
}
