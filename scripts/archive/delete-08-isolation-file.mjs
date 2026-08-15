// One-shot: delete the orphaned 08_Isolation storage file.
//
// The DB row is already gone (deleted by the SQL migration). This removes
// the actual blob from the recordings bucket.
//
// Run with: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/delete-08-isolation-file.mjs
// or with anon key + no auth (will fail unless RLS allows the delete).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Read .env.local for SUPABASE_URL
const env = readFileSync(".env.local", "utf-8");
const getEnv = (name) => {
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : undefined;
};

const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in env");
  console.error("Get it from: https://supabase.com/dashboard/project/_/settings/api → service_role");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const FILE_PATH = "8d9f4d41-88de-45ea-a3af-5b241d105256/1776134547276-08_Isolation.mp3";

const { data, error } = await supabase.storage.from("recordings").remove([FILE_PATH]);

if (error) {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
}

console.log("Deleted:", data);
