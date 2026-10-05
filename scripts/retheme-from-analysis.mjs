#!/usr/bin/env node
// Apply scripts/retheme-worlds.mjs: re-theme / re-order / re-arc journeys
// from their v2 deep analysis (Karel 2026-10-05).
//
// For every entry:
//  - phase bounds + intensityMultiplier come from the measured sections
//    (scripts/lib/phase-grouping.mjs on analyses.summary v2);
//  - beats: new world lines (3-shot sequences lit by the phase's measured
//    role) or re-ordered old beats so peak imagery lands on the real peak;
//  - shaderModes, palettes, post FX and everything else on each phase are
//    left exactly as they are (shader casts belong to recast-expansion /
//    recast-featured);
//  - DB rows + the Tramokyo pack data mirror are updated; built-ins get
//    src/lib/journeys/analysis-retheme.generated.ts (+ bounds in
//    analysis-phase-bounds.ts), applied at module load.
// HARD EXCLUSIONS: Ghost / Snowflake / Realized (mastered-lock) and the five
// Kinetic Lab journeys — the script refuses them.
// Usage: node --env-file=.env.local scripts/retheme-from-analysis.mjs [--dry-run] [--only=<id,...>]
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RETHEME } from "./retheme-worlds.mjs";
import { groupPhases } from "./lib/phase-grouping.mjs";

const DRY = process.argv.includes("--dry-run");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? null;
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const J = await jiti.import("../src/lib/journeys/journeys.ts");
const PT = await jiti.import("../src/lib/journeys/paired-tracks.ts");
const { MASTERED_JOURNEYS } = await jiti.import("../src/lib/journeys/mastered.ts");
const KIN = await jiti.import("../src/lib/journeys/kinetic.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const KINETIC_LAB = new Set(["9f7d1b51-aeac-4dfc-a39f-b00101a403f9", "061528d4-e9a3-49c3-ad3c-f23cf9cf2251", "84a82478-f0f2-4c49-b800-b4fe722f1df5", "3ee9acf2-c89d-42b2-b9a3-d5fce97da2ac", "b5247327-b1fd-45ce-a249-0a58a8a3c57e"]);
const r2 = (x) => Math.round(x * 100) / 100;
const TAIL = ", asymmetric off-center composition with strong diagonal weight, completely uninhabited, no text no signatures no watermarks no letters no writing";
const SHOT_LIGHT = {
  dark: ["DARK BACKGROUND — extreme close detail: %M, barely lit, deep darkness all around it", "DARK BACKGROUND — abstract: %A, only the faintest light, wide negative space"],
  gathering: ["close study: %M, the light gathering, more of the world glimpsed beyond", "%A, the light gathering and spreading outward"],
  peak: ["macro at the height of the light: %M, glowing at full strength, the vast world beyond it", "abstract at the largest scale: %A, at full radiance, filling the frame with asymmetric weight"],
  calm: ["close: %M, in broad steady calm light", "%A, the light broad, steady and calm"],
  lowering: ["close: %M, the light lowering and thinning", "%A, dimming, darkness returning between the forms"],
  last: ["DARK BACKGROUND — close: %M, the last glow in near darkness", "DARK BACKGROUND — %A, almost entirely dark, one last trace of light"],
};
const ROLE_GRADE = { dark: "threshold", gathering: "expansion", peak: "transcendence", calm: "illumination", lowering: "return", last: "integration" };
function roleOf(ph, i, phases) {
  const peak = phases.reduce((b, p, k) => (p.intensity > phases[b].intensity ? k : b), 0);
  if (i === peak) return "peak";
  if (i === 0) return ph.intensity >= 0.6 ? "gathering" : "dark";
  if (i === 5) return ph.intensity >= 0.6 ? "calm" : "last";
  if (i < peak) return "gathering";
  return ph.intensity >= 0.55 ? "calm" : "lowering";
}
const withTail = (s) => (/completely uninhabited/.test(s) ? s : s + TAIL);
function sequenceFor(entry, line, i, role) {
  const [m, a] = SHOT_LIGHT[role];
  const micro = m.replace("%M", entry.micro), abs = a.replace("%A", entry.abstract);
  const shots = i === 0 ? [micro, line, abs] : role === "peak" ? [line, abs, micro] : [line, micro, abs];
  return shots.map(withTail);
}

const { data: recs } = await sb.from("recordings").select("id,title");
// Idempotency: beats are always re-ordered from the PRE-retheme originals
// (DB rows keep them in theme.preRetheme; built-ins in a pristine snapshot).
const PRISTINE = "scripts/retheme-builtin-pristine.json";
const pristine = existsSync(PRISTINE) ? JSON.parse(readFileSync(PRISTINE, "utf8")) : {};
const beatsOf = (p) => ({ aiPrompt: p.aiPrompt, aiPromptSequence: p.aiPromptSequence, guidancePhrases: p.guidancePhrases, aiPromptModifiers: p.aiPromptModifiers, start: p.start, end: p.end, intensityMultiplier: p.intensityMultiplier });
const builtinOverrides = {};
const builtinBounds = {};
let pack = null;
const PACK = "public/tramokyo-pack/data/journeys.json";
if (existsSync(PACK)) pack = JSON.parse(readFileSync(PACK, "utf8"));
const packRows = pack ? (Array.isArray(pack) ? pack : pack.journeys) : [];
const report = [];

for (const [id, entry] of Object.entries(RETHEME)) {
  if (ONLY && !ONLY.includes(id)) continue;
  if (MASTERED_JOURNEYS.has(id) || KINETIC_LAB.has(id) || ["ghost", "first-snow", "inferno"].includes(id)) throw new Error(`refusing protected journey ${id}`);
  const builtin = J.JOURNEYS.find((b) => b.id === id);
  let row = null, oldPhases, recId;
  if (builtin) {
    if (!pristine[id]) pristine[id] = builtin.phases.map(beatsOf);
    oldPhases = builtin.phases.map((p, i) => ({ ...p, ...pristine[id][i] }));
    const spec = PT.PAIRED_TRACKS[id];
    recId = (spec.startsWith("=") ? recs.find((r) => r.title === spec.slice(1)) : recs.find((r) => r.title.toLowerCase().includes(spec.replaceAll("%", "").toLowerCase())))?.id;
  } else {
    const { data, error } = await sb.from("journeys").select("id,name,recording_id,phases,theme").eq("id", id).single();
    if (error) throw new Error(`${entry.name}: ${error.message}`);
    row = data;
    if (KIN.isKineticJourneyName?.(row.name) && !KIN.isExpansionKineticName(row.name)) throw new Error(`refusing Kinetic Lab ${row.name}`);
    const orig = row.theme?.preRetheme?.phases;
    oldPhases = orig ? row.phases.map((p, i) => ({ ...p, ...orig[i] })) : row.phases;
    recId = row.recording_id;
  }
  const { data: an } = await sb.from("analyses").select("summary").eq("recording_id", recId).single();
  const S = an?.summary;
  if (S?.version !== 2) throw new Error(`${entry.name}: no v2 analysis`);
  const groups = groupPhases(S.sections, S.profile.duration);
  const perm = entry.phases ?? [0, 1, 2, 3, 4, 5];
  const newPhases = oldPhases.map((old, i) => {
    const g = groups[i];
    const role = roleOf(g, i, groups);
    const src = perm[i];
    let content;
    if (typeof src === "number") {
      const o = oldPhases[src];
      content = { aiPrompt: o.aiPrompt, aiPromptSequence: o.aiPromptSequence, guidancePhrases: o.guidancePhrases, aiPromptModifiers: o.aiPromptModifiers };
    } else {
      const seq = sequenceFor(entry, src, i, role);
      content = { aiPrompt: seq[0], aiPromptSequence: seq, guidancePhrases: [] };
    }
    return {
      ...old,
      ...content,
      start: g.start, end: g.end,
      intensityMultiplier: r2(0.3 + 0.7 * g.intensity),
      analysisRole: role, gradeAs: ROLE_GRADE[role], analysisSections: g.sections,
    };
  });
  const changed = perm.some((p, i) => p !== i);
  report.push({
    id, name: entry.name, kind: perm.some((p) => typeof p === "string") ? "re-theme" : perm.some((p, i) => p !== i) ? "re-order" : "arc",
    measured: entry.measured ?? `${S.tempo.bpm} BPM ${S.tempo.feel}/${S.tempo.pulse}, ${S.mode_balance.verdict} (minor-weight ${S.mode_balance.minorWeight}), [${S.mood.words.slice(0, 4).join(", ")}], ${S.dynamics_arc.shape}`,
    old: entry.old ?? "", world: entry.world ?? "", why: entry.why ?? "",
    oldArc: oldPhases.map((p) => `${r2(p.start)}-${r2(p.end)}:${p.intensityMultiplier}`).join(" "),
    newArc: newPhases.map((p) => `${r2(p.start)}-${r2(p.end)}:${p.intensityMultiplier}${p.analysisRole === "peak" ? "*" : ""}`).join(" "),
    beatsChanged: changed, newLines: perm.map((p, i) => (typeof p === "string" ? i : null)).filter((x) => x !== null),
  });
  console.log(`${DRY ? "·" : "✓"} ${entry.name.padEnd(28)} ${report.at(-1).kind.padEnd(9)} ${report.at(-1).newArc}`);
  if (DRY) continue;

  const themePatch = { analysisRetheme: { at: "2026-10-05", kind: report.at(-1).kind, world: entry.world, why: entry.why }, analysisVersion: 2 };
  if (builtin) {
    builtinBounds[id] = [0, ...newPhases.map((p) => p.end)];
    builtinOverrides[id] = newPhases.map((p) => ({ intensityMultiplier: p.intensityMultiplier, aiPrompt: p.aiPrompt, aiPromptSequence: p.aiPromptSequence, guidancePhrases: p.guidancePhrases, analysisRole: p.analysisRole, gradeAs: p.gradeAs }));
  } else {
    const theme = { ...row.theme, ...themePatch, preRetheme: row.theme?.preRetheme ?? { phases: row.phases.map(beatsOf) } };
    if (report.at(-1).kind === "re-theme") {
      const peak = newPhases.find((p) => p.analysisRole === "peak");
      theme.poetryImagery = peak.aiPrompt.replace(/, asymmetric off-center.*$/, "").slice(0, 160);
      theme.worldRationale = entry.why;
    }
    const { error } = await sb.from("journeys").update({ phases: newPhases, theme }).eq("id", id);
    if (error) throw error;
    const pr = packRows.find((r) => r.id === id);
    if (pr) { pr.phases = newPhases; pr.theme = theme; }
  }
}

writeFileSync("scripts/retheme-report.json", JSON.stringify(report, null, 1));
if (DRY) process.exit(0);
if (pack) writeFileSync(PACK, JSON.stringify(pack, null, 2) + "\n");
writeFileSync(PRISTINE, JSON.stringify(pristine, null, 1));

// Built-ins: bounds into analysis-phase-bounds.ts, beats/intensity into the generated overlay.
if (Object.keys(builtinBounds).length) {
  const bf = "src/lib/journeys/analysis-phase-bounds.ts";
  let src = readFileSync(bf, "utf8");
  for (const [id, b] of Object.entries(builtinBounds)) {
    const re = new RegExp(`(  "${id}": )\\[[^\\]]*\\]`);
    if (!re.test(src)) throw new Error(`no bounds line for ${id}`);
    src = src.replace(re, `$1[${b.map((x) => Number(x.toFixed(3))).join(", ")}]`);
  }
  writeFileSync(bf, src);
  writeFileSync("src/lib/journeys/analysis-retheme.generated.ts",
    `// GENERATED by scripts/retheme-from-analysis.mjs — do not edit by hand.\n` +
    `// Per-phase beats + measured intensity for built-in journeys re-themed or\n` +
    `// re-arced from their v2 deep analysis (2026-10-05). Applied at module load\n` +
    `// in analysis-phase-bounds.ts. Mastered journeys are never listed here.\n` +
    `import type { JourneyPhase } from "./types";\n\n` +
    `export const BUILTIN_ANALYSIS_RETHEME: Record<string, Array<Partial<JourneyPhase> & { analysisRole?: string; gradeAs?: string }>> = ${JSON.stringify(builtinOverrides, null, 2)};\n`);
}
console.log(`\n${report.length} journeys → scripts/retheme-report.json`);
