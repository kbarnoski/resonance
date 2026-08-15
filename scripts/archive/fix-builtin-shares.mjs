import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Built-in journey names to match against
const BUILTIN_NAMES = new Set(["Ghost", "First Snow", "Ascension", "Inferno", "Mycelium Dream", "Solstice", "Cathedral", "Ember"]);

const { data, error } = await supabase
  .from("journeys")
  .select("id, name, theme, share_token")
  .not("share_token", "is", null)
  .order("created_at", { ascending: true });

if (error) { console.error(error); process.exit(1); }

// Find share rows that match a built-in name but have no builtinJourneyId
const toFix = data.filter(r => BUILTIN_NAMES.has(r.name) && !r.theme?.builtinJourneyId);

console.log(`Found ${toFix.length} share row(s) missing builtinJourneyId:\n`);
for (const row of toFix) {
  const builtinId = row.name.toLowerCase().replace(/ /g, "-");
  console.log(`  ${row.name} (${row.id}) → builtinJourneyId: "${builtinId}"`);
}

if (toFix.length === 0) {
  console.log("Nothing to fix.");
  process.exit(0);
}

if (process.argv.includes("--dry-run")) {
  console.log(`\nDry run: would update ${toFix.length} row(s).`);
  process.exit(0);
}

// Patch each row's theme to include builtinJourneyId
let fixed = 0;
for (const row of toFix) {
  const builtinId = row.name.toLowerCase().replace(/ /g, "-");
  const newTheme = { ...(row.theme ?? {}), builtinJourneyId: builtinId };
  const { error: upErr } = await supabase
    .from("journeys")
    .update({ theme: newTheme })
    .eq("id", row.id);
  if (upErr) {
    console.error(`  Failed to update ${row.id}:`, upErr);
  } else {
    fixed++;
  }
}

console.log(`\nFixed ${fixed} row(s). They will no longer show in "Your Journeys".`);
