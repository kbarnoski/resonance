#!/usr/bin/env node
// harvest-depth-maps.mjs — depth maps for pack stills (2.5D parallax).
// Depth Anything V2 via fal preprocessor; grayscale map saved next to the
// pack under depth/journeys/<id>/gen-XXX.png. local-depth.json lists
// journeys with full coverage.
// Usage: node --env-file=.env.local scripts/harvest-depth-maps.mjs inferno first-snow
// Staging (2026-10-09): --picks=<mv-rollout out dir> maps the PICKED stills
// in <out>/picks.json to <out>/<Journey-Name>/depth/gen-NNN.png instead
// (pack + local-depth.json untouched); install.mjs carries them over.
import { fal } from "@fal-ai/client";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
fal.config({ credentials: process.env.FAL_KEY });
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const PACK = path.join(ROOT, "public", "tramokyo-pack");
const manifestPath = path.join(PACK, "local-depth.json");
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};

const CONCURRENCY = Number(process.env.DEPTH_CONCURRENCY) || 6;
const PICKS = process.argv.find((a) => a.startsWith("--picks="))?.slice(8) ?? null;
async function depthOne(src, outPath) {
  const b64 = (await readFile(src)).toString("base64");
  const r = await fal.subscribe("fal-ai/image-preprocessors/depth-anything/v2", { input: { image_url: `data:image/jpeg;base64,${b64}` }, logs: false });
  const url = r?.data?.image?.url ?? r?.image?.url;
  if (!url) throw new Error("no image in result");
  await writeFile(outPath, Buffer.from(await (await fetch(url)).arrayBuffer()));
}
if (PICKS) {
  const picks = JSON.parse(await readFile(path.join(PICKS, "picks.json"), "utf8"));
  const queue = [];
  for (const j of Object.values(picks)) {
    const outDir = path.join(PICKS, j.name.replace(/\s+/g, "-"), "depth");
    await mkdir(outDir, { recursive: true });
    for (const s of j.slots) if (s.file) {
      const outPath = path.join(outDir, `gen-${String(s.slot).padStart(3, "0")}.png`);
      // a re-pick changes the source still — keep a sidecar so stale maps are redone
      const tag = `${outPath}.src`;
      if (existsSync(outPath) && existsSync(tag) && (await readFile(tag, "utf8")) === s.file) continue;
      queue.push({ src: s.file, outPath, tag });
    }
  }
  console.log(`${queue.length} depth maps to render (staging)`);
  let ok = 0, bad = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) { const q = queue.shift(); if (!q) return;
      try { await depthOne(q.src, q.outPath); await writeFile(q.tag, q.src); ok++; } catch (e) { bad++; console.error(`  ✗ ${q.outPath}: ${e.message ?? e}`); } }
  }));
  console.log(`staging depth: ${ok} done, ${bad} failed`);
  process.exit(bad ? 1 : 0);
}
for (const jid of ids) {
  const imgDir = path.join(PACK, "images", "journeys", jid);
  if (!existsSync(imgDir)) { console.warn(`skip ${jid}: no images`); continue; }
  const outDir = path.join(PACK, "depth", "journeys", jid);
  await mkdir(outDir, { recursive: true });
  const files = (await readdir(imgDir)).filter((f) => /^gen-\d+\.jpg$/.test(f)).sort();
  console.log(`${jid}: ${files.length} stills`);
  let done = 0, failed = 0;
  const queue = [...files];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const f = queue.shift();
      if (!f) return;
      const outPath = path.join(outDir, f.replace(/\.jpg$/, ".png"));
      if (existsSync(outPath)) { done++; continue; }
      try {
        const b64 = (await readFile(path.join(imgDir, f))).toString("base64");
        const r = await fal.subscribe("fal-ai/image-preprocessors/depth-anything/v2", {
          input: { image_url: `data:image/jpeg;base64,${b64}` },
          logs: false,
        });
        const url = r?.data?.image?.url ?? r?.image?.url;
        if (!url) throw new Error("no image in result");
        const res = await fetch(url);
        await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
        done++;
        if (done % 20 === 0) console.log(`  ${jid}: ${done}/${files.length}`);
      } catch (e) {
        failed++;
        console.error(`  ✗ ${f}: ${e.message ?? e}`);
      }
    }
  }));
  console.log(`  ${jid}: ${done} done, ${failed} failed`);
  manifest[jid] = failed === 0; // two-way: coverage can REGRESS (perf audit H1)
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`manifest → ${manifestPath}`);
