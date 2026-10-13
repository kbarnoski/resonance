#!/usr/bin/env node
// flicker-meter.mjs — photosensitive flash/flicker meter for a video file.
//
// WCAG 2.3.1 / ITU-R BT.1702 / Ofcom general + red flash thresholds
// (Harding-style), plus Resonance's local-flicker (particle shimmer) metric.
// Core analysis lives in src/lib/safety/flicker-analysis.mjs (unit-tested).
// See docs/flicker-safety.md.
//
// Usage:
//   node scripts/flicker-meter.mjs <video.mp4|webm> [--json] [--out=report.json]
//        [--width=256] [--fps=<native, max 60>] [--timeline]
// Exit code: 0 PASS/WARN, 1 FAIL, 2 error.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFlickerAnalyzer, summarize } from "../src/lib/safety/flicker-analysis.mjs";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");

/** Probe native size + fps from ffmpeg's stream banner. */
export function probe(file) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const s = String(r.stderr || "");
  const v = s.split("\n").find((l) => /Stream .*Video:/.test(l));
  if (!v) throw new Error(`no video stream in ${file}`);
  const size = v.match(/, (\d{2,5})x(\d{2,5})[ ,]/);
  const fps = v.match(/([\d.]+) fps/) || v.match(/([\d.]+) tbr/);
  return { width: +size[1], height: +size[2], fps: fps ? +fps[1] : 30 };
}

/**
 * Analyse one file. Decodes downscaled rgb24 frames via ffmpeg-static and
 * streams them through the analyser (constant memory).
 */
export async function measureFile(file, { width = 256, fps, opts } = {}) {
  const p = probe(file);
  const outFps = Math.min(60, fps || p.fps || 30);
  const w = width;
  const h = Math.max(2, Math.round((p.height * w) / p.width / 2) * 2);
  const frameBytes = w * h * 3;
  const an = createFlickerAnalyzer({ width: w, height: h, fps: outFps }, opts);
  await new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, [
      "-hide_banner", "-nostats", "-loglevel", "error", "-i", file,
      "-vf", `fps=${outFps},scale=${w}:${h}:flags=area`,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let buf = Buffer.alloc(0);
    let err = "";
    ff.stdout.on("data", (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      while (buf.length >= frameBytes) {
        an.push(buf.subarray(0, frameBytes));
        buf = buf.subarray(frameBytes);
      }
    });
    ff.stderr.on("data", (d) => { err += d; });
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(0, 400)}`))));
  });
  return { file, source: p, decoded: { width: w, height: h, fps: outFps }, ...an.finish() };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  if (!file) { console.error("usage: node scripts/flicker-meter.mjs <video> [--json] [--out=f.json] [--timeline]"); process.exit(2); }
  try {
    const r = await measureFile(file, { width: +(flag("width") || 256), fps: flag("fps") ? +flag("fps") : undefined });
    if (flag("out")) writeFileSync(flag("out"), JSON.stringify(r, null, 2));
    if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(summarize(path.basename(file), r));
      if (args.includes("--timeline")) {
        console.log("\n  sec  gen-trans  red-trans  changing-field%  local-field%  local-screen%");
        for (const t of r.timeline) {
          console.log(`  ${String(t.t).padStart(3)}  ${String(t.generalTransitions).padStart(9)}  ${String(t.redTransitions).padStart(9)}  ${String(t.maxChangingFieldPct).padStart(15)}  ${String(t.localFieldPct).padStart(12)}  ${String(t.localScreenPct).padStart(13)}`);
        }
      }
    }
    process.exit(r.verdict === "FAIL" ? 1 : 0);
  } catch (e) {
    console.error(`flicker-meter error: ${e.message}`);
    process.exit(2);
  }
}
