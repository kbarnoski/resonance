import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const RECORDING_IDS = [
  "c3c34efa-76e1-4375-9e01-499eafd8d126", // Without a brightness
  "aafddeb5-5333-49f5-8308-16dd6d59a1f2", // That One
  "bcd04d03-8bdc-4868-bb30-f620349f54fe", // WYN_MAR4_1.1
  "ca26d632-bf64-4ab8-bbcf-24f49e238b73", // KB_SFLAKE_TK1 (Joseph's Snowflake Take 1)
  "0d167679-42af-44b9-be6b-0e383c2ef56e", // Isolation (alt)
  "58adf3df-ca11-4935-a468-f48c12eec172", // champa
  "59845a37-",                             // Naive — resolved below by prefix
  "e2b6d0af-",                             // New Recording 18 — resolved below
];
const JOURNEY_IDS_PREFIX = ["218025cb-", "1d8042ef-"];
const ARCHIVE = path.join(process.env.HOME, "Documents", "Music", "Removed-from-Resonance-2026-09-19");
await mkdir(ARCHIVE, { recursive: true });

// Resolve full ids for the two prefix entries
const { data: allRecs } = await supabase.from("recordings").select("id, title, file_name, aac_file_name");
const ids = [];
for (const want of RECORDING_IDS) {
  const hit = (allRecs ?? []).find((r) => r.id === want || r.id.startsWith(want));
  if (hit) ids.push(hit);
  else console.log(`!! not found: ${want}`);
}
console.log(`resolving ${ids.length} recordings`);

// 1. ARCHIVE storage files locally
for (const r of ids) {
  for (const src of [r.file_name, r.aac_file_name].filter(Boolean)) {
    const { data: blob, error } = await supabase.storage.from("recordings").download(src);
    if (error || !blob) { console.log(`  archive FAILED ${r.title} (${src}): ${error?.message}`); continue; }
    const safe = r.title.replace(/[^\w\- .]/g, "_");
    const ext = src.match(/\.[a-z0-9]+$/i)?.[0] ?? ".m4a";
    const suffix = src === r.aac_file_name ? ".aac" : "";
    await writeFile(path.join(ARCHIVE, `${safe}${suffix}${ext}`), Buffer.from(await blob.arrayBuffer()));
    console.log(`  archived ${r.title}${suffix}${ext}`);
  }
}

// 2. Resolve full journey ids
const { data: js } = await supabase.from("journeys").select("id, name");
const journeyIds = (js ?? []).filter((j) => JOURNEY_IDS_PREFIX.some((p) => j.id.startsWith(p))).map((j) => j.id);
console.log("journeys to delete:", journeyIds.length);

// 3. DB deletes: children first
const recIds = ids.map((r) => r.id);
for (const table of ["markers", "analyses"]) {
  const { error, count } = await supabase.from(table).delete({ count: "exact" }).in("recording_id", recIds);
  console.log(`  ${table}: ${error ? "ERR " + error.message : (count ?? 0) + " deleted"}`);
}
if (journeyIds.length) {
  const { error, count } = await supabase.from("journeys").delete({ count: "exact" }).in("id", journeyIds);
  console.log(`  journeys: ${error ? "ERR " + error.message : (count ?? 0) + " deleted"}`);
}
const { error: recErr, count: recCount } = await supabase.from("recordings").delete({ count: "exact" }).in("id", recIds);
console.log(`  recordings: ${recErr ? "ERR " + recErr.message : (recCount ?? 0) + " deleted"}`);

// 4. Storage deletes
const storagePaths = ids.flatMap((r) => [r.file_name, r.aac_file_name].filter(Boolean));
if (storagePaths.length) {
  const { data: del, error: stErr } = await supabase.storage.from("recordings").remove(storagePaths);
  console.log(`  storage: ${stErr ? "ERR " + stErr.message : (del?.length ?? 0) + " files removed"}`);
}
console.log("PURGE DONE. Archived copies in", ARCHIVE);
console.log("deleted ids:", recIds.join(","));
