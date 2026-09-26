#!/usr/bin/env node
// qa-scan-clips.mjs — screen EVERY clip already in the pack against the
// no-glitch law (scene-cut spikes = baked-in generation artifacts).
// Prints PASS/FAIL per clip and a summary list of failures to
// regenerate. Read-only; deletion/regeneration is the caller's decision.
// Usage: node scripts/qa-scan-clips.mjs [--delete-failures]
import { readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const DELETE = process.argv.includes("--delete-failures");
const ROOT = path.join(process.cwd(), "public", "tramokyo-pack", "clips", "journeys");

function qaClip(clipPath) {
  try {
    const out = execFileSync(FFMPEG, [
      "-hide_banner", "-nostats", "-i", clipPath,
      "-vf", "select='gt(scene,0.35)',metadata=print:file=-",
      "-f", "null", "-",
    ], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 }).toString();
    return (out.match(/scene_score/g) || []).length;
  } catch (e) {
    const out = String(e.stdout ?? "");
    if (out.length > 0) return (out.match(/scene_score/g) || []).length;
    return -1;
  }
}

if (!existsSync(ROOT)) { console.error("no clips dir"); process.exit(1); }
const failures = [];
let scanned = 0;
for (const jid of await readdir(ROOT)) {
  const dir = path.join(ROOT, jid);
  let files;
  try { files = await readdir(dir); } catch { continue; }
  for (const f of files.filter((x) => x.endsWith(".mp4") && !x.includes(".hevc."))) {
    const p = path.join(dir, f);
    const spikes = qaClip(p);
    scanned++;
    if (spikes !== 0) {
      failures.push({ jid, f, spikes });
      console.log(`FAIL ${jid}/${f} — ${spikes < 0 ? "unreadable" : spikes + " spike(s)"}`);
      if (DELETE) {
        await rm(p, { force: true });
        await rm(p.replace(/\.mp4$/, ".hevc.mp4"), { force: true });
      }
    }
  }
}
console.log(`\nscanned ${scanned} clips — ${failures.length} failures${DELETE ? " (deleted; re-run harvesters to regenerate under QA)" : ""}`);
if (failures.length && !DELETE) console.log("re-run with --delete-failures, then re-run the harvesters (they skip clean clips).");
