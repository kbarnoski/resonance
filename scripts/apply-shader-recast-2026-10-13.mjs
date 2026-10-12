#!/usr/bin/env node
// apply-shader-recast-2026-10-13.mjs — put the 2026-10-13 shader recast's
// EXPANSION casts where the runtime reads them. (Featured / album casts ship
// in the bundle — src/lib/journeys/journey-casts.generated.ts — and need
// only a deploy.) Expansion journeys play phases[].shaderModes from the
// Tramokyo pack (kiosk, offline) and from their DB rows (web).
//
// Input: scripts/shader-recast-2026-10-13.expansion-casts.json (written by
// scripts/rebalance-shader-casts.mjs: {journeys: {id: {name, before, after}}}).
// Each phase is rewritten ONLY when it still holds the `before` cast (a
// later edit is never clobbered — reported and skipped). The pack file is
// backed up first and written in its own layout (scripts/lib/pack-json.mjs).
//
// Usage (from the repo root on the kiosk Mac — no heavy work while Karel watches):
//   node scripts/apply-shader-recast-2026-10-13.mjs            # check only
//   node scripts/apply-shader-recast-2026-10-13.mjs --pack     # write the pack
//   node --env-file=.env.local scripts/apply-shader-recast-2026-10-13.mjs --db   # write the DB rows
// Then: npx vitest run src/lib/journeys/shader-balance.test.ts (checks the pack).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { readPackJson } from "./lib/pack-json.mjs";

const PACK_PATH = "public/tramokyo-pack/data/journeys.json";
const WRITE_PACK = process.argv.includes("--pack");
const WRITE_DB = process.argv.includes("--db");
const { journeys } = JSON.parse(readFileSync("scripts/shader-recast-2026-10-13.expansion-casts.json", "utf8"));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function rewrite(phases, j, where) {
  let changed = 0, already = 0;
  const out = phases.map((p) => {
    if (!(p.id in j.after)) return p;
    if (same(p.shaderModes, j.after[p.id])) { already++; return p; }
    if (!same(p.shaderModes, j.before[p.id])) { console.warn(`  ! ${where} ${j.name}/${p.id}: holds ${JSON.stringify(p.shaderModes)}, not the expected before — skipped`); return p; }
    changed++;
    return { ...p, shaderModes: [...j.after[p.id]] };
  });
  return { out, changed, already };
}

// ── pack ──
const pack = readPackJson(PACK_PATH);
let packChanged = 0;
for (const [id, j] of Object.entries(journeys)) {
  const row = pack.data.find((r) => r.id === id);
  if (!row) { console.warn(`  ! pack: no row for ${j.name}`); continue; }
  const { out, changed, already } = rewrite(row.phases, j, "pack");
  row.phases = out; packChanged += changed;
  console.log(`pack ${j.name.padEnd(24)} ${changed} phase(s) to change${already ? `, ${already} already applied` : ""}`);
}
if (WRITE_PACK && packChanged) {
  const dir = `${os.homedir()}/resonance-pack-backups/shader-recast-2026-10-13-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  mkdirSync(dir, { recursive: true });
  copyFileSync(PACK_PATH, `${dir}/journeys.json`);
  pack.write();
  console.log(`pack written (${packChanged} phases) · backup ${dir}/journeys.json`);
} else console.log(`pack: ${packChanged} phase(s) pending${WRITE_PACK ? "" : " — pass --pack to write"}`);

// ── DB ──
if (WRITE_DB) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const [id, j] of Object.entries(journeys)) {
    const { data, error } = await sb.from("journeys").select("phases").eq("id", id).single(); // fresh read right before writing
    if (error) throw error;
    const { out, changed } = rewrite(data.phases, j, "db");
    if (!changed) { console.log(`db   ${j.name.padEnd(24)} nothing to change`); continue; }
    const { error: e2 } = await sb.from("journeys").update({ phases: out }).eq("id", id);
    if (e2) throw e2;
    console.log(`db   ${j.name.padEnd(24)} ${changed} phase(s) written`);
  }
}
