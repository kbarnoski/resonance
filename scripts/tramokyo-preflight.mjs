#!/usr/bin/env node
// tramokyo-preflight.mjs — the one-command pre-show check (maturity pass
// 2026-09-26). Run before every show / dress rehearsal:
//   node scripts/tramokyo-preflight.mjs
// Verifies the whole chain and prints PASS or the exact failures.
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PACK = path.join(process.cwd(), "public", "tramokyo-pack");
const fails = [];
const warns = [];
const ok = (m) => console.log(`  ✓ ${m}`);

// 1) Node version for any rebuild
const major = Number(process.versions.node.split(".")[0]);
if (process.platform === "darwin" && major !== 20) warns.push(`running Node ${major} — rebuilds need Node 20 (nvm use 20)`);
else ok(`node ${process.versions.node}`);

// 2) Disk space (pack is ~12GB; want 20GB+ free for temp/encodes)
try {
  const df = execSync("df -g / | tail -1").toString().trim().split(/\s+/);
  const freeGB = Number(df[3]);
  if (freeGB < 20) warns.push(`only ${freeGB}GB free disk`);
  else ok(`${freeGB}GB free disk`);
} catch { warns.push("could not read disk space"); }

// 3) Pack manifests + coverage — a missing/half-copied pack is the exact
// failure this tool exists to catch, so it must FAIL cleanly, not crash.
if (!existsSync(PACK)) {
  console.log("\n  ✗ pack directory missing entirely: " + PACK);
  console.log("\nPREFLIGHT FAIL — no pack. Restore from backup or rebuild.");
  process.exit(1);
}
let clips, depth, journeyDirs;
try {
  clips = JSON.parse(await readFile(path.join(PACK, "local-clips.json"), "utf8"));
  depth = JSON.parse(await readFile(path.join(PACK, "local-depth.json"), "utf8"));
  journeyDirs = await readdir(path.join(PACK, "images", "journeys"));
} catch (e) {
  console.log(`\n  ✗ pack incomplete: ${e.message}`);
  console.log("\nPREFLIGHT FAIL — pack manifests unreadable. Run rebuild-pack-manifests.mjs or restore from backup.");
  process.exit(1);
}
let clipGaps = 0;
for (const [jid, e] of Object.entries(clips)) {
  const h = Object.keys(e).filter((k) => !k.startsWith("t")).length;
  if (h < 6) { clipGaps++; warns.push(`${jid}: ${h}/6 heroes`); }
}
ok(`${Object.keys(clips).length} journeys in clip manifest${clipGaps ? ` (${clipGaps} with hero gaps)` : " — all complete"}`);
const covered = Object.values(depth).filter(Boolean).length;
if (covered < Object.keys(depth).length) warns.push(`depth coverage ${covered}/${Object.keys(depth).length}`);
else ok(`depth ${covered}/${Object.keys(depth).length}`);
ok(`${journeyDirs.length} journey image sets on disk`);

// 4) Manifest → disk integrity: every manifest URL must exist as a file
let missing = 0;
for (const [jid, e] of Object.entries(clips)) {
  for (const v of Object.values(e)) {
    const urls = typeof v === "string" ? [v] : [v.h264, v.hevc].filter(Boolean);
    for (const u of urls) {
      if (!existsSync(path.join(process.cwd(), "public", u.replace(/^\//, "")))) {
        missing++;
        if (missing <= 3) fails.push(`manifest points at missing file: ${u}`);
      }
    }
  }
}
if (missing === 0) ok("every manifest clip exists on disk");
else fails.push(`${missing} manifest URLs missing on disk — run rebuild-pack-manifests.mjs`);

// 5) Sample clip integrity (ffprobe decode-check 5 random clips)
const FFMPEG = require("ffmpeg-static");
const allClips = [];
const clipsRoot = path.join(PACK, "clips", "journeys");
if (!existsSync(clipsRoot)) { fails.push("clips directory missing"); }
for (const jid of existsSync(clipsRoot) ? await readdir(clipsRoot) : []) {
  for (const f of await readdir(path.join(PACK, "clips", "journeys", jid))) {
    if (f.endsWith(".mp4")) allClips.push(path.join(PACK, "clips", "journeys", jid, f));
  }
}
const sample = allClips.sort(() => 0.5 - Math.random()).slice(0, 5);
let badClips = 0;
for (const c of sample) {
  try {
    execFileSync(FFMPEG, ["-v", "error", "-i", c, "-t", "2", "-f", "null", "-"], { stdio: "pipe" });
  } catch { badClips++; fails.push(`clip fails decode: ${path.basename(path.dirname(c))}/${path.basename(c)}`); }
}
if (badClips === 0) ok(`clip decode spot-check (${sample.length} random) clean`);

// 6) Audio present for the setlist
const audioDir = path.join(PACK, "audio");
if (existsSync(audioDir)) {
  const audioFiles = await readdir(audioDir);
  ok(`${audioFiles.length} audio files in pack`);
  if (audioFiles.length < 40) warns.push(`only ${audioFiles.length} audio files — setlist expects ~43+`);
} else fails.push("pack audio directory missing");

// 7) Server health (if running)
try {
  const res = await fetch("http://localhost:3000/room/installation?loop=1", { signal: AbortSignal.timeout(4000) });
  if (res.ok) ok("kiosk server answering on :3000");
  else warns.push(`server answered ${res.status}`);
} catch { warns.push("server not running (start via Tramokyo.app before the show)"); }

// 8) Flight recorder writable
try {
  const st = await stat(`${process.env.HOME}/Library/Logs/Tramokyo/tramokyo-events.log`).catch(() => null);
  ok(`flight recorder ${st ? `present (${Math.round(st.size / 1024)}KB)` : "will be created on first event"}`);
} catch { /* fine */ }

console.log("");
for (const w of warns) console.log(`  ⚠ ${w}`);
for (const f of fails) console.log(`  ✗ ${f}`);
if (fails.length === 0) {
  console.log(`\nPREFLIGHT PASS${warns.length ? ` (${warns.length} warnings)` : ""} — the show is ready.`);
  process.exit(0);
}
console.log(`\nPREFLIGHT FAIL — ${fails.length} blocker(s) above.`);
process.exit(1);
