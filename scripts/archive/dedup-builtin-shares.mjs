import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from("journeys")
  .select("id, user_id, name, share_token, theme, created_at")
  .not("theme", "is", null)
  .order("created_at", { ascending: true });

if (error) { console.error(error); process.exit(1); }

const builtins = data.filter(r => r.theme?.builtinJourneyId);
console.log("Total built-in share rows:", builtins.length);

// Group by user_id + builtinJourneyId — keep oldest, delete rest
const groups = {};
for (const row of builtins) {
  const key = `${row.user_id}|${row.theme.builtinJourneyId}`;
  if (!groups[key]) groups[key] = [];
  groups[key].push(row);
}

const toDelete = [];
for (const [key, rows] of Object.entries(groups)) {
  const journeyId = key.split("|")[1];
  console.log(`${journeyId}: ${rows.length} row(s) — keeping token ${rows[0].share_token}`);
  if (rows.length > 1) {
    const dupes = rows.slice(1);
    console.log(`  deleting ${dupes.length} duplicate(s):`, dupes.map(r => r.id));
    toDelete.push(...dupes.map(r => r.id));
  }
}

if (toDelete.length === 0) {
  console.log("\nNo duplicates to clean up.");
} else if (process.argv.includes("--dry-run")) {
  console.log(`\nDry run: would delete ${toDelete.length} row(s).`);
} else {
  const { error: delErr } = await supabase
    .from("journeys")
    .delete()
    .in("id", toDelete);
  if (delErr) {
    console.error("Delete failed:", delErr);
  } else {
    console.log(`\nDeleted ${toDelete.length} duplicate(s).`);
  }
}
