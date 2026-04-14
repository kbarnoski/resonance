// Step 1: find the 13 Welcome Home tracks and their analysis status.
// Reads env from .env.local, uses service role to bypass RLS.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf-8");
const getEnv = (name) => {
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : undefined;
};

const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";

// Find all tracks that look like Welcome Home album tracks.
// Match titles starting "01_", "02_" ... "13_" (with flexible separators and leading zeros).
const { data: tracks, error } = await supabase
  .from("recordings")
  .select("id, title, duration, file_name, created_at")
  .eq("user_id", USER_ID)
  .order("title", { ascending: true });

if (error) {
  console.error("Query failed:", error);
  process.exit(1);
}

const welcomeHome = (tracks ?? []).filter((t) => /^(0?[1-9]|1[0-3])[_\-\s.]/.test(t.title));
console.log(`Found ${welcomeHome.length} candidate Welcome Home tracks:\n`);

// Fetch each analysis row, if any
const results = [];
for (const t of welcomeHome) {
  const { data: analysis } = await supabase
    .from("analyses")
    .select("*")
    .eq("recording_id", t.id)
    .maybeSingle();

  const cleanTitle = t.title.replace(/^(0?[1-9]|1[0-3])[_\-\s.]+/, "").replace(/\.[a-z0-9]+$/i, "").trim();

  results.push({
    id: t.id,
    rawTitle: t.title,
    cleanTitle,
    duration: t.duration,
    hasAnalysis: !!analysis,
    analysisStatus: analysis?.status ?? null,
    analysisSummary: analysis?.summary ?? null,
    // Only keep the small bits we need; strip huge arrays to keep the JSON tractable
    chordsPreview: analysis?.chords?.slice?.(0, 8) ?? null,
    keyFromAnalysis: analysis?.key_signature ?? null,
    tempoFromAnalysis: analysis?.tempo ?? null,
    hasChords: Array.isArray(analysis?.chords) && analysis.chords.length > 0,
    hasNotes: Array.isArray(analysis?.notes) && analysis.notes.length > 0,
  });

  console.log(`${t.title}`);
  console.log(`  clean: "${cleanTitle}"`);
  console.log(`  id: ${t.id}`);
  console.log(`  duration: ${t.duration}s`);
  console.log(`  analysis: ${analysis ? `${analysis.status} (key=${analysis.key_signature ?? "—"}, tempo=${analysis.tempo ?? "—"}, chords=${Array.isArray(analysis.chords) ? analysis.chords.length : 0})` : "(none)"}`);
  console.log();
}

writeFileSync("scripts/welcome-home-data.json", JSON.stringify(results, null, 2));
console.log(`\nWrote scripts/welcome-home-data.json (${results.length} tracks)`);
