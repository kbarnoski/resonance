#!/usr/bin/env node
// shader-diversity-report.mjs — audit REAL playback of the Expansion
// shader casts (Karel 2026-10-05: "i swear that the pool of shaders used
// in expansion journeys seems super limited ... ensure there is true
// diversity"). Reads the flight recorder (docs/glitch-events.jsonl),
// attributes every shader event (shader-initial / -primary / -dual /
// -tertiary-on) to the journey run it happened in, keeps only Expansion
// journeys, and prints: distinct shaders seen, top frequencies, per-run
// distinct counts, and the average overlap between consecutive
// Expansion runs within a session (shaders shared by run i and i+1).
//
// The recorder logs no build id, so scope to runs after a deploy with
//   --since-line=N   (skip the first N-1 lines; `wc -l` before deploying)
//   --since-wall=HH:MM:SS  wall-clock floor (the log has no date — same-day runs only)
//
// Since the featured/album recast (2026-10-05, scripts/recast-featured.mjs)
// it covers EVERY cast journey: --set=expansion | featured | all (default
// all). "featured" = the featured built-ins + Welcome Home / Surrounded by
// Light / March Light albums + Cosmic Homecoming + off-loop built-ins.
// Usage: node scripts/shader-diversity-report.mjs [--set=all] [--since-line=N] [--since-wall=HH:MM:SS] [--top=20] [--log=path]
import { readFileSync } from "node:fs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const SINCE_LINE = Number(arg("since-line") ?? 1);
const SINCE_WALL = arg("since-wall") ?? null;
const TOP = Number(arg("top") ?? 20);
const LOG = arg("log") ?? "docs/glitch-events.jsonl";

const SET = arg("set") ?? "all";
const recast = JSON.parse(readFileSync("scripts/expansion-recast.json", "utf8"));
const featured = JSON.parse(readFileSync("scripts/featured-recast.json", "utf8"));
const castJourneys = [
  ...(SET === "featured" ? [] : recast.journeys.map((j) => ({ id: j.id, title: j.title, cast: j.cast }))),
  ...(SET === "expansion" ? [] : featured.journeys.map((j) => ({ id: j.id, title: j.name, cast: j.cast }))),
];
const LABEL = { expansion: "Expansion", featured: "Featured + album", all: "Cast-journey" }[SET] ?? SET;
const TITLE = new Map(castJourneys.map((j) => [j.id, j.title]));
const CAST = new Map(castJourneys.map((j) => [j.id, new Set(Object.values(j.cast).flat().filter(Boolean))]));

const lines = readFileSync(LOG, "utf8").split("\n");
const SHADER_EVENTS = new Set(["shader-initial", "shader-primary", "shader-dual", "shader-tertiary-on"]);
// session -> { current run, pending journey (take-seed precedes the
// journey-change, and shader-initial lands between them) }
const sessions = new Map();
const runs = [];
let parsed = 0;
for (let i = Math.max(0, SINCE_LINE - 1); i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  let e; try { e = JSON.parse(lines[i]); } catch { continue; }
  if (SINCE_WALL && (e.wall ?? "") < SINCE_WALL) continue;
  parsed++;
  let s = sessions.get(e.session);
  if (!s) { s = { run: null, pending: null, seq: [] }; sessions.set(e.session, s); }
  const startRun = (id) => { s.run = { session: e.session, journey: id, line: i + 1, shaders: [] }; runs.push(s.run); s.seq.push(s.run); };
  if (e.type === "take-seed") { s.pending = (e.detail ?? "").split(" ")[0]; startRun(s.pending); continue; }
  if (e.type === "journey-change") {
    const to = (e.detail ?? "").split("->")[1]?.trim();
    if (to && (!s.run || s.run.journey !== to)) startRun(to);
    s.pending = null;
    continue;
  }
  if (SHADER_EVENTS.has(e.type) && s.run) {
    const mode = (e.detail ?? "").split(" ")[0];
    if (mode) s.run.shaders.push({ mode, role: e.type.replace("shader-", "") });
  }
}

const exp = runs.filter((r) => TITLE.has(r.journey) && r.shaders.length > 0);
if (exp.length === 0) { console.log(`No ${LABEL} runs with shader events in ${parsed} lines (since line ${SINCE_LINE}${SINCE_WALL ? `, wall ${SINCE_WALL}` : ""}).`); process.exit(0); }

const freq = new Map(); // mode -> appearances (events)
const runCount = new Map(); // mode -> runs it appeared in
for (const r of exp) {
  for (const s of r.shaders) freq.set(s.mode, (freq.get(s.mode) ?? 0) + 1);
  for (const m of new Set(r.shaders.map((s) => s.mode))) runCount.set(m, (runCount.get(m) ?? 0) + 1);
}
const offCast = [];
for (const r of exp) for (const m of new Set(r.shaders.map((s) => s.mode))) if (!CAST.get(r.journey).has(m)) offCast.push(`${TITLE.get(r.journey)}: ${m}`);

// consecutive cast-journey runs within a session
let pairs = 0, shared = 0;
const sharedList = new Map();
for (const s of sessions.values()) {
  const seq = s.seq.filter((r) => TITLE.has(r.journey) && r.shaders.length > 0);
  for (let k = 1; k < seq.length; k++) {
    const a = new Set(seq[k - 1].shaders.map((x) => x.mode)), b = new Set(seq[k].shaders.map((x) => x.mode));
    const both = [...a].filter((m) => b.has(m));
    pairs++; shared += both.length;
    for (const m of both) sharedList.set(m, (sharedList.get(m) ?? 0) + 1);
  }
}

console.log(`${LABEL} shader diversity — ${exp.length} runs (${new Set(exp.map((r) => r.journey)).size} journeys, ${new Set(exp.map((r) => r.session)).size} sessions) from ${LOG} since line ${SINCE_LINE}${SINCE_WALL ? ` / wall ${SINCE_WALL}` : ""}`);
console.log(`distinct shaders seen: ${freq.size}`);
const per = exp.map((r) => new Set(r.shaders.map((s) => s.mode)).size);
console.log(`distinct per run: min ${Math.min(...per)} · avg ${(per.reduce((a, b) => a + b, 0) / per.length).toFixed(1)} · max ${Math.max(...per)}`);
console.log(`\ntop ${TOP} by runs appeared in (events in parentheses):`);
for (const [m, n] of [...runCount].sort((a, b) => b[1] - a[1] || freq.get(b[0]) - freq.get(a[0])).slice(0, TOP)) console.log(`  ${m.padEnd(22)} ${String(n).padStart(3)} runs (${freq.get(m)})`);
console.log(`\nconsecutive ${LABEL} runs: ${pairs} pairs · avg shared shaders ${pairs ? (shared / pairs).toFixed(2) : "n/a"}`);
if (sharedList.size) console.log(`  shared: ${[...sharedList].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m}×${n}`).join(", ")}`);
if (offCast.length) console.log(`\nWARNING ${offCast.length} shader(s) played outside the journey's recast cast (stale pack/DB?):\n  ${offCast.slice(0, 20).join("\n  ")}`);
