#!/usr/bin/env node
/**
 * fix-hero-seams.mjs (Karel 2026-09-28): wan v2.6's 10s image-to-video
 * output has a systematic temporal seam at ~4.83s (a chunk boundary —
 * 214 of 258 pack heroes register their worst frame-jump at EXACTLY
 * that timestamp; Karel sees it as "a jump about halfway through").
 * Re-rolling can't fix an architectural artifact, but a 0.7s crossfade
 * of the clip across its own seam turns the cut into a house-style
 * dissolve. Content preserved; clips shorten 10s → 9.3s (they play
 * once and hold the last frame, so duration is cosmetic).
 *
 * Applies to HERO clips only (travel morphs are Kling — measured clean).
 * Originals are moved to clips-preseam-backup/ before replacement; both
 * codec variants (h264 + hevc) are re-encoded with the harvester's own
 * settings. Idempotent: a journey whose backup already exists is skipped.
 *
 * Usage: node scripts/fix-hero-seams.mjs <journeyId...|--all>
 */
import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, existsSync, renameSync } from "node:fs";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

const CLIPS = "public/tramokyo-pack/clips/journeys";
const BACKUP = "public/tramokyo-pack/clips-preseam-backup";
const SEAM = 4.83, FADE = 0.7;

const args = process.argv.slice(2);
const journeys = args.includes("--all")
  ? readdirSync(CLIPS)
  : args;
if (journeys.length === 0) { console.error("usage: fix-hero-seams.mjs <journeyId...|--all>"); process.exit(1); }

const ff = (a) => execFileSync(ffmpeg, ["-nostdin", "-loglevel", "error", "-y", ...a], { stdio: ["ignore", "inherit", "inherit"] });
const XFADE = `[0:v]split[a][b];[a]trim=0:${SEAM},setpts=PTS-STARTPTS[pre];[b]trim=${SEAM},setpts=PTS-STARTPTS[post];[pre][post]xfade=transition=fade:duration=${FADE}:offset=${SEAM - FADE}`;

let fixed = 0, skipped = 0;
for (const jid of journeys) {
  const dir = path.join(CLIPS, jid);
  if (!existsSync(dir)) { console.warn(`no clips dir: ${jid}`); continue; }
  const heroes = readdirSync(dir).filter((f) => /^phase-\d+\.mp4$/.test(f));
  const bdir = path.join(BACKUP, jid);
  for (const h of heroes) {
    const stem = h.replace(".mp4", "");
    const src = path.join(dir, h);
    const bak = path.join(bdir, h);
    if (existsSync(bak)) { skipped++; continue; } // already processed
    mkdirSync(bdir, { recursive: true });
    // Park the originals (h264 + hevc) before touching anything.
    renameSync(src, bak);
    const hevcSrc = path.join(dir, `${stem}.hevc.mp4`);
    if (existsSync(hevcSrc)) renameSync(hevcSrc, path.join(bdir, `${stem}.hevc.mp4`));
    // Re-encode both variants from the parked h264 (already gradfun'd
    // at harvest) with encodeDual's own settings.
    ff(["-i", bak, "-filter_complex", XFADE, "-an",
      "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", src]);
    ff(["-i", bak, "-filter_complex", XFADE, "-an",
      "-c:v", "libx265", "-crf", "20", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", "-movflags", "+faststart",
      path.join(dir, `${stem}.hevc.mp4`)]);
    fixed++;
    console.log(`  ✓ ${jid.slice(0, 8)}/${stem}`);
  }
}
console.log(`seam-dissolved ${fixed} heroes (${skipped} already done). Originals in ${BACKUP}/`);
