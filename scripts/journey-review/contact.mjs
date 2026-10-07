#!/usr/bin/env node
/**
 * JOURNEY REVIEW — CONTACT SHEETS. Every recorded 2 s frame of a journey on
 * sheets (6 × 8 = 48 frames ≈ 96 s per sheet) with the journey clock burned in,
 * plus a red tag on frames named as evidence in violations.json.
 *
 *   node scripts/journey-review/contact.mjs <runId> [--journeys a,b] [--cols 6] [--rows 8]
 * Out: runs/<runId>/<journey>/contact-01.jpg …
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const runId = argv[0];
if (!runId) { console.error("usage: contact.mjs <runId> [--journeys a,b]"); process.exit(1); }
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const RUN = path.join(HERE, "runs", runId);
const COLS = +arg("--cols", 6), ROWS = +arg("--rows", 8);
const TW = 320, TH = 200;
const only = arg("--journeys", null)?.split(",");
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

for (const j of fs.readdirSync(RUN)) {
  const D = path.join(RUN, j);
  if (!fs.existsSync(path.join(D, "frames.jsonl")) || (only && !only.includes(j))) continue;
  const frames = fs.readFileSync(path.join(D, "frames.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a.wall - b.wall);
  const viol = fs.existsSync(path.join(D, "violations.json")) ? JSON.parse(fs.readFileSync(path.join(D, "violations.json"), "utf8")) : [];
  const flagged = new Map();
  for (const v of viol) if (v.severity !== "info") for (const e of v.evidence ?? []) flagged.set(path.basename(e), v.rule);
  const name = fs.existsSync(path.join(D, "summary.json")) ? JSON.parse(fs.readFileSync(path.join(D, "summary.json"), "utf8")).name : j;
  const per = COLS * ROWS;
  for (let s = 0; s * per < frames.length; s++) {
    const chunk = frames.slice(s * per, (s + 1) * per);
    const comps = [];
    for (let i = 0; i < chunk.length; i++) {
      const f = chunk[i];
      const x = (i % COLS) * TW, y = 28 + Math.floor(i / COLS) * TH;
      const file = path.join(D, f.file);
      if (!fs.existsSync(file)) continue;
      comps.push({ input: await sharp(file).resize(TW, TH, { fit: "cover" }).toBuffer(), left: x, top: y });
      const tag = flagged.get(path.basename(f.file));
      const label = `${f.ct === null ? "--" : f.ct.toFixed(1) + "s"}${tag ? "  ⚑ " + tag : ""}`;
      comps.push({
        input: Buffer.from(`<svg width="${TW}" height="22"><rect width="${TW}" height="22" fill="${tag ? "#b00020" : "#000"}" opacity="0.72"/><text x="6" y="16" font-family="Helvetica" font-size="13" fill="#fff">${esc(label)}</text></svg>`),
        left: x, top: y,
      });
    }
    comps.push({ input: Buffer.from(`<svg width="${COLS * TW}" height="28"><rect width="100%" height="28" fill="#111"/><text x="8" y="19" font-family="Helvetica" font-size="15" fill="#ddd">${esc(`${name} — ${runId} — sheet ${s + 1}`)}</text></svg>`), left: 0, top: 0 });
    const out = path.join(D, `contact-${String(s + 1).padStart(2, "0")}.jpg`);
    await sharp({ create: { width: COLS * TW, height: 28 + ROWS * TH, channels: 3, background: "#000" } }).composite(comps).jpeg({ quality: 78 }).toFile(out);
    console.error(`${j}: ${path.relative(RUN, out)}`);
  }
}
