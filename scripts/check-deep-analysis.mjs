#!/usr/bin/env node
// check-deep-analysis.mjs — FAILS (exit 1) if any recording that plays in
// an active path or the kiosk setlist lacks a v2 deep analysis
// (tempo + data-driven sections + mood + narrative + imagery cues).
// Karel 2026-10-05: "ensure resonance analysis provides deep analysis" —
// this is the guard that keeps a new import from shipping without it.
// Frozen recordings (src/lib/audio/analysis-protected.ts) pass when their
// v2 lives in the sidecar scripts/deep-analysis-protected.json.
// Usage: node --env-file=.env.local scripts/check-deep-analysis.mjs
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const SEQ = await jiti.import("../src/lib/journeys/installation-sequence.ts");
const J = await jiti.import("../src/lib/journeys/journeys.ts");
const { isDeepSummaryV2 } = await jiti.import("../src/lib/audio/deep-summary.ts");
const { ANALYSIS_FROZEN_RECORDINGS } = await jiti.import("../src/lib/audio/analysis-protected.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let sidecar = {};
try { sidecar = JSON.parse(readFileSync("scripts/deep-analysis-protected.json", "utf8")); } catch {}

const { data: journeys, error: e1 } = await sb.from("journeys").select("id,name,recording_id,theme");
if (e1) throw e1;
const { data: paths, error: e2 } = await sb.from("journey_paths").select("name,journey_ids,culmination_journey_id");
if (e2) throw e2;
const byId = new Map(journeys.map((j) => [j.id, j]));
const byBuiltin = new Map(journeys.filter((j) => j.theme?.builtinJourneyId).map((j) => [j.theme.builtinJourneyId, j]));

const need = new Map(); // recording_id -> [where]
const add = (jid, where) => {
  const row = byId.get(jid) ?? byBuiltin.get(jid);
  const rec = row?.recording_id ?? J.JOURNEYS.find((b) => b.id === jid)?.recordingId;
  if (!rec) return; // generative built-in without a fixed recording
  need.set(rec, [...(need.get(rec) ?? []), where]);
};
for (const id of SEQ.TRAMOKYO_SETLIST) add(id, "kiosk setlist");
for (const p of paths) for (const id of [...(p.journey_ids ?? []), ...(p.culmination_journey_id ? [p.culmination_journey_id] : [])]) add(id, `path "${p.name}"`);

const recIds = [...need.keys()];
const { data: rows, error: e3 } = await sb.from("analyses").select("recording_id,summary,recordings(title)").in("recording_id", recIds);
if (e3) throw e3;
const an = new Map(rows.map((r) => [r.recording_id, r]));
const { data: recs } = await sb.from("recordings").select("id,title").in("id", recIds);
const title = new Map(recs.map((r) => [r.id, r.title]));

const missing = [];
let frozenOk = 0;
for (const rec of recIds) {
  if (rec in ANALYSIS_FROZEN_RECORDINGS) {
    if (isDeepSummaryV2(sidecar[rec]?.summary) || isDeepSummaryV2(an.get(rec)?.summary)) { frozenOk++; continue; }
    missing.push({ rec, title: title.get(rec), why: "frozen — no v2 in sidecar", where: need.get(rec) });
    continue;
  }
  const a = an.get(rec);
  if (!a) missing.push({ rec, title: title.get(rec), why: "no analysis row", where: need.get(rec) });
  else if (!isDeepSummaryV2(a.summary)) missing.push({ rec, title: title.get(rec), why: a.summary ? "summary is not v2" : "no summary", where: need.get(rec) });
}
console.log(`${recIds.length} recordings in active paths / kiosk setlist; ${recIds.length - missing.length} have v2 deep analysis (${frozenOk} frozen via sidecar)`);
if (missing.length) {
  for (const m of missing) console.log(`  ✗ ${m.title ?? m.rec} — ${m.why} [${[...new Set(m.where)].join(", ")}]`);
  console.log(`\nDEEP ANALYSIS CHECK FAIL — run: node --env-file=.env.local node_modules/.bin/vite-node --config vitest.config.ts scripts/deep-analysis-backfill.ts`);
  process.exit(1);
}
console.log("DEEP ANALYSIS CHECK PASS");
