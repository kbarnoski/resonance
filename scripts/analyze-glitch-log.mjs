#!/usr/bin/env node
/**
 * analyze-glitch-log.mjs — automatic post-review verdict (Karel
 * 2026-09-28: "you should be detecting all issues through your flight
 * recorder each time I review. why is it on me?").
 *
 * Reads docs/glitch-events.jsonl and, per session:
 *  - lists every FRAME-GAP (real dropped frames) with the events that
 *    fired in the preceding 1.5s — the correlated cause
 *  - flags births inside the boundary quiet zone (progress > 0.96)
 *  - flags compile storms (2+ shader switches within 4s)
 *  - summarizes journey boundaries and their surrounding events
 *
 * Run after every kiosk review:  node scripts/analyze-glitch-log.mjs
 */
import { readFileSync } from "node:fs";

const events = readFileSync("docs/glitch-events.jsonl", "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const sessions = new Map();
for (const e of events) {
  if (!sessions.has(e.session)) sessions.set(e.session, []);
  sessions.get(e.session).push(e);
}

for (const [sid, es] of sessions) {
  es.sort((a, b) => a.t - b.t);
  const t0 = es[0].t;
  const sec = (e) => ((e.t - t0) / 1000).toFixed(1);
  console.log(`\n════ session ${sid} — ${es.length} events, ${es[0].wall} → ${es[es.length - 1].wall} ════`);

  const gaps = es.filter((e) => e.type === "FRAME-GAP");
  console.log(`dropped-frame events: ${gaps.length}`);
  for (const g of gaps) {
    const causes = es.filter((e) => e !== g && g.t - e.t >= 0 && g.t - e.t <= 1500 && e.type !== "FRAME-GAP");
    const cs = causes.map((c) => `${c.type}${c.detail ? `(${c.detail})` : ""} -${g.t - c.t}ms`).join(", ") || "no event in prior 1.5s (external stall?)";
    console.log(`  ${sec(g)}s  GAP ${g.detail}  ← ${cs}`);
  }

  // Compile storms: shader switches < 4s apart
  const switches = es.filter((e) => e.type.startsWith("shader-"));
  for (let i = 1; i < switches.length; i++) {
    const dt = switches[i].t - switches[i - 1].t;
    if (dt < 4000) {
      console.log(`  STORM: ${switches[i - 1].type}(${switches[i - 1].detail}) + ${switches[i].type}(${switches[i].detail}) only ${(dt / 1000).toFixed(1)}s apart @${sec(switches[i])}s`);
    }
  }

  // Quiet-zone violations: any birth event with progress > 0.96 in detail
  for (const e of es) {
    const m = /@p(0\.9[7-9]\d*|1\.0)/.exec(e.detail ?? "");
    if (m && /push|shader|tertiary-on|clone/.test(e.type)) {
      console.log(`  QUIET-ZONE BIRTH: ${sec(e)}s ${e.type} ${e.detail}`);
    }
  }

  for (const e of es) {
    if (e.type === "journey-change") console.log(`  boundary @${sec(e)}s: ${e.detail}`);
  }
}
console.log("\nverdict rule: a GAP with a shader-* cause = compile stall; with layer/parallax cause = imagery churn; with no cause = external (GC/decoder).");
