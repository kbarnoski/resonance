#!/usr/bin/env node
// optimise-picks.mjs — choose ONE option per slot for a whole journey at once,
// minimising the audit's own pixel lenses: P1 near-duplicates (16 px
// zero-mean correlation >= 0.85 with any other pick, target <= 18 %) and P2
// centred subjects (bright-mass centroid within 6 % of centre, target <= 33 %),
// then maximising negative space (P3). pick-stills.mjs scores slots greedily
// in order; this is the global pass. Honours overrides.json `reject`
// (human-eye QA: figures, unasked orbs, text, artifacts) and writes the chosen
// letter per slot back into overrides.json; then run pick-stills.mjs.
// Usage: node scripts/mv-rollout/optimise-picks.mjs <out dir> [--only=id,..]
import sharp from "sharp";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const OUT = process.argv[2];
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const slots = JSON.parse(readFileSync(`${OUT}/slots.json`, "utf8"));
const ov = JSON.parse(readFileSync(`${OUT}/overrides.json`, "utf8"));
async function stats(f) {
  const { data } = await sharp(f).greyscale().resize(64, 64, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let dark = 0, mx = 0, my = 0, mw = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = data[y * 64 + x] / 255; if (v < 0.09) dark++; const w = Math.max(0, v - 0.15); mx += x * w; my += y * w; mw += w; }
  const t = [...(await sharp(f).greyscale().resize(16, 16, { fit: "fill" }).raw().toBuffer())];
  const m = t.reduce((a, b) => a + b, 0) / t.length; const c = t.map((x) => x - m); const n = Math.hypot(...c) || 1;
  return { dark: dark / 4096, off: mw ? Math.hypot(mx / mw / 64 - 0.5, my / mw / 64 - 0.5) : 0, vec: c.map((x) => x / n) };
}
const corr = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
for (const [id, j] of Object.entries(slots)) {
  if (ONLY && !ONLY.includes(id)) continue;
  const dir = `${OUT}/${j.name.replace(/\s+/g, "-")}/opt`;
  const files = readdirSync(dir);
  const rej = new Set(ov[id]?.reject ?? []);
  const C = [];
  for (const s of j.slots) {
    const stem = `gen-${String(s.slot).padStart(3, "0")}`;
    const opts = [];
    for (const f of files.filter((f) => f.startsWith(stem + "-")).sort()) { const l = f.slice(stem.length + 1, -4); if (rej.has(`${s.slot}${l}`)) continue; opts.push({ l, ...(await stats(`${dir}/${f}`)) }); }
    C.push(opts);
  }
  const cost = (sel) => {
    const v = sel.map((k, i) => C[i][k]); let dups = 0, cen = 0, dark = 0;
    for (let i = 0; i < v.length; i++) { if (v.some((o, k) => k !== i && corr(o.vec, v[i].vec) >= 0.85)) dups++; if (v[i].off < 0.06) cen++; dark += Math.min(v[i].dark, 0.75); }
    return { dups, cen, score: Math.max(0, dups - 0.18 * v.length) * 10 + Math.max(0, cen - 0.33 * v.length) * 10 + dups + cen * 0.5 - dark * 0.5 };
  };
  let sel = C.map(() => 0), best = cost(sel);
  for (let it = 0; it < 40; it++) { let improved = false;
    for (let i = 0; i < C.length; i++) for (let k = 0; k < C[i].length; k++) { if (k === sel[i]) continue; const t = [...sel]; t[i] = k; const c = cost(t); if (c.score < best.score - 1e-9) { sel = t; best = c; improved = true; } }
    if (!improved) break; }
  ov[id] = { ...(ov[id] ?? {}), ...Object.fromEntries(sel.map((k, i) => [j.slots[i].slot, C[i][k].l])) };
  console.log(j.name, `dups ${best.dups}/${C.length} (${Math.round(best.dups / C.length * 100)}%) centred ${best.cen} (${Math.round(best.cen / C.length * 100)}%)`);
}
writeFileSync(`${OUT}/overrides.json`, JSON.stringify(ov, null, 1));
