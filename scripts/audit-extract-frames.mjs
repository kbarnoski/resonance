#!/usr/bin/env node
/**
 * audit-extract-frames.mjs — material-law audit, stage 1 (2026-09-27).
 *
 * Extracts 2 frames from every non-HEVC clip in the Tramokyo pack
 * (early frame at 0.5s + late frame 1s before the end) and tiles each
 * journey's frames into a single labeled contact sheet, so a human (or
 * vision model) can audit EVERY journey's actual on-screen material in
 * one image per journey. Born from the 2026-09-27 review: Realized
 * shipped snow/frost in 3 of 6 hero clips because the zero-glitch QA
 * gate never checked CONTENT against the founding law.
 *
 * Usage: node scripts/audit-extract-frames.mjs <output-dir>
 * Output: <out>/frames/<journeyId>/{h|t}N-{a|b}.jpg
 *         <out>/sheets/<journeyId>.jpg   (tiled, row-major, alpha order)
 *         <out>/sheets-index.json        (journeyId → ordered tile list)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import ffmpeg from "ffmpeg-static";

const CLIPS_ROOT = "public/tramokyo-pack/clips/journeys";
const outRoot = process.argv[2];
if (!outRoot) { console.error("usage: audit-extract-frames.mjs <output-dir>"); process.exit(1); }

const journeys = readdirSync(CLIPS_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

const ff = (args) => execFileSync(ffmpeg, ["-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });

const index = {};
let clipCount = 0, frameCount = 0;
for (const jid of journeys) {
  const dir = join(CLIPS_ROOT, jid);
  const clips = readdirSync(dir).filter((f) => f.endsWith(".mp4") && !f.includes("hevc")).sort();
  const frameDir = join(outRoot, "frames", jid);
  mkdirSync(frameDir, { recursive: true });
  const tiles = [];
  for (const clip of clips) {
    clipCount++;
    const src = join(dir, clip);
    // h0/t0 naming keeps alphabetical order = visual order on the sheet
    const stem = basename(clip, ".mp4").replace("phase-", "h").replace("travel-", "t");
    for (const [suffix, args] of [
      ["a", ["-ss", "0.5", "-i", src]],
      ["b", ["-sseof", "-1", "-i", src]],
    ]) {
      const out = join(frameDir, `${stem}-${suffix}.jpg`);
      try {
        ff([...args, "-frames:v", "1", "-vf", "scale=320:320:force_original_aspect_ratio=increase,crop=320:320", "-q:v", "5", out]);
        if (existsSync(out)) { tiles.push(`${stem}-${suffix}`); frameCount++; }
      } catch { /* short/odd clip — sheet just has fewer tiles */ }
    }
  }
  if (tiles.length === 0) continue;
  tiles.sort();
  const cols = 6;
  const rows = Math.ceil(tiles.length / cols);
  const sheetDir = join(outRoot, "sheets");
  mkdirSync(sheetDir, { recursive: true });
  ff([
    "-framerate", "1", "-pattern_type", "glob", "-i", join(frameDir, "*.jpg"),
    "-vf", `tile=${cols}x${rows}:padding=4:color=black`, "-frames:v", "1", "-q:v", "5",
    join(sheetDir, `${jid}.jpg`),
  ]);
  index[jid] = tiles;
}
writeFileSync(join(outRoot, "sheets-index.json"), JSON.stringify(index, null, 2));
console.log(`journeys: ${Object.keys(index).length}, clips: ${clipCount}, frames: ${frameCount}`);
