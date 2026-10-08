#!/usr/bin/env node
/**
 * STUTTER REPORT (Karel 2026-10-08: "studder stepping where it moves slower a
 * bit than catches up faster"). Reads runs/<runId>/<journey>/motion.jsonl
 * (record.mjs --motion: 10 Hz engine velocity readback) and, per journey:
 *
 *   pinned %   visible time the field sat AT the speed cap (held back)
 *   surges/min crawl→surge events: mean speed more than doubling within 1 s
 *              right after being pinned (the visible "catches up faster")
 *   jerk       mean |Δ² speed| / mean speed (10 Hz) — overall unsteadiness
 *   hold s     median / max time between particle form changes (events.jsonl)
 *
 *   node scripts/journey-review/motion-report.mjs <runId> [<runId2> to compare]
 */
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const runs = process.argv.slice(2);
const names = {};
for (const m of fs.readFileSync(path.join(HERE, "../../src/lib/journeys/particle-profiles.generated.ts"), "utf8").matchAll(/"([^"]+)": \{"name":"([^"]+)"/g)) names[m[1]] = m[2];
Object.assign(names, { "first-snow": "Snowflake", inferno: "Realized", ghost: "Ghost" });

function analyse(dir) {
  const f = path.join(dir, "motion.jsonl");
  if (!fs.existsSync(f)) return null;
  // row: [now, ct, meanSpeed, fastFrac, glide, lastEvent, cap, swell, bands, soul, presence, transition, scatter]
  // a run where the particle watchdog switched particles OFF measures nothing —
  // the diag freezes at its last value (2026-10-08: 4 parallel browsers)
  const tl = path.join(dir, "timeline.jsonl");
  const disabled = fs.existsSync(tl) && fs.readFileSync(tl, "utf8").split("\n").some((l) => /"disabled":"/.test(l));
  if (disabled) return { disabled: true };
  const rows = fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r[10] > 0.3 && r[1] != null);
  if (rows.length < 100) return null;
  // the readback only refreshes every ~6 frames — collapse repeats
  const sp = rows.map((r) => r[2]);
  const capOf = rows.map((r) => r[6]);
  // pinned: the cap is what limits the field; DRAGGED: pinned while the cap is
  // opening — the speed is being pulled up by the cap, i.e. the visible "catches
  // up faster" (the entry ramp of the first 8 s of a journey excluded)
  let pinned = 0, dragged = 0, t0row = rows[0][1];
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && (rows[i][1] - rows[i - 1][1] < -0.05 || rows[i][1] - rows[i - 1][1] >= 1)) t0row = rows[i][1];
    if (!(capOf[i] > 0 && sp[i] >= 0.85 * capOf[i])) continue;
    pinned++;
    if (i > 2 && rows[i][1] - t0row > 8 && capOf[i] > capOf[i - 3] * 1.02) dragged++;
  }
  // STUTTER STEPS (what Karel sees: "moves slower a bit than catches up
  // faster"): within one continuous stretch of the journey (audio clock
  // advancing 0..1 s per sample, and > 8 s past its start so the field's
  // entry ramp is not counted), the speed DIPS by ≥ 40 % from a recent high
  // and RECOVERS ≥ 1.7× from that low, all within 3 s.
  let surges = 0;
  const seg = [];
  for (let i = 0; i < rows.length; i++) {
    const cont = i > 0 && rows[i][1] - rows[i - 1][1] >= -0.05 && rows[i][1] - rows[i - 1][1] < 1;
    if (!cont) seg.push([]);
    seg[seg.length - 1].push(i);
  }
  for (const idx of seg) {
    if (idx.length < 120) continue;
    const t0 = rows[idx[0]][1];
    // smooth to 0.3 s so a single readback blip is not a "step"
    const v = idx.map((_, k) => { let a2 = 0, c = 0; for (let q = Math.max(0, k - 1); q <= Math.min(idx.length - 1, k + 1); q++) { a2 += sp[idx[q]]; c++; } return a2 / c; });
    for (let k = 0; k < idx.length; k++) {
      if (rows[idx[k]][1] - t0 < 8) continue;
      // k = a local low: was there a high ≥ low/0.6 in the 1.5 s before, and a recovery ≥ 1.7× in the 1.5 s after?
      const lo = v[k];
      if (lo < 0.02) continue;
      let hiBefore = 0, hiAfter = 0;
      for (let q = Math.max(0, k - 15); q < k; q++) hiBefore = Math.max(hiBefore, v[q]);
      for (let q = k + 1; q <= Math.min(idx.length - 1, k + 15); q++) hiAfter = Math.max(hiAfter, v[q]);
      if (hiBefore * 0.6 >= lo && hiAfter >= 1.7 * lo) { surges++; k += 15; }
    }
  }
  let j = 0, n = 0;
  for (let i = 2; i < sp.length; i++) {
    const c1 = rows[i][1] - rows[i - 1][1], c2 = rows[i - 1][1] - rows[i - 2][1];
    if (c1 < -0.05 || c1 >= 1 || c2 < -0.05 || c2 >= 1) continue; // never across a journey / clock boundary
    j += Math.abs(sp[i] - 2 * sp[i - 1] + sp[i - 2]); n++;
  }
  const mean = sp.reduce((a, b) => a + b, 0) / sp.length;
  const mins = rows.length / 600;
  // form holds
  const ev = path.join(dir, "events.jsonl");
  const forms = fs.existsSync(ev) ? fs.readFileSync(ev, "utf8").trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.type === "particle-form").map((e) => e.t / 1000) : [];
  const holds = forms.slice(1).map((t, i) => t - forms[i]).filter((h) => h > 0).sort((a, b) => a - b);
  return {
    pinnedPct: (100 * pinned) / rows.length,
    draggedPct: (100 * dragged) / rows.length,
    surgesPerMin: surges / mins,
    jerk: n ? j / n / Math.max(1e-3, mean) : 0,
    meanSpeed: mean,
    holdMed: holds.length ? holds[Math.floor(holds.length / 2)] : null,
    holdMax: holds.length ? holds[holds.length - 1] : null,
    mins,
  };
}

const tables = runs.map((r) => {
  const root = path.join(HERE, "runs", r);
  const out = {};
  for (const d of fs.readdirSync(root)) {
    if (d.includes("~") || d.startsWith("_")) continue;
    const a = analyse(path.join(root, d));
    if (a) out[d] = a;
  }
  return out;
});
const ids = [...new Set(tables.flatMap((t) => Object.keys(t)))];
const fmt = (a) => a?.disabled ? "  PARTICLES DISABLED — invalid     " : a ? `${a.pinnedPct.toFixed(0).padStart(4)}% ${a.draggedPct.toFixed(1).padStart(5)}% ${a.surgesPerMin.toFixed(2).padStart(5)}  ${a.jerk.toFixed(3).padStart(6)}  ${String(a.holdMed?.toFixed(0) ?? "-").padStart(4)}/${String(a.holdMax?.toFixed(0) ?? "-").padEnd(4)}` : "      —                     ";
console.log(`${"journey".padEnd(22)}${runs.map((r) => `| ${r.padEnd(34)}`).join("")}`);
console.log(`${"".padEnd(22)}${runs.map(() => "| pinned dragged steps/m jerk hold med/max ").join("")}`);
for (const id of ids) console.log(`${(names[id] ?? id).slice(0, 21).padEnd(22)}${tables.map((t) => `| ${fmt(t[id])} `).join("")}`);
const avg = (t, k) => { const v = Object.values(t).filter((a) => !a.disabled).map((a) => a[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
console.log(`${"MEAN".padEnd(22)}${tables.map((t) => `| ${avg(t, "pinnedPct").toFixed(0).padStart(4)}% ${avg(t, "draggedPct").toFixed(1).padStart(5)}% ${avg(t, "surgesPerMin").toFixed(2).padStart(5)}  ${avg(t, "jerk").toFixed(3).padStart(6)}  ${avg(t, "holdMed").toFixed(0).padStart(4)}/${avg(t, "holdMax").toFixed(0).padEnd(4)} `).join("")}`);
