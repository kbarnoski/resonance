#!/usr/bin/env node
// rebuild-pack-manifests.mjs — regenerate local-clips.json and
// local-depth.json from what is ACTUALLY on disk. The harvest lanes each
// read-modify-write the shared manifests, so parallel runs can clobber
// entries; filenames are deterministic, so disk is the source of truth.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PACK = path.join(process.cwd(), "public", "tramokyo-pack");

// ── clips ──
const clipsRoot = path.join(PACK, "clips", "journeys");
const clips = {};
if (existsSync(clipsRoot)) {
  for (const jid of await readdir(clipsRoot)) {
    const dir = path.join(clipsRoot, jid);
    let files;
    try { files = await readdir(dir); } catch { continue; }
    const entry = {};
    for (const f of files) {
      let m = f.match(/^phase-(\d+)\.mp4$/);
      if (m) {
        const pub = `/tramokyo-pack/clips/journeys/${jid}/phase-${m[1]}`;
        entry[m[1]] = files.includes(`phase-${m[1]}.hevc.mp4`)
          ? { h264: `${pub}.mp4`, hevc: `${pub}.hevc.mp4` }
          : `${pub}.mp4`;
        continue;
      }
      m = f.match(/^travel-(\d+)\.mp4$/);
      if (m) {
        const pub = `/tramokyo-pack/clips/journeys/${jid}/travel-${m[1]}`;
        entry[`t${m[1]}`] = files.includes(`travel-${m[1]}.hevc.mp4`)
          ? { h264: `${pub}.mp4`, hevc: `${pub}.hevc.mp4` }
          : { h264: `${pub}.mp4` };
      }
    }
    if (Object.keys(entry).length > 0) clips[jid] = entry;
  }
}
await writeFile(path.join(PACK, "local-clips.json"), JSON.stringify(clips, null, 2));
console.log(`local-clips.json: ${Object.keys(clips).length} journeys`);

// ── depth: covered iff every pack still has a matching map ──
const depthRoot = path.join(PACK, "depth", "journeys");
const imagesRoot = path.join(PACK, "images", "journeys");
const depth = {};
if (existsSync(depthRoot)) {
  for (const jid of await readdir(depthRoot)) {
    try {
      const stills = (await readdir(path.join(imagesRoot, jid))).filter((f) => /^gen-\d+\.jpg$/.test(f));
      const maps = new Set(await readdir(path.join(depthRoot, jid)));
      depth[jid] = stills.length > 0 && stills.every((f) => maps.has(f.replace(/\.jpg$/, ".png")));
    } catch {
      depth[jid] = false;
    }
  }
}
await writeFile(path.join(PACK, "local-depth.json"), JSON.stringify(depth, null, 2));
const covered = Object.values(depth).filter(Boolean).length;
console.log(`local-depth.json: ${covered}/${Object.keys(depth).length} journeys fully covered`);
