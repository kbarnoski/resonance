#!/usr/bin/env node
// flicker-gate.mjs — run the photosensitive flicker meter over every video in
// a directory (film-rig outputs) and exit non-zero on any FAIL.
//
// Usage: node scripts/flicker-gate.mjs <dir> [--strict] [--json=report.json]
//   FAIL  = > 3 general or red flashes in any 1 s (WCAG 2.3.1 / BT.1702) -> exit 1
//   WARN  = local flicker (>= 3 Hz shimmer below the area threshold) -> printed;
//           exit 1 only with --strict
// See docs/flicker-safety.md.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { measureFile } from "./flicker-meter.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const strict = args.includes("--strict");
const jsonOut = args.find((a) => a.startsWith("--json="))?.split("=")[1];
if (!dir) { console.error("usage: node scripts/flicker-gate.mjs <dir> [--strict] [--json=out.json]"); process.exit(2); }

const files = readdirSync(dir)
  .filter((f) => /\.(mp4|webm|mov|m4v)$/i.test(f))
  .map((f) => path.join(dir, f))
  .filter((f) => statSync(f).isFile())
  .sort();
if (!files.length) { console.error(`flicker-gate: no videos in ${dir}`); process.exit(2); }

const rows = [];
const results = [];
for (const f of files) {
  try {
    const r = await measureFile(f);
    results.push(r);
    rows.push({
      file: path.basename(f), verdict: r.verdict,
      gen: r.general.maxFlashesPerSec, red: r.red.maxFlashesPerSec, ofcom: r.ofcomWholeScreen.maxFlashesPerSec,
      lfField: r.local.peakFieldPct, lfScreen: r.local.peakScreenPct, lfMean: r.local.meanScreenPct,
      lfSecs: r.local.secondsOverWarn, worst: r.local.peakFieldPct > 0 ? `${r.local.worstTimeSec}s ${r.local.worstRegion.label}` : "-",
    });
  } catch (e) {
    rows.push({ file: path.basename(f), verdict: "ERROR", err: e.message });
  }
}

const W = Math.max(4, ...rows.map((r) => r.file.length));
console.log(`${"file".padEnd(W)}  verdict  gen/s  red/s  ofcom/s  LF-field%  LF-screen%  LF-mean%  LF-secs  worst`);
for (const r of rows) {
  if (r.verdict === "ERROR") { console.log(`${r.file.padEnd(W)}  ERROR    ${r.err}`); continue; }
  console.log(`${r.file.padEnd(W)}  ${r.verdict.padEnd(7)}  ${String(r.gen).padStart(5)}  ${String(r.red).padStart(5)}  ${String(r.ofcom).padStart(7)}  ${String(r.lfField).padStart(9)}  ${String(r.lfScreen).padStart(10)}  ${String(r.lfMean).padStart(8)}  ${String(r.lfSecs).padStart(7)}  ${r.worst}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));

const fails = rows.filter((r) => r.verdict === "FAIL" || r.verdict === "ERROR");
const warns = rows.filter((r) => r.verdict === "WARN");
console.log(`\nflicker-gate: ${rows.length} films — ${fails.length} FAIL/ERROR, ${warns.length} WARN${strict ? " (strict: WARN blocks)" : ""}`);
process.exit(fails.length || (strict && warns.length) ? 1 : 0);
