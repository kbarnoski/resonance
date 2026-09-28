#!/usr/bin/env node
/**
 * analyze-clip-jumps.mjs (Karel 2026-09-28): Karel's review found that
 * bad clips share a signature — a visible JUMP mid-clip (temporal
 * discontinuity in the generated video). The harvest QA gate only
 * failed clips with scene scores > 0.35; softer jumps sailed through.
 *
 * This measures EVERY pack clip's per-frame scene scores via ffmpeg and
 * records the worst internal jump + when it happens, writing
 * docs/clip-jump-analysis.json. Correlated against docs/clip-review.json
 * (Karel's ground-truth verdicts) to calibrate the "bad" threshold, then
 * used to rank re-roll suspects across the whole pack.
 *
 * Run: node scripts/analyze-clip-jumps.mjs [--jobs=4]
 */
import { execFile } from "node:child_process";
import { readdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

const CLIPS_ROOT = "public/tramokyo-pack/clips/journeys";
const OUT = "docs/clip-jump-analysis.json";
const JOBS = Number(process.argv.find((a) => a.startsWith("--jobs="))?.slice(7) ?? 4);

const clips = [];
for (const jid of readdirSync(CLIPS_ROOT)) {
  const dir = path.join(CLIPS_ROOT, jid);
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".mp4") && !f.includes("hevc")) clips.push({ jid, file: f, path: path.join(dir, f) });
  }
}
console.log(`analyzing ${clips.length} clips with ${JOBS} workers…`);

function analyze(clip) {
  return new Promise((resolve) => {
    // Every frame with ANY scene-change energy ≥0.04 gets a metadata line.
    const args = ["-nostdin", "-i", clip.path, "-vf", "select='gte(scene,0.04)',metadata=print:file=-", "-f", "null", "-"];
    execFile(ffmpeg, args, { maxBuffer: 16 * 1024 * 1024 }, (_err, stdout) => {
      const events = [];
      let t = null;
      for (const line of String(stdout).split("\n")) {
        const mt = /pts_time:([\d.]+)/.exec(line);
        if (mt) { t = Number(mt[1]); continue; }
        const ms = /lavfi\.scene_score=([\d.]+)/.exec(line);
        if (ms && t !== null) { events.push({ t, score: Number(ms[1]) }); t = null; }
      }
      events.sort((a, b) => b.score - a.score);
      const top = events[0] ?? null;
      resolve({
        journeyId: clip.jid,
        clip: clip.file.replace(".mp4", ""),
        maxJump: top ? Number(top.score.toFixed(4)) : 0,
        atSec: top ? Number(top.t.toFixed(2)) : null,
        jumpsOver010: events.filter((e) => e.score >= 0.10).length,
        jumpsOver006: events.filter((e) => e.score >= 0.06).length,
      });
    });
  });
}

const results = [];
let i = 0;
async function worker() {
  while (i < clips.length) {
    const clip = clips[i++];
    results.push(await analyze(clip));
    if (results.length % 50 === 0) console.log(`  ${results.length}/${clips.length}`);
  }
}
await Promise.all(Array.from({ length: JOBS }, worker));

results.sort((a, b) => b.maxJump - a.maxJump);
writeFileSync(OUT, JSON.stringify({ analyzedAt: new Date().toISOString(), clips: results }, null, 1) + "\n");

// Correlate with Karel's verdicts so far
const reviewPath = "docs/clip-review.json";
if (existsSync(reviewPath)) {
  const verdicts = JSON.parse(readFileSync(reviewPath, "utf8"));
  const byId = new Map(results.map((r) => [`${r.journeyId}/${r.clip.replace("phase-", "").replace("travel-", "t")}`, r]));
  console.log("\n── verdict correlation ──");
  for (const [id, v] of Object.entries(verdicts)) {
    const r = byId.get(id);
    if (r) console.log(`${v.verdict.toUpperCase().padEnd(4)} ${id}  maxJump=${r.maxJump} at ${r.atSec}s  (≥0.10: ${r.jumpsOver010})`);
  }
}
console.log(`\ntop 15 worst jumps pack-wide:`);
for (const r of results.slice(0, 15)) console.log(`  ${r.maxJump} at ${r.atSec}s  ${r.journeyId.slice(0, 8)}/${r.clip}`);
console.log(`\nwrote ${OUT}`);
