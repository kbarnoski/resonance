#!/usr/bin/env node
// reexport-analyses.mjs — refresh the Tramokyo pack's analyses snapshot
// (public/tramokyo-pack/data/analyses.json) from Supabase so the offline
// kiosk carries the full v2 deep summaries (2026-10-05: the pack held 7 v2
// rows of 109). The FROZEN recordings (scripts/deep-analysis-protected.json
// — Snowflake, Realized, Ghost + the Kinetic Lab five) keep their pack rows
// byte-identical; every other row is replaced by the live row, new
// completed rows are appended. Same query + layout as build-tramokyo-pack.
// Usage: node --env-file=.env.local scripts/mv-rollout/reexport-analyses.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import { readPackJson } from "../lib/pack-json.mjs";

const DRY = process.argv.includes("--dry-run");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const FROZEN = new Set(Object.keys(JSON.parse(readFileSync("scripts/deep-analysis-protected.json", "utf8"))));
const PATH = "public/tramokyo-pack/data/analyses.json";
const pack = readPackJson(PATH);
const live = [];
for (let from = 0; ; from += 20) {
  const { data, error } = await sb.from("analyses").select("*").eq("status", "completed").order("id").range(from, from + 19);
  if (error) throw error;
  live.push(...data);
  if (data.length < 20) break;
}
const liveById = new Map(live.map((r) => [r.id, r]));
let kept = 0, replaced = 0, missingLive = 0;
const out = pack.data.map((row) => {
  if (FROZEN.has(row.recording_id)) { kept++; return row; }
  const fresh = liveById.get(row.id);
  if (!fresh) { missingLive++; return row; }
  replaced++;
  return fresh;
});
const have = new Set(pack.data.map((r) => r.id));
const added = live.filter((r) => !have.has(r.id) && !FROZEN.has(r.recording_id));
out.push(...added);
const v2 = out.filter((r) => r.summary?.version === 2).length;
console.log(`frozen kept ${kept} · replaced ${replaced} · appended ${added.length} · not in DB ${missingLive} · v2 summaries ${v2}/${out.length}`);
// frozen rows must be byte-identical
for (const row of pack.data) if (FROZEN.has(row.recording_id)) {
  const n = out.find((r) => r.id === row.id);
  if (JSON.stringify(n) !== JSON.stringify(row)) throw new Error(`frozen row changed: ${row.id}`);
}
if (DRY) process.exit(0);
const B = `${os.homedir()}/resonance-pack-backups/analyses-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(B, { recursive: true });
copyFileSync(PATH, `${B}/analyses.json`);
pack.write(out);
console.log(`written · backup ${B}/analyses.json`);
