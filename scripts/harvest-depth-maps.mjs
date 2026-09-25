#!/usr/bin/env node
// harvest-depth-maps.mjs — depth maps for pack stills (2.5D parallax).
// Depth Anything V2 via fal preprocessor; grayscale map saved next to the
// pack under depth/journeys/<id>/gen-XXX.png. local-depth.json lists
// journeys with full coverage.
// Usage: node --env-file=.env.local scripts/harvest-depth-maps.mjs inferno first-snow
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

const CONCURRENCY = 6;
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
  if (failed === 0) manifest[jid] = true;
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`manifest → ${manifestPath}`);
