#!/usr/bin/env node
// harvest-morphs.mjs — five travel morphs per journey for a rollout set,
// staged outside the pack. Morph t<k> runs from the picked still of phase
// k's LAST slot to phase k+1's FIRST slot (the slots the kiosk shows
// around the boundary), as the camera move the shot list wrote for it.
// Recipe = the approved one: Kling O3 standard image-to-video with start +
// end frame, 5 s, negative-space prompt. Zero-glitch QA: no scene spike
// >= 0.35, AND (new 2026-10-05) no flare streak — a thin horizontal band
// of light spanning most of the frame (Vespers 2's prototype morph). Up to
// 3 attempts; a morph that cannot pass is left out (crossfade fallback).
// Usage: node --env-file=.env.local scripts/mv-rollout/harvest-morphs.mjs <set> --out=<dir> [--only=id,..] [--only-t=id:k,..]
import { fal } from "@fal-ai/client";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const setKey = process.argv[2];
const OUT = arg("out");
const ONLY = arg("only")?.split(",");
const ONLY_T = arg("only-t")?.split(",");
const { JOURNEYS } = await import(`./shotlists/${setKey}.mjs`);
const picks = JSON.parse(readFileSync(`${OUT}/picks.json`, "utf8"));
fal.config({ credentials: process.env.FAL_KEY });

export function qaSpikes(f) {
  let out = "";
  try { out = execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-i", f, "-vf", "select='gt(scene,0.35)',metadata=print:file=-", "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 << 20 }).toString(); } catch (e) { out = String(e.stdout ?? ""); }
  return (out.match(/scene_score/g) || []).length;
}
/** Thin horizontal streak (Vespers 2 prototype morph): a row brighter
 *  than the rows 3 above AND below by > 8 grey levels across >= 60% of
 *  the width — an anamorphic flare line, not a broad glow or horizon.
 *  Calibrated 2026-10-05: the Vespers prototype hits 14/30 sampled
 *  frames; Snowflake's approved morphs 0-2/30. Returns frames hit. */
export function qaFlare(f) {
  const S = 128;
  const raw = execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", f, "-vf", `fps=6,scale=${S}:${S},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 64 << 20 });
  const frames = Math.floor(raw.length / (S * S));
  let hits = 0;
  for (let k = 0; k < frames; k++) {
    const o = k * S * S;
    let hit = false;
    for (let y = 3; y < S - 3 && !hit; y++) {
      let c = 0;
      for (let x = 0; x < S; x++) if (raw[o + y * S + x] - Math.max(raw[o + (y - 3) * S + x], raw[o + (y + 3) * S + x]) > 8) c++;
      if (c >= 0.6 * S) hit = true;
    }
    if (hit) hits++;
  }
  return hits;
}
const FLARE_MAX = 2;
function encodeDual(raw, base) {
  const o = { stdio: "pipe", maxBuffer: 32 << 20 };
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", raw, "-vf", "gradfun=strength=4:radius=16", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", `${base}.mp4`], o);
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", raw, "-vf", "gradfun=strength=4:radius=16", "-c:v", "libx265", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", "-movflags", "+faststart", "-an", `${base}.hevc.mp4`], o);
}
const b64 = (f) => `data:image/jpeg;base64,${readFileSync(f).toString("base64")}`;
const NEG = "lens flare, anamorphic streak, horizontal light streak, light leak, flicker, hard cut, scene change, text, people";
async function kling(prompt, from, to) {
  const base = { prompt, image_url: b64(from), end_image_url: b64(to), duration: "5" };
  for (const input of [{ ...base, negative_prompt: NEG }, base]) {
    try { const r = await fal.subscribe("fal-ai/kling-video/o3/standard/image-to-video", { input, logs: false }); const u = r?.data?.video?.url; if (u) return u; }
    catch (e) { if (input.negative_prompt && /negative|unexpected|extra|422/i.test(String(e.message ?? e) + JSON.stringify(e.body ?? ""))) continue; throw e; }
  }
  throw new Error("no video");
}
const log = [];
let calls = 0;
const jobs = [];
for (const j of JOURNEYS) {
  if (ONLY && !ONLY.includes(j.id)) continue;
  const P = picks[j.id];
  const dir = `${OUT}/${j.name.replace(/\s+/g, "-")}/morphs`;
  mkdirSync(dir, { recursive: true });
  for (let k = 0; k < j.phases.length - 1; k++) {
    if (ONLY_T && !ONLY_T.includes(`${j.id}:${k}`)) continue;
    const from = P.slots.filter((s) => s.phaseIdx === k).at(-1);
    const to = P.slots.find((s) => s.phaseIdx === k + 1);
    if (!from?.file || !to?.file) { log.push(`${j.name} t${k}: missing still`); continue; }
    const base = `${dir}/travel-${k}`;
    const ends = JSON.stringify({ from: from.file, to: to.file, move: j.morphs[k] });
    if (existsSync(`${base}.mp4`)) {
      // a morph is bound to its two endpoint stills + camera move: if QA
      // swapped either still (or the move changed), it is stale
      const prev = existsSync(`${base}.ends.json`) ? readFileSync(`${base}.ends.json`, "utf8") : ends;
      if (prev === ends) continue;
      for (const e of ["mp4", "hevc.mp4", "raw.mp4"]) if (existsSync(`${base}.${e}`)) renameSync(`${base}.${e}`, `${base}.STALE-${Date.now()}.${e}`);
    }
    writeFileSync(`${base}.ends.json`, ends);
    const prompt = `one continuous slow camera journey: ${j.morphs[k]}, sparse luminous forms, most of the frame remains deep dark negative space at every moment, soft diffuse glow, meditative pace, no cuts, no flicker`;
    jobs.push({ j, k, from: from.file, to: to.file, base, prompt });
  }
}
console.log(`${jobs.length} morphs to make`);
async function run(job) {
  for (let a = 0; a < 3; a++) {
    const raw = `${job.base}.raw${a}.mp4`;
    try {
      calls++;
      const url = await kling(job.prompt, job.from, job.to);
      writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
      const spikes = qaSpikes(raw), flare = qaFlare(raw);
      const msg = `${job.j.name} t${job.k} attempt ${a + 1}: spikes ${spikes}, flare-frames ${flare}`;
      console.log(msg); log.push(msg);
      if (spikes === 0 && flare <= FLARE_MAX) { encodeDual(raw, job.base); renameSync(raw, `${job.base}.raw.mp4`); return; }
      renameSync(raw, `${job.base}.REJECTED-${a + 1}.mp4`);
    } catch (e) { const m = `${job.j.name} t${job.k} ✗ ${e.message ?? e}`; console.log(m); log.push(m); rmSync(raw, { force: true }); }
  }
  log.push(`${job.j.name} t${job.k}: no clean morph in 3 attempts — crossfade fallback`);
}
let i = 0;
await Promise.all(Array.from({ length: 5 }, async () => { while (i < jobs.length) await run(jobs[i++]); }));
writeFileSync(`${OUT}/morphs-log-${Date.now()}.txt`, log.join("\n") + `\nkling calls: ${calls}\n`);
console.log(`kling calls: ${calls}`);
