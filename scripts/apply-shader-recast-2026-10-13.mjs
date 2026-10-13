#!/usr/bin/env node
// apply-shader-recast-2026-10-13.mjs — put the 2026-10-13 shader recast's
// EXPANSION casts where the runtime reads them. (Featured / album casts ship
// in the bundle — src/lib/journeys/journey-casts.generated.ts — and need
// only a deploy.) Expansion journeys play phases[].shaderModes from the
// Tramokyo pack (kiosk, offline) and from their DB rows (web).
//
// Input: scripts/shader-recast-2026-10-13.expansion-casts.json, written by
// scripts/rebalance-shader-casts.mjs:
//   journeys: {id: {name, before, handEdited, after}} — per phase id.
//     `before` = the pack before the 2026-10-13 hand edit (dharma purge,
//     ~/Documents/Resonance/pack-journeys.backup-2026-10-13-dharma.json);
//     `handEdited` = the pack as it was when the recast ran (after that edit).
//     A phase is rewritten to `after` ONLY when it currently holds `before`
//     or `handEdited` (or already `after`); anything else is reported and
//     left alone, so a later edit is never clobbered.
//   ensure: {id: {name, musts, bans}} — parked takes with no recast cast
//     (Surrounded by Light 19 / 3): each must (seraph) present in some phase,
//     no banned shader (dharma) anywhere; minimal edits, idempotent.
// The pack file is backed up first and written in its own layout.
//
// Usage (repo root, on the kiosk Mac — no heavy work while Karel watches):
//   node scripts/apply-shader-recast-2026-10-13.mjs                 # check only (writes nothing)
//   node scripts/apply-shader-recast-2026-10-13.mjs --pack          # write the pack
//   node --env-file=.env.local scripts/apply-shader-recast-2026-10-13.mjs --db   # write the DB rows
// Then: npx vitest run src/lib/journeys/shader-balance.test.ts (checks the pack).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { readPackJson } from "./lib/pack-json.mjs";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const PACK_PATH = arg("pack-path", "public/tramokyo-pack/data/journeys.json");
const WRITE_PACK = process.argv.includes("--pack");
const WRITE_DB = process.argv.includes("--db");
const { journeys, ensure = {} } = JSON.parse(readFileSync(arg("input", "scripts/shader-recast-2026-10-13.expansion-casts.json"), "utf8"));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const problems = [];

/** Rewrite a row's phases to the final cast where they hold a known state. */
function rewrite(phases, j, where) {
  let changed = 0, already = 0;
  const out = phases.map((p) => {
    if (!(p.id in j.after)) return p;
    const want = j.after[p.id];
    if (same(p.shaderModes, want)) { already++; return p; }
    const known = same(p.shaderModes, j.before?.[p.id]) ? "before" : same(p.shaderModes, j.handEdited?.[p.id]) ? "hand-edited" : null;
    if (!known) { problems.push(`${where} ${j.name}/${p.id}: holds ${JSON.stringify(p.shaderModes)} — neither the backup, the hand-edited nor the final state; left alone`); return p; }
    changed++;
    return { ...p, shaderModes: [...want] };
  });
  return { out, changed, already };
}

/** Parked takes: every must present somewhere, nothing banned anywhere. */
function ensurePins(phases, e, where) {
  let changed = 0;
  const intensity = (p) => (p.sparse ? -1 : p.intensityMultiplier ?? 0.5);
  let out = phases.map((p) => ({ ...p, shaderModes: [...(p.shaderModes ?? [])] }));
  const has = (m) => out.some((p) => p.shaderModes.includes(m));
  for (const p of out) for (let i = 0; i < p.shaderModes.length; i++) {
    if (!e.bans.includes(p.shaderModes[i])) continue;
    const must = e.musts.find((m) => !has(m));
    if (must) p.shaderModes[i] = must; else p.shaderModes.splice(i--, 1);
    changed++;
  }
  for (const m of e.musts) if (!has(m)) {
    const peak = [...out].sort((a, b) => intensity(b) - intensity(a))[0];
    peak.shaderModes.push(m); changed++;
  }
  const known = same(phases.map((p) => p.shaderModes), Object.values(e.before ?? {})) || same(phases.map((p) => p.shaderModes), Object.values(e.handEdited ?? {}));
  if (!known) console.warn(`  ! ${where} ${e.name}: phases are neither the backup nor the hand-edited state (pins still ensured)`);
  if (!changed) out = phases;
  return { out, changed };
}

// ── pack ──
const pack = readPackJson(PACK_PATH);
let packChanged = 0;
for (const [id, j] of Object.entries(journeys)) {
  const row = pack.data.find((r) => r.id === id);
  if (!row) { problems.push(`pack: no row for ${j.name}`); continue; }
  const { out, changed, already } = rewrite(row.phases, j, "pack");
  row.phases = out; packChanged += changed;
  console.log(`pack ${j.name.padEnd(24)} ${changed} phase(s) to change${already ? `, ${already} already final` : ""}`);
}
for (const [id, e] of Object.entries(ensure)) {
  const row = pack.data.find((r) => r.id === id);
  if (!row) { problems.push(`pack: no row for ${e.name}`); continue; }
  const { out, changed } = ensurePins(row.phases, e, "pack");
  row.phases = out; packChanged += changed;
  console.log(`pack ${e.name.padEnd(24)} ${changed ? `${changed} pin edit(s)` : `pins ok (${e.musts.join(", ")})`}`);
}
if (problems.length) console.warn(`\nREPORT — ${problems.length} phase(s) not touched:\n  ${problems.join("\n  ")}\n`);
if (WRITE_PACK && packChanged) {
  const dir = `${os.homedir()}/resonance-pack-backups/shader-recast-2026-10-13-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  mkdirSync(dir, { recursive: true });
  copyFileSync(PACK_PATH, `${dir}/journeys.json`);
  pack.write();
  console.log(`pack written (${packChanged} phase edits) · backup ${dir}/journeys.json`);
} else console.log(`pack: ${packChanged} phase edit(s) ${WRITE_PACK ? "— nothing to write" : "pending — pass --pack to write"}`);

// ── DB ──
if (WRITE_DB) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const rows = [...Object.entries(journeys).map(([id, j]) => [id, j, false]), ...Object.entries(ensure).map(([id, e]) => [id, e, true])];
  for (const [id, j, isEnsure] of rows) {
    const { data, error } = await sb.from("journeys").select("phases").eq("id", id).single(); // fresh read right before writing
    if (error) { console.warn(`db   ${j.name}: ${error.message}`); continue; }
    const { out, changed } = isEnsure ? ensurePins(data.phases, j, "db") : rewrite(data.phases, j, "db");
    if (!changed) { console.log(`db   ${j.name.padEnd(24)} nothing to change`); continue; }
    const { error: e2 } = await sb.from("journeys").update({ phases: out }).eq("id", id);
    if (e2) throw e2;
    console.log(`db   ${j.name.padEnd(24)} ${changed} phase edit(s) written`);
  }
}
