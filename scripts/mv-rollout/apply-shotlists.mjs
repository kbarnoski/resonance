#!/usr/bin/env node
// apply-shotlists.mjs — write a Snowflake-Standard shot-list set
// (scripts/mv-rollout/shotlists/<set>.mjs) into the journeys' DB rows and
// the Tramokyo pack data, after checking every list against the standard.
//
// Per phase it sets start/end (analysis sections), intensityMultiplier
// (measured curve), gradeAs (role), aiPrompt + aiPromptSequence (the three
// POV shots + the house tail), sparse (the authored valley) and
// shaderOwned: true (phase-owned shader choreography). Everything else on
// the phase (palette, post, voice…) is kept. theme.mvStandard records the
// world + set. Old phases are backed up first.
//
// Optional per phase (2026-10-09, Expansion sample): `shaders` (the
// phase-owned cast → shaderModes; Expansion journeys also get their record
// in scripts/expansion-recast.json updated) and `shaderOpacity` (the
// per-phase imagery arc). Phase bounds may be the journey's current ones.
//
// Usage: node --env-file=.env.local scripts/mv-rollout/apply-shotlists.mjs <set> [--check] [--only=id,..] [--stage=<dir>] [--pack-only]
// --check: validate + print the S/L lens per journey, write nothing.
// --stage=<dir>: build the new rows from the PACK snapshot (no DB access)
//   and write them to <dir>/staged-journeys.json ({id: {phases, theme}},
//   the audit's --stage overlay format) — nothing in the repo/pack/DB is
//   touched except scripts/expansion-recast.json (repo-only, not read at
//   runtime). Use while Karel reviews samples.
// --pack-only: write the pack snapshot but not the DB (DB step pending).
// Without either flag: DB + pack (the idempotent install of the phases).
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { auditShots, STD } from "../lib/snowflake-standard.mjs";
import { readPackJson } from "../lib/pack-json.mjs";

const setKey = process.argv[2];
const CHECK = process.argv.includes("--check");
const STAGE = process.argv.find((a) => a.startsWith("--stage="))?.slice(8) ?? null;
const PACK_ONLY = process.argv.includes("--pack-only");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const { JOURNEYS, SET } = await import(`./shotlists/${setKey}.mjs`);
import { TAIL } from "./tail.mjs";
// summoning / law words that must never appear in a shot (FLUX reads
// negations as the noun; stone clichés; drug words (ice family allowed since 2026-10-09); figures)
const BANNED = /\b(silhouettes?|figures?|person|people|human|man|woman|face|sun|suns|sunrise|sunset|moon|moons|planet|psychedelic|dmt|trip|stone|stones|cathedral|nave|cloister|arch(es)?|temple|statue|window|door|streets?|station|text|letters?)\b/i;

const problems = [];
const built = [];
for (const j of JOURNEYS) {
  if (ONLY && !ONLY.includes(j.id)) continue;
  if (j.phases.length !== 6) problems.push(`${j.name}: ${j.phases.length} phases`);
  if (j.morphs.length !== j.phases.length - 1) problems.push(`${j.name}: ${j.morphs.length} morphs`);
  if (j.phases.filter((p) => p.sparse).length !== 1) problems.push(`${j.name}: needs exactly one sparse phase`);
  j.phases.forEach((p, i) => {
    if (i === 0 && p.start !== 0) problems.push(`${j.name}: starts at ${p.start}`);
    if (i > 0 && p.start !== j.phases[i - 1].end) problems.push(`${j.name}: gap before ${p.id}`);
    if (i === j.phases.length - 1 && p.end !== 1) problems.push(`${j.name}: ends at ${p.end}`);
    if (p.shots.length !== 3) problems.push(`${j.name}/${p.id}: ${p.shots.length} shots`);
    if (p.shaders && (p.shaders.length < 1 || new Set(p.shaders).size !== p.shaders.length)) problems.push(`${j.name}/${p.id}: bad shader cast`);
    if (p.shaderOpacity != null && !(p.shaderOpacity >= 0.45 && p.shaderOpacity <= 0.85)) problems.push(`${j.name}/${p.id}: shaderOpacity ${p.shaderOpacity} outside the kiosk-proven 0.45-0.85`);
    for (const s of p.shots) {
      const head = s.text.replace(/^DARK BACKGROUND —\s*/, "");
      const m = head.match(BANNED);
      if (m) problems.push(`${j.name}/${p.id}: banned word "${m[0]}" in "${head.slice(0, 60)}…"`);
    }
  });
  const phases = j.phases.map((p) => ({ id: p.id, aiPrompt: p.shots[0].text, aiPromptSequence: p.shots.map((s) => `${s.text}, ${TAIL}`) }));
  const S = auditShots(phases);
  const fails = [
    S.literal > STD.L1_literal && `L1 literal ${Math.round(S.literal * 100)}% (${S.literalShots.join(" | ")})`,
    S.distinct < STD.S1_distinctShots && `S1 distinct ${S.distinct}`,
    S.registers.length < STD.S2_registers && `S2 registers ${S.registers.length}`,
    S.alternation < STD.S3_alternation && `S3 alternation ${S.alternation.toFixed(2)}`,
    S.placeLock.phases > STD.S4_placeLock && `S4 ${S.placeLock.noun}×${S.placeLock.phases}`,
    S.cosmic < STD.S5_cosmic && "S5 no cosmic",
    S.camera < STD.S6_camera && `S6 camera ${S.camera.toFixed(2)}`,
    !S.sparseOpen && "S7 opening not sparse",
  ].filter(Boolean);
  console.log(`${j.name.padEnd(14)} literal ${Math.round(S.literal * 100)}% · distinct ${S.distinct}/${S.shots} · registers ${S.registers.length} · alt ${Math.round(S.alternation * 100)}% · place ${S.placeLock.noun}×${S.placeLock.phases} · cosmic ${S.cosmic} · camera ${Math.round(S.camera * 100)}% ${fails.length ? "✗ " + fails.join("; ") : "✓"}`);
  if (fails.length) problems.push(...fails.map((f) => `${j.name}: ${f}`));
  built.push(j);
}
if (problems.length) { console.error("\nPROBLEMS:\n  " + problems.join("\n  ")); process.exit(1); }
if (CHECK) { console.log("\ncheck passed — nothing written"); process.exit(0); }

const sb = STAGE || PACK_ONLY ? null : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const BACKUP = `${os.homedir()}/resonance-pack-backups/mv-rollout-${setKey}-${stamp}`;
mkdirSync(BACKUP, { recursive: true });
const pack = readPackJson("public/tramokyo-pack/data/journeys.json");
const backup = {};
const staged = {};
const recastPath = "scripts/expansion-recast.json";
// expansion-recast.json is written 1-space-indented by recast-expansion.mjs — keep that layout
const recast = (() => { const data = JSON.parse(readFileSync(recastPath, "utf8")); return { data, write: () => writeFileSync(recastPath, JSON.stringify(data, null, 1)) }; })();
for (const j of built) {
  let row;
  if (sb) { const { data, error } = await sb.from("journeys").select("id,name,phases,theme").eq("id", j.id).single(); if (error) throw error; row = data; } // fresh read right before writing
  else row = pack.data.find((x) => x.id === j.id);
  if (!row) throw new Error(`${j.name}: no row`);
  backup[j.id] = { name: row.name, phases: row.phases, theme: row.theme };
  const byId = new Map(row.phases.map((p) => [p.id, p]));
  const phases = j.phases.map((p) => {
    const old = byId.get(p.id) ?? {};
    const out = { ...old, id: p.id, start: p.start, end: p.end, intensityMultiplier: p.intensity, gradeAs: p.gradeAs,
      aiPrompt: `${p.shots[0].text}, ${TAIL}`, aiPromptSequence: p.shots.map((s) => `${s.text}, ${TAIL}`), shaderOwned: true };
    if (p.sparse) out.sparse = true; else delete out.sparse;
    if (p.shaders) out.shaderModes = [...p.shaders];
    if (p.shaderOpacity != null) out.shaderOpacity = p.shaderOpacity;
    return out;
  });
  const theme = { ...row.theme, strictCamera: true, mvStandard: { set: SET.presenting, version: 1, applied: stamp, world: j.world, shotRegisters: j.phases.map((p) => p.shots.map((s) => s.reg)), morphs: j.morphs } };
  // Expansion casts are recorded (and test-guarded) in expansion-recast.json.
  const rc = recast.data.journeys.find((x) => x.id === j.id);
  if (rc && j.phases.every((p) => p.shaders)) {
    rc.cast = Object.fromEntries(j.phases.map((p) => [p.id, [...p.shaders]]));
    rc.supports = [...new Set(j.phases.flatMap((p) => p.shaders))].filter((m) => m !== rc.lead);
    rc.leadCoverage = +j.phases.filter((p) => p.shaders.includes(rc.lead)).reduce((a, p) => a + p.end - p.start, 0).toFixed(2);
    rc.mvStandard = stamp;
  }
  if (STAGE) { staged[j.id] = { name: row.name, phases, theme }; console.log(`  ✓ staged ${j.name}`); continue; }
  if (sb) { const { error: e2 } = await sb.from("journeys").update({ phases, theme }).eq("id", j.id); if (e2) throw e2; }
  const pr = pack.data.find((x) => x.id === j.id);
  if (pr) { pr.phases = phases; pr.theme = theme; } else console.warn(`  (not in pack data: ${j.name})`);
  console.log(`  ✓ ${j.name}${sb ? "" : " (pack only — DB pending)"}`);
}
if (recast.data.journeys.some((x) => x.mvStandard === stamp)) {
  // supportUses is a report field — recount it from the casts
  const uses = {};
  for (const x of recast.data.journeys) for (const m of new Set(Object.values(x.cast).flat().filter((m) => m && m !== x.lead))) uses[m] = (uses[m] ?? 0) + 1;
  recast.data.supportUses = Object.fromEntries(Object.entries(uses).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  recast.write();
  console.log(`expansion-recast.json updated`);
}
writeFileSync(`${BACKUP}/phases-before.json`, JSON.stringify(backup, null, 1));
if (STAGE) {
  mkdirSync(STAGE, { recursive: true });
  writeFileSync(`${STAGE}/staged-journeys.json`, JSON.stringify(staged, null, 1));
  console.log(`staged ${built.length} journeys → ${STAGE}/staged-journeys.json · pack + DB untouched · backup ${BACKUP}/phases-before.json`);
  process.exit(0);
}
pack.write();
console.log(`applied ${built.length} journeys${sb ? "" : " to the pack only (DB pending)"} · backup ${BACKUP}/phases-before.json`);
