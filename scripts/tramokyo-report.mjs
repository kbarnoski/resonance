#!/usr/bin/env node
// Tramokyo night report — turns /tmp/tramokyo-events.log into a story:
//   node scripts/tramokyo-report.mjs
// Counts full loops, journeys played, and every issue with timestamps.
import { readFileSync } from "fs";

let raw;
try {
  raw = readFileSync("/tmp/tramokyo-events.log", "utf-8");
} catch {
  console.log("No events log at /tmp/tramokyo-events.log — has the kiosk run?");
  process.exit(0);
}
const lines = raw.trim().split("\n").filter(Boolean);
if (lines.length === 0) { console.log("Log is empty."); process.exit(0); }

const parse = (l) => {
  const sp = l.indexOf(" ");
  return { t: new Date(l.slice(0, sp)), msg: l.slice(sp + 1) };
};
const events = lines.map(parse);
const first = events[0].t, last = events[events.length - 1].t;
const span = ((last - first) / 3_600_000).toFixed(1);

const count = (p) => events.filter((e) => e.msg.startsWith(p)).length;
const boots = count("BOOT");
const cycles = count("cycle-start");
const completes = count("cycle-complete");
const journeys = count("journey ");
const wedges = events.filter((e) => e.msg.startsWith("WEDGE-RELOAD"));
const autoskips = events.filter((e) => e.msg.startsWith("skip-auto"));
const stalls = events.filter((e) => e.msg.startsWith("stall-reload"));
const statements = count("statement");

// Silent gaps: >12 min between consecutive events with no wedge marker
// usually means the page died/hung without logging.
const gaps = [];
for (let i = 1; i < events.length; i++) {
  const dt = (events[i].t - events[i - 1].t) / 60_000;
  if (dt > 12) gaps.push({ from: events[i - 1], to: events[i], min: dt.toFixed(0) });
}

const hm = (d) => d.toTimeString().slice(0, 8);
console.log(`━━ Tramokyo night report ━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`window     ${first.toLocaleString()} → ${hm(last)}  (${span}h)`);
console.log(`boots      ${boots}  (page loads incl. wedge recoveries)`);
console.log(`loops      ${cycles} started · ${completes} completed`);
console.log(`journeys   ${journeys} played · ${statements} statement cards`);
console.log(`issues     ${wedges.length} wedge-reloads · ${autoskips.length} auto-skips · ${stalls.length} stall-reloads · ${gaps.length} silent gaps`);
if (wedges.length + autoskips.length + stalls.length + gaps.length === 0) {
  console.log(`\n✓ Clean night — no issues recorded.`);
} else {
  console.log(`\n━━ issue timeline ━━`);
  for (const e of [...wedges, ...autoskips, ...stalls].sort((a, b) => a.t - b.t))
    console.log(`  ${hm(e.t)}  ${e.msg}`);
  for (const g of gaps)
    console.log(`  ${hm(g.from.t)}→${hm(g.to.t)}  SILENT GAP ${g.min}min (last: ${g.from.msg.slice(0, 60)})`);
}
