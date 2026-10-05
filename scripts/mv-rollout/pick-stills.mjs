#!/usr/bin/env node
// pick-stills.mjs — choose one option per slot from harvest-stills output
// and build QA contact sheets. Score (pixels, 64 px): negative space
// (near-black share, the layering room Karel asks for), off-centre weight,
// blown-highlight / disc risk, white-ground penalty, and near-duplicate
// (16 px zero-mean correlation >= 0.85) against the journey's earlier
// picks so a phase never becomes a slideshow. Human QA then overrides via
// <out>/overrides.json {"<journeyId>": {"<slot>": "c"}} (or "skip" to
// force a re-roll) before install.
// Usage: node scripts/mv-rollout/pick-stills.mjs --out=<dir>
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const slots = JSON.parse(readFileSync(`${OUT}/slots.json`, "utf8"));
const overrides = existsSync(`${OUT}/overrides.json`) ? JSON.parse(readFileSync(`${OUT}/overrides.json`, "utf8")) : {};

async function stats(f) {
  const { data } = await sharp(f).greyscale().resize(64, 64, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0, dark = 0, hot = 0, mx = 0, my = 0, mw = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = data[y * 64 + x] / 255; sum += v; if (v < 0.09) dark++; if (v > 0.93) hot++; const w = Math.max(0, v - 0.15); mx += x * w; my += y * w; mw += w; }
  const t = [...(await sharp(f).greyscale().resize(16, 16, { fit: "fill" }).raw().toBuffer())];
  const m = t.reduce((a, b) => a + b, 0) / t.length; const c = t.map((x) => x - m); const n = Math.hypot(...c) || 1;
  return { mean: sum / 4096, dark: dark / 4096, hot: hot / 4096, off: mw ? Math.hypot(mx / mw / 64 - 0.5, my / mw / 64 - 0.5) : 0, vec: c.map((x) => x / n) };
}
const corr = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const picks = {};
for (const [id, j] of Object.entries(slots)) {
  const dir = `${OUT}/${j.name.replace(/\s+/g, "-")}/opt`;
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const chosen = [];
  picks[id] = { name: j.name, slots: [] };
  for (const s of j.slots) {
    const stem = `gen-${String(s.slot).padStart(3, "0")}`;
    const forced = overrides[id]?.[s.slot];
    const opts = files.filter((f) => f.startsWith(stem + "-")).sort();
    let best = null;
    for (const f of opts) {
      const letter = f.slice(stem.length + 1, -4);
      if (forced && forced !== "skip" && letter !== forced) continue;
      if (overrides[id]?.reject?.includes(`${s.slot}${letter}`)) continue;
      const st = await stats(`${dir}/${f}`);
      const dup = chosen.some((c) => corr(c.vec, st.vec) >= 0.85);
      const score = Math.min(st.dark, 0.75) + Math.min(st.off, 0.2) - (st.hot > 0.03 ? 0.4 : 0) - (st.mean > 0.55 ? 0.3 : 0) - (dup ? 1 : 0);
      if (!best || score > best.score) best = { f, letter, score, dup, ...st };
    }
    if (!best || forced === "skip") { picks[id].slots.push({ ...s, file: null }); continue; }
    chosen.push(best);
    picks[id].slots.push({ ...s, file: `${dir}/${best.f}`, letter: best.letter, score: +best.score.toFixed(2), dark: +best.dark.toFixed(2), dup: best.dup });
  }
  const missing = picks[id].slots.filter((x) => !x.file).length;
  const dups = picks[id].slots.filter((x) => x.dup).length;
  console.log(`${j.name.padEnd(14)} ${j.slots.length} slots · missing ${missing} · forced-dup ${dups} · median dark ${(picks[id].slots.map((x) => x.dark ?? 0).sort()[Math.floor(j.slots.length / 2)] ?? 0)}`);
  // contact sheet: picks in slot order, labelled phase/shot/register
  const W = 220, cols = 8, rows = Math.ceil(j.slots.length / cols);
  const tiles = [];
  for (const [k, x] of picks[id].slots.entries()) {
    if (!x.file) continue;
    const img = await sharp(x.file).resize(W, W).toBuffer();
    const label = Buffer.from(`<svg width="${W}" height="18"><rect width="100%" height="100%" fill="black"/><text x="3" y="13" font-size="12" fill="#ffd27a" font-family="monospace">${x.slot} ${x.phase.slice(0, 5)} s${x.shotIdx + 1} ${x.reg} ${x.letter}${x.dup ? " DUP" : ""}</text></svg>`);
    tiles.push({ input: img, left: (k % cols) * W, top: Math.floor(k / cols) * (W + 18) + 18 }, { input: label, left: (k % cols) * W, top: Math.floor(k / cols) * (W + 18) });
  }
  await sharp({ create: { width: cols * W, height: rows * (W + 18), channels: 3, background: "#111" } }).composite(tiles).jpeg({ quality: 82 }).toFile(`${OUT}/${j.name.replace(/\s+/g, "-")}/contact-sheet.jpg`);
}
writeFileSync(`${OUT}/picks.json`, JSON.stringify(picks, null, 1));
