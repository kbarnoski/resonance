#!/usr/bin/env node
/**
 * FORM FLOW REPORT (Karel 2026-10-08: "a form transitions to a new shape only
 * to then immediately change to yet another form" / "it never takes form and
 * then yet again transitions into yet another thing" / "it takes a tad bit too
 * long for the forms to take shape").
 *
 * From a record.mjs --motion run, per journey:
 *   doubles      re-aims (particle-retarget) < 8 s after the previous one
 *   unformed     re-aims that began while the field had NOT yet arrived
 *                (settledFor = 0 in the motion sample just before; needs the
 *                settled column — builds from 2026-10-08 evening)
 *   form s       median time from a re-aim to the field arriving (settled > 0)
 *
 *   node scripts/journey-review/form-flow-report.mjs <runId> [<runId> …]
 */
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const run of process.argv.slice(2)) {
  const root = path.join(HERE, "runs", run);
  let D = 0, U = 0, R = 0;
  const forms = [];
  console.log(`== ${run}`);
  for (const d of fs.readdirSync(root)) {
    if (d.includes("~") || d.startsWith("_")) continue;
    const evf = path.join(root, d, "events.jsonl"), mf = path.join(root, d, "motion.jsonl");
    if (!fs.existsSync(evf) || !fs.existsSync(mf)) continue;
    const ev = fs.readFileSync(evf, "utf8").trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const rt = ev.filter((e) => e.type === "particle-retarget" && !/shown=0\.[0-2]/.test(e.detail ?? ""));
    const mo = fs.readFileSync(mf, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const hasSettled = mo.some((r) => r.length > 13 && r[13] != null);
    let doubles = 0, unformed = 0;
    const ft = [];
    rt.forEach((e, i) => {
      if (i > 0 && e.t - rt[i - 1].t < 8000) doubles++;
      if (hasSettled) {
        const before = mo.filter((r) => r[0] < e.t - 150).pop();
        const vis = Number(/shown=([0-9.]+)/.exec(e.detail ?? "")?.[1] ?? 1);
        if (before && i > 0 && before[13] === 0 && vis >= 0.5) { unformed++; if (process.env.WHY) console.log(`     unformed: ${d.slice(0, 8)} ${(e.t / 1000).toFixed(1)}s ${e.detail}  (prev ${rt[i - 1].detail} @${(rt[i - 1].t / 1000).toFixed(1)}s, last event ${before[5]})`); }
        // the first sample whose settled-since moment lies AFTER this re-aim
        const after = mo.find((r) => r[0] > e.t + 300 && r[13] > 0 && (r[0] - e.t) / 1000 - r[13] > 0.1);
        if (after) ft.push((after[0] - e.t) / 1000 - after[13]);
      }
    });
    D += doubles; U += unformed; R += rt.length; forms.push(...ft);
    console.log(`  ${d.slice(0, 12).padEnd(13)} re-aims ${String(rt.length).padStart(3)}  doubles<8s ${String(doubles).padStart(2)}  ${hasSettled ? `unformed ${String(unformed).padStart(2)}  form med ${med(ft)?.toFixed(1) ?? "-"} s` : "(no settled column)"}`);
  }
  console.log(`  TOTAL re-aims ${R}  doubles ${D}  unformed ${U}  form med ${med(forms)?.toFixed(1) ?? "-"} s`);
}
