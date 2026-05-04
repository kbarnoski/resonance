import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Welcome Home path stores its journey ids and recording_ids in journey_paths
const { data: paths } = await supabase
  .from("journey_paths")
  .select("name, journey_ids, culmination_journey_id");

const path = (paths ?? []).find((p) => /welcome home/i.test(p.name ?? ""));
if (!path) {
  console.error("no welcome-home path found");
  process.exit(1);
}

const allJids = [...(path.journey_ids ?? []), path.culmination_journey_id].filter(Boolean);
console.log(`Welcome Home path: ${allJids.length} journeys`);

const { data: jrs } = await supabase
  .from("journeys")
  .select("id, name, recording_id")
  .in("id", allJids);

const recIds = (jrs ?? []).map((j) => j.recording_id).filter(Boolean);
const { data: recs } = await supabase
  .from("recordings")
  .select("id, title")
  .in("id", recIds);

const byId = new Map(recs?.map((r) => [r.id, r.title]));
console.log("\nWelcome Home tracks:");
for (const j of jrs ?? []) {
  console.log(`  ${j.name?.padEnd(28)} → ${byId.get(j.recording_id) ?? "(none)"}`);
}
