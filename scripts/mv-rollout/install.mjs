#!/usr/bin/env node
// install.mjs — install a QA-approved rollout set into the Tramokyo pack.
// For each journey: back up its images/, depth/ and clips/ dirs and its
// three manifest entries, write the picked stills as gen-000..N-1 (slot
// order = story order, the player's phase slices), the QA-clean travel
// morphs as travel-<k>(.hevc).mp4, then rewrite local-images.json and
// local-clips.json entries for THESE ids only (layout preserved, every
// other entry byte-identical — verified) and drop their depth flag until
// harvest-depth-maps.mjs regenerates the maps.
// Usage: node scripts/mv-rollout/install.mjs <set> --out=<staging dir> [--dry-run]
import { readFileSync, existsSync, mkdirSync, cpSync, renameSync, copyFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { readPackJson } from "../lib/pack-json.mjs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const setKey = process.argv[2];
const OUT = arg("out");
const DRY = process.argv.includes("--dry-run");
const { JOURNEYS, KEEP = {} } = await import(`./shotlists/${setKey}.mjs`);
const picks = JSON.parse(readFileSync(`${OUT}/picks.json`, "utf8"));
const PACK = "public/tramokyo-pack";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const BACKUP = `${os.homedir()}/resonance-pack-backups/mv-rollout-${setKey}-pack-${stamp}`;
const images = readPackJson(`${PACK}/local-images.json`);
const clips = readPackJson(`${PACK}/local-clips.json`);
const depth = readPackJson(`${PACK}/local-depth.json`);
const before = { images: structuredClone(images.data), clips: structuredClone(clips.data), depth: structuredClone(depth.data) };
const ids = JOURNEYS.map((j) => j.id);

for (const j of JOURNEYS) {
  const P = picks[j.id];
  const missing = P.slots.filter((s) => !s.file);
  if (missing.length) throw new Error(`${j.name}: ${missing.length} slots without an approved still`);
}
if (DRY) { console.log("dry run ok"); process.exit(0); }
mkdirSync(BACKUP, { recursive: true });
writeFileSync(`${BACKUP}/manifest-entries.json`, JSON.stringify(Object.fromEntries(ids.map((id) => [id, { images: images.data[id], clips: clips.data[id], depth: depth.data[id] }])), null, 1));
for (const j of JOURNEYS) {
  const P = picks[j.id];
  // KEEP journeys without staged morphs keep their existing clips (their
  // morph-end stills were kept, see harvest-stills.mjs KEEP)
  const stagedMorphs = existsSync(`${OUT}/${j.name.replace(/\s+/g, "-")}/morphs/travel-0.mp4`);
  const keepClips = !!KEEP[j.id] && !stagedMorphs;
  for (const kind of ["images", "depth", "clips"]) {
    if (kind === "clips" && keepClips) continue;
    const d = `${PACK}/${kind}/journeys/${j.id}`;
    if (existsSync(d)) { mkdirSync(`${BACKUP}/${kind}`, { recursive: true }); renameSync(d, `${BACKUP}/${kind}/${j.id}`); }
  }
  const imgDir = `${PACK}/images/journeys/${j.id}`;
  mkdirSync(imgDir, { recursive: true });
  const urls = P.slots.map((s) => {
    const stem = `gen-${String(s.slot).padStart(3, "0")}`;
    copyFileSync(s.file, `${imgDir}/${stem}.jpg`);
    return `/tramokyo-pack/images/journeys/${j.id}/${stem}.jpg`;
  });
  images.data[j.id] = urls;
  const mdir = `${OUT}/${j.name.replace(/\s+/g, "-")}/morphs`;
  const cdir = `${PACK}/clips/journeys/${j.id}`;
  const entry = {};
  for (let k = 0; k < j.phases.length - 1; k++) {
    if (!existsSync(`${mdir}/travel-${k}.mp4`)) continue;
    mkdirSync(cdir, { recursive: true });
    copyFileSync(`${mdir}/travel-${k}.mp4`, `${cdir}/travel-${k}.mp4`);
    const e = { h264: `/tramokyo-pack/clips/journeys/${j.id}/travel-${k}.mp4` };
    if (existsSync(`${mdir}/travel-${k}.hevc.mp4`)) { copyFileSync(`${mdir}/travel-${k}.hevc.mp4`, `${cdir}/travel-${k}.hevc.mp4`); e.hevc = `/tramokyo-pack/clips/journeys/${j.id}/travel-${k}.hevc.mp4`; }
    entry[`t${k}`] = e;
  }
  if (keepClips) { /* clips dir + manifest entry untouched */ }
  else if (Object.keys(entry).length) clips.data[j.id] = entry; else delete clips.data[j.id];
  // Staged depth maps (harvest-depth-maps.mjs --picks=<out>) for EVERY
  // picked still → installed with the stills and the journey keeps its
  // parallax; otherwise the flag drops until harvest-depth-maps.mjs runs.
  const sdir = `${OUT}/${j.name.replace(/\s+/g, "-")}/depth`;
  const stems = P.slots.map((s) => `gen-${String(s.slot).padStart(3, "0")}`);
  const fresh = (st, s) => existsSync(`${sdir}/${st}.png`) && existsSync(`${sdir}/${st}.png.src`) && readFileSync(`${sdir}/${st}.png.src`, "utf8") === s.file;
  if (stems.every((st, k) => fresh(st, P.slots[k]))) {
    const ddir = `${PACK}/depth/journeys/${j.id}`;
    mkdirSync(ddir, { recursive: true });
    for (const st of stems) copyFileSync(`${sdir}/${st}.png`, `${ddir}/${st}.png`);
    depth.data[j.id] = true;
  } else delete depth.data[j.id]; // re-flagged by harvest-depth-maps.mjs once every new still has a map
  console.log(`  ✓ ${j.name}: ${urls.length} stills, ${Object.keys(entry).length} morphs`);
}
// every other entry byte-identical
for (const [name, file, prev] of [["images", images, before.images], ["clips", clips, before.clips], ["depth", depth, before.depth]]) {
  for (const k of Object.keys(prev)) if (!ids.includes(k) && JSON.stringify(prev[k]) !== JSON.stringify(file.data[k])) throw new Error(`${name}: ${k} changed`);
  file.write();
}
console.log(`installed · backup ${BACKUP}`);
