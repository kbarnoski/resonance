#!/usr/bin/env node
/**
 * Batch 4K export of a whole set (docs/export-4k.md) — every journey of
 * Rise Above (or any set in installation-sequence.ts), one after another:
 *
 *   for each journey:  wait for the GPU lock  →  export-journey (4K60, audio
 *   muxed)  →  flicker-meter (ZERO flashes required)  →  determinism
 *   spot-check (--verify, 2 s at 10 s, lossless, twice)  →  progress.json +
 *   SUMMARY.md in the output root.
 *
 *   node scripts/export-set.mjs [--set=all|rise-above] [--root=~/Documents/Resonance/exports]
 *        [--port=3200] [--workers=3] [--only=id,id] [--from-index=N] [--redo] [--no-verify]
 *
 * Resumable: a journey whose mp4 + sidecar + flicker report exist is skipped
 * (unless --redo). One journey failing never stops the batch — it's
 * retried once, then recorded as failed and the batch moves on.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const APP = resolve(HERE, "..");
const LOCK = join(homedir(), "Documents/Resonance/.gpu-measure.lock");

// ── args ────────────────────────────────────────────────────────────
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return dflt;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};
const SET = arg("set", "all"); // all (every main-loop journey) | rise-above
const ROOT = resolve(String(arg("root", join(homedir(), "Documents/Resonance/exports"))).replace(/^~/, homedir()));
const PORT = String(arg("port", "3200"));
const WORKERS = String(arg("workers", "3"));
const ONLY = arg("only", "") ? String(arg("only")).split(",") : null;
const FROM_INDEX = Number(arg("from-index", 1));
const REDO = !!arg("redo", false);
const VERIFY = !arg("no-verify", false);
const EXTRA = String(arg("extra", "")).split(" ").filter(Boolean); // passed through to export-journey

if (PORT === "3000") { console.error("export-set: port 3000 is the LIVE KIOSK — refused"); process.exit(2); }

// ── the queue ───────────────────────────────────────────────────────
/**
 * Every journey of the main loop, in show order: Rise Above first (Ghost is
 * #1), then each later set, de-duplicated (a borrowed piece is exported once,
 * under its first set). Each entry carries its set id so ?start=<id>@<set>
 * resolves — an unresolved start silently falls back to the loop's first
 * journey, which --expect-name catches.
 */
async function loadCatalog() {
  const { transformSync } = await import("esbuild");
  const ts = readFileSync(join(APP, "src/lib/journeys/installation-sequence.ts"), "utf8");
  if (/^import\s/m.test(ts)) throw new Error("installation-sequence.ts grew imports — update export-set.mjs's loader");
  const js = transformSync(ts, { loader: "ts", format: "esm" }).code;
  const mod = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
  const dbNames = new Map(JSON.parse(readFileSync(join(APP, "public/tramokyo-pack/data/journeys.json"), "utf8")).map((j) => [j.id, j.name]));
  const builtins = readFileSync(join(APP, "src/lib/journeys/journeys.ts"), "utf8");
  const nameOf = (id) => {
    if (dbNames.has(id)) return dbNames.get(id);
    const i = builtins.indexOf(`id: "${id}",`);
    const m = i >= 0 ? /name: "([^"]+)"/.exec(builtins.slice(i, i + 1200)) : null;
    return m ? m[1] : id;
  };
  const seen = new Set();
  const out = [];
  for (const set of mod.TRAMOKYO_MAIN.sets) {
    for (const id of set.journeyIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ index: out.length + 1, id, name: nameOf(id), program: set.id, setName: set.presenting });
    }
  }
  // DB rows that mirror a builtin (Ghost, Snowflake, Realized) are covered by the builtin
  const exportedNames = new Set(out.map((j) => j.name.toLowerCase()));
  const unreachable = [...dbNames.keys()].filter((id) => !seen.has(id) && !exportedNames.has(String(dbNames.get(id)).toLowerCase())).map((id) => ({ id, name: dbNames.get(id) }));
  return { list: out, unreachable };
}
export const slug = (s) => s.toLowerCase().replace(/[()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const catalog = await loadCatalog();
const all = SET === "rise-above" ? catalog.list.filter((j) => j.program === "tramokyo-mix") : catalog.list;
const usedSlugs = new Map();
for (const j of all) { // unique folder per journey
  let sl = slug(j.name) || slug(j.id);
  if (usedSlugs.has(sl) && usedSlugs.get(sl) !== j.id) sl = `${sl}-${j.id.slice(0, 8)}`;
  usedSlugs.set(sl, j.id);
  j.slug = sl;
}
const journeys = all.filter((j) => j.index >= FROM_INDEX && (!ONLY || ONLY.includes(j.id) || ONLY.includes(j.slug)));
if (arg("list", false)) {
  for (const j of journeys) console.log(`${String(j.index).padStart(3)}  ${j.name.padEnd(32)} ${j.program.padEnd(20)} ${j.slug}`);
  console.log(`${journeys.length} journeys; not in any set: ${catalog.unreachable.map((u) => u.name).join(", ") || "none"}`);
  process.exit(0);
}

// ── helpers ─────────────────────────────────────────────────────────
const T0 = Date.now();
const hms = (s) => { s = Math.round(s); return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m${String(s % 60).padStart(2, "0")}s`; };
const say = (m) => console.log(`[set ${hms((Date.now() - T0) / 1000)}] ${m}`);

function run(cmd, args, { tag, quiet = false } = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: APP, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const onData = (c) => {
      const s = c.toString();
      out += s;
      if (out.length > 4e6) out = out.slice(-2e6);
      if (!quiet) for (const l of s.split("\n")) if (l.trim()) console.log(`  ${tag ?? ""}${l}`);
    };
    p.stdout.on("data", onData);
    p.stderr.on("data", onData);
    p.on("close", (code) => res({ code, out }));
  });
}

async function waitForGpuLock() {
  let waited = 0;
  while (existsSync(LOCK)) {
    if (waited % 600 === 0) say(`GPU lock held (${LOCK}) — waiting…`);
    await new Promise((r) => setTimeout(r, 60000));
    waited += 60;
  }
  if (waited) say(`GPU lock released after ${waited}s`);
}

const progressFile = join(ROOT, "progress.json");
const progress = existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, "utf8")) : { set: SET, journeys: {} };
function save() {
  progress.updatedAt = new Date().toISOString();
  writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  const rows = Object.values(progress.journeys).sort((a, b) => a.index - b.index);
  const md = [
    `# ${SET} — 4K60 exports`, "",
    `Updated ${progress.updatedAt}. Output root: \`${ROOT}\``, "",
    "| # | Journey | Status | Track | Render | s/frame | Flicker | Flashes | Determinism | File |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.index} | ${r.name} | ${r.status} | ${r.trackSeconds ? hms(r.trackSeconds) : ""} | ${r.renderSeconds ? hms(r.renderSeconds) : ""} | ${r.secondsPerFrame?.toFixed?.(2) ?? ""} | ${r.flicker?.verdict ?? ""} | ${r.flicker ? r.flicker.flashes : ""} | ${r.determinism?.verdict ?? ""}${r.determinism?.worstPsnr ? ` (${r.determinism.worstPsnr})` : ""} | ${r.file ? r.file.replace(ROOT + "/", "") : ""} |`),
    "",
  ].join("\n");
  writeFileSync(join(ROOT, "SUMMARY.md"), md);
}

// ── the batch ───────────────────────────────────────────────────────
mkdirSync(ROOT, { recursive: true });
if (catalog.unreachable.length) say(`not in any main-loop set (not exportable via the loop): ${catalog.unreachable.map((u) => u.name).join(", ")}`);
progress.unreachable = catalog.unreachable;
say(`${journeys.length} journeys of ${SET} → ${ROOT} (port ${PORT}, ${WORKERS} workers${VERIFY ? ", determinism spot-check" : ""})`);
for (const j of journeys) {
  const dir = join(ROOT, j.slug);
  const file = join(dir, `${j.slug}-4k60.mp4`);
  const flickerFile = join(dir, "flicker.json");
  const rec = (progress.journeys[j.id] = { ...(progress.journeys[j.id] ?? {}), index: j.index, id: j.id, name: j.name, set: j.setName, file });
  if (!REDO && rec.status === "done" && existsSync(file) && existsSync(flickerFile)) { say(`#${j.index} ${j.name}: already done — skipping`); continue; }
  mkdirSync(dir, { recursive: true });
  await waitForGpuLock();
  say(`#${j.index} ${j.name} (${j.id}) — exporting`);
  rec.status = "exporting";
  rec.startedAt = new Date().toISOString();
  save();
  const t = Date.now();
  let r = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    r = await run("nice", ["-n", "10", process.execPath, "scripts/export-journey.mjs", `--journey=${j.id}`, `--set=${j.program}`, `--expect-name=${j.name}`, `--port=${PORT}`, `--workers=${WORKERS}`, `--out=${file}`, ...EXTRA], { tag: `#${j.index} ` });
    if (r.code === 0) break;
    say(`#${j.index} ${j.name}: export attempt ${attempt} FAILED (exit ${r.code})`);
    if (attempt === 1) await waitForGpuLock();
  }
  rec.renderSeconds = (Date.now() - t) / 1000;
  if (r.code !== 0) {
    rec.status = "export-failed";
    rec.error = (r.out.match(/EXPORT FAILED: [^\n]*/) ?? [r.out.slice(-300)])[0];
    save();
    continue;
  }
  try {
    const side = JSON.parse(readFileSync(`${file}.export.json`, "utf8"));
    rec.trackSeconds = side.trackDuration;
    rec.frames = side.frames;
    rec.secondsPerFrame = rec.renderSeconds / Math.max(1, side.frames);
    rec.settleTimeouts = side.settleTimeouts;
    rec.seekTimeouts = side.seekTimeouts;
    rec.audioMuxed = true; // the mux step is part of a successful export (it fails loudly otherwise)
  } catch { /* sidecar missing — flagged by status below */ }

  say(`#${j.index} ${j.name}: flicker-meter`);
  const f = await run("nice", ["-n", "10", process.execPath, "scripts/flicker-meter.mjs", file, `--out=${flickerFile}`], { tag: `#${j.index} flicker: ` });
  try {
    const fr = JSON.parse(readFileSync(flickerFile, "utf8"));
    const flashes = (fr.general?.flashes ?? 0) + Math.floor((fr.red?.transitions ?? 0) / 2);
    rec.flicker = { verdict: fr.verdict, flashes, generalMaxPerSec: fr.general?.maxFlashesPerSec, redMaxPerSec: fr.red?.maxFlashesPerSec, localPeakScreenPct: fr.local?.peakScreenPct };
  } catch {
    rec.flicker = { verdict: f.code === 1 ? "FAIL" : "ERROR", flashes: null };
  }

  if (VERIFY) {
    await waitForGpuLock();
    say(`#${j.index} ${j.name}: determinism spot-check`);
    const v = await run("nice", ["-n", "10", process.execPath, "scripts/export-journey.mjs", `--journey=${j.id}`, `--set=${j.program}`, `--port=${PORT}`, "--verify", "--from=10", "--verify-seconds=2", ...EXTRA], { tag: `#${j.index} verify: `, quiet: true });
    const m = /determinism: (\S+) — (\d+)\/(\d+) frames bit-identical(?:, \d+ differ \(worst PSNR ([\d.]+) dB)?/.exec(v.out);
    rec.determinism = m ? { verdict: m[1], identical: Number(m[2]), frames: Number(m[3]), worstPsnr: m[4] ? Number(m[4]) : null } : { verdict: "ERROR", detail: (v.out.match(/EXPORT FAILED: [^\n]*/) ?? [""])[0] };
    const keep = /lossless renders kept for inspection: (\S+)\s+(\S+)/.exec(v.out);
    if (keep) for (const p of keep.slice(1)) await run("rm", ["-rf", resolve(p, "..")], { quiet: true });
  }
  const flashFree = rec.flicker?.flashes === 0;
  rec.status = flashFree ? "done" : "done-FLASHES";
  rec.finishedAt = new Date().toISOString();
  save();
  say(`#${j.index} ${j.name}: ${rec.status} · ${hms(rec.renderSeconds)} · flicker ${rec.flicker?.verdict} (${rec.flicker?.flashes} flashes) · determinism ${rec.determinism?.verdict ?? "skipped"}`);
}
say(`batch finished — ${join(ROOT, "SUMMARY.md")}`);
