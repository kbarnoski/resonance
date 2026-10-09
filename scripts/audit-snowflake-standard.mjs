#!/usr/bin/env node
// audit-snowflake-standard.mjs — score every non-mastered kiosk-loop
// journey against the Journey Archetype (docs/journey-archetype.md;
// formerly the Snowflake Standard).
//
// Karel 2026-10-05: "im really expecting incredible journeys that are
// following the design and arc definition that snowflake has with micro
// and macro and a POV journey more like a music video than a slide show
// of photos. also a lot of the shaders stick around for the whole
// journey ... as if youre moving through them not watching wallpaper."
//
// Six lenses (L = literalness, Karel 2026-10-05: "visionary and surreal ... not literal"), each measured from the thing the kiosk actually plays:
//   S  SHOT LIST   — phases[].aiPromptSequence as the pack serves it
//                    (public/tramokyo-pack/data/journeys.json; built-ins
//                    from journeys.ts): distinct shots, scale registers,
//                    micro<->macro alternation, place-noun lock, cosmic
//                    escape, camera language, sparse opening.
//   H  SHADERS     — the REAL JourneyEngine (journey-engine.ts via jiti,
//                    clock stubbed) run over the track's real duration:
//                    distinct shaders, each shader's on-screen share and
//                    longest continuous presence across all three layers,
//                    layer load. Same code path as the kiosk (casts,
//                    kinetic lock, stillness, sparse interlude), minus
//                    morph quiet windows.
//   P  STILLS      — the pack images (sharp, 64px): near-duplicate
//                    clusters (dHash), centred-subject share, negative
//                    space, background polarity. The slideshow detector.
//   M  MOTION      — travel-morph slots in local-clips.json vs phase
//                    boundaries (heroes are disabled app-wide).
//   C  CADENCE     — the latest flight-recorder run per journey
//                    (docs/glitch-events.jsonl): distinct stills/min,
//                    repeats, morphs played, primary switches/min.
//
// Snowflake (first-snow) is scored as the reference row (its scripted
// take is replayed exactly) and is never a target.
//
// Usage: node scripts/audit-snowflake-standard.mjs [--json=out.json] [--md=out.md] [--only=<id,...>] [--no-images] [--stage=<overlay.json>]
// --stage: score STAGED work before it is installed — a JSON overlay
//   { journeys: { <id>: { phases, theme? } }, images: { <id>: [absolute paths] } }
//   replaces those journeys' pack phases / still lists in memory only.
// Node 20 (repo .nvmrc). Read-only: touches no pack/DB/source file.
import { createJiti } from "jiti";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const ONLY = arg("only")?.split(",");
const NO_IMAGES = process.argv.includes("--no-images");

// ── stub the clock BEFORE the engine loads (it reads performance.now) ──
let CLOCK = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => CLOCK }, configurable: true, writable: true });
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT + "src" } });
const J = await jiti.import("../src/lib/journeys/journeys.ts");
const ENG = await jiti.import("../src/lib/journeys/journey-engine.ts");
const SEQ = await jiti.import("../src/lib/journeys/installation-sequence.ts");
const TAKES = await jiti.import("../src/lib/journeys/pinned-takes.ts");
const KIN = await jiti.import("../src/lib/journeys/kinetic.ts");
const { MASTERED_JOURNEYS } = await jiti.import("../src/lib/journeys/mastered.ts");

const PACK = ROOT + "public/tramokyo-pack/";
const rows = JSON.parse(readFileSync(PACK + "data/journeys.json", "utf8"));
const recs = JSON.parse(readFileSync(PACK + "data/recordings.json", "utf8"));
const featured = JSON.parse(readFileSync(ROOT + "scripts/featured-recast.json", "utf8"));
const images = JSON.parse(readFileSync(PACK + "local-images.json", "utf8"));
const clips = JSON.parse(readFileSync(PACK + "local-clips.json", "utf8"));
const STAGE = arg("stage") ? JSON.parse(readFileSync(arg("stage"), "utf8")) : null;
for (const [id, o] of Object.entries(STAGE?.journeys ?? {})) { const r = rows.find((x) => x.id === id); if (r) { r.phases = o.phases; if (o.theme) r.theme = { ...(r.theme ?? {}), ...o.theme }; } }
for (const [id, list] of Object.entries(STAGE?.images ?? {})) images[id] = list;
const rowById = new Map(rows.map((r) => [r.id, r]));
const durByRec = new Map(recs.map((r) => [r.id, Number(r.duration) || 0]));
const durFeatured = new Map(featured.journeys.map((j) => [j.id, j.dur]));
const BUILTIN_DUR = { "first-snow": 178, "inferno": 242, "ghost": 219 };

import { STD, auditShots } from "./lib/snowflake-standard.mjs";

// ── real engine simulation ──
function simulate(journey, dur, script, seed = 20261005) {
  const eng = ENG.getJourneyEngine();
  CLOCK = 1000;
  eng.start(journey, { seed, trackDuration: dur, script });
  const step = 0.5;
  const on = new Map(); // mode -> seconds on screen
  const runs = new Map(); // mode -> longest continuous seconds
  const cur = new Map(); // mode -> current continuous seconds
  let layerSum = 0, n = 0, primarySwitches = 0, lastP = null;
  for (let s = 0; s <= dur; s += step) {
    CLOCK = 1000 + s * 1000;
    const f = eng.getFrame(s / dur);
    if (!f) continue;
    const live = new Set([f.shaderMode, f.dualShaderMode, f.tertiaryShaderMode].filter(Boolean));
    if (f.shaderMode !== lastP) { if (lastP !== null) primarySwitches++; lastP = f.shaderMode; }
    layerSum += live.size; n++;
    for (const m of live) { on.set(m, (on.get(m) ?? 0) + step); cur.set(m, (cur.get(m) ?? 0) + step); runs.set(m, Math.max(runs.get(m) ?? 0, cur.get(m))); }
    for (const m of [...cur.keys()]) if (!live.has(m)) cur.delete(m);
  }
  eng.stop();
  const share = [...on].map(([m, sec]) => ({ m, share: sec / dur, run: (runs.get(m) ?? 0) / dur })).sort((a, b) => b.share - a.share);
  return { distinct: share.length, top: share.slice(0, 4), meanLayers: layerSum / Math.max(1, n), primarySwitchesPerMin: primarySwitches / (dur / 60) };
}

// ── pack stills ──
async function stillStats(urlsRaw) {
  const urls = [...new Set(urlsRaw)];
  const stats = [];
  for (const u of urls) {
    const f = u.startsWith("/tramokyo-pack/") ? PACK + u.replace(/^\/tramokyo-pack\//, "") : u; // staged overlays pass absolute paths
    if (!existsSync(f)) continue;
    try {
      const { data, info } = await sharp(f).greyscale().resize(64, 64, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
      const W = info.width, H = info.height;
      let sum = 0, dark = 0, mx = 0, my = 0, mw = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = data[y * W + x] / 255; sum += v; if (v < 0.09) dark++;
        const w = Math.max(0, v - 0.15); mx += x * w; my += y * w; mw += w;
      }
      const mean = sum / (W * H);
      const cx = mw ? mx / mw / W - 0.5 : 0, cy = mw ? my / mw / H - 0.5 : 0;
      // 16px zero-mean unit vector — near-duplicates correlate ≥0.85
      const t = [...(await sharp(f).greyscale().resize(16, 16, { fit: "fill" }).raw().toBuffer())];
      const m = t.reduce((a, b) => a + b, 0) / t.length; const c = t.map((x) => x - m); const nrm = Math.hypot(...c) || 1;
      stats.push({ u, mean, dark: dark / (W * H), off: Math.hypot(cx, cy), white: mean > 0.55, vec: c.map((x) => x / nrm) });
    } catch { /* unreadable mid-write — skip */ }
  }
  const corr = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; return s; };
  let dups = 0;
  for (let i = 0; i < stats.length; i++) if (stats.some((s, j) => j !== i && corr(s.vec, stats[i].vec) >= 0.85)) dups++;
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  return {
    n: stats.length,
    listed: urlsRaw.length,
    dupRate: stats.length ? dups / stats.length : 0,
    centred: stats.length ? stats.filter((s) => s.off < 0.06).length / stats.length : 0,
    negSpace: med(stats.map((s) => s.dark)),
    white: stats.filter((s) => s.white).length,
  };
}

// ── flight recorder: latest run per journey ──
function flightRuns() {
  const lines = readFileSync(ROOT + "docs/glitch-events.jsonl", "utf8").split("\n");
  const sess = new Map(); const runs = [];
  // Shader presence across all three layers, reconstructed from the
  // switch events (primary/dual hold until replaced; tertiary on/off).
  const tick = (r, t) => { for (const m of Object.values(r.layer)) if (m) r.pres[m] = (r.pres[m] ?? 0) + (t - r.last); r.last = t; };
  for (const l of lines) {
    if (!l.trim()) continue; let e; try { e = JSON.parse(l); } catch { continue; }
    let s = sess.get(e.session); if (!s) { s = { run: null }; sess.set(e.session, s); }
    const open = (id) => { if (s.run) tick(s.run, e.t); s.run = { journey: id, t0: e.t, t1: e.t, last: e.t, stills: [], clips: 0, prim: 0, layer: { p: null, d: null, t: null }, pres: {} }; runs.push(s.run); };
    if (e.type === "take-seed") { open((e.detail ?? "").split(" ")[0]); continue; }
    if (e.type === "journey-change") { const to = (e.detail ?? "").split("->")[1]?.trim(); if (to && s.run?.journey !== to) open(to); continue; }
    if (!s.run) continue;
    const r = s.run;
    if (e.t - r.t1 > 120000) { r.dead = true; } // idle/paused session tail — not a played run
    if (r.dead) continue;
    r.t1 = e.t;
    const m = (e.detail ?? "").split(" ")[0];
    if (e.type === "still") r.stills.push(e.detail);
    else if (e.type === "clip") r.clips++;
    else if (/^shader-/.test(e.type)) {
      tick(r, e.t);
      if (e.type === "shader-initial" || e.type === "shader-primary") { r.layer.p = m; if (e.type === "shader-primary") r.prim++; }
      else if (e.type === "shader-dual") r.layer.d = m;
      else if (e.type === "shader-tertiary-on") r.layer.t = m;
      else if (e.type === "shader-tertiary-off") r.layer.t = null;
    }
  }
  const latest = new Map();
  for (const r of runs) {
    tick(r, r.t1);
    const ms = r.t1 - r.t0, min = ms / 60000;
    if (min < 1) continue; // fragment
    const top = Object.entries(r.pres).sort((a, b) => b[1] - a[1])[0];
    latest.set(r.journey, { min, distinct: new Set(r.stills).size, pushes: r.stills.length, repeats: r.stills.length - new Set(r.stills).size, clips: r.clips, prim: r.prim, shaders: Object.keys(r.pres).length, topShader: top?.[0] ?? null, topPresence: top ? top[1] / ms : 0 });
  }
  return latest;
}

// ══════════════════════ targets ══════════════════════
const loop = [...SEQ.TRAMOKYO_SETLIST].filter((id) => !SEQ.TRAMOKYO_EXCLUDED_JOURNEYS.has(id));
// TRAMOKYO_SETS was replaced by TRAMOKYO_MAIN.sets (2026-10-09 loop order);
// the loop is the non-borrowed sets concatenated (= TRAMOKYO_SETLIST).
const SET_ENDS = (() => { let end = 0; return SEQ.TRAMOKYO_MAIN.sets.filter((s) => !s.borrows).map((s) => ({ presenting: s.presenting, end: (end += s.journeyIds.length) })); })();
const setOf = (idx) => SET_ENDS.find((s) => idx < s.end)?.presenting ?? "?";
function journeyFor(id) {
  const b = J.JOURNEYS.find((j) => j.id === id);
  if (b) return { journey: b, dur: BUILTIN_DUR[id] ?? durFeatured.get(id) ?? 240, builtin: true };
  const r = rowById.get(id);
  if (!r) return null;
  const journey = { id: r.id, name: r.name, realmId: r.realm_id, phases: r.phases, ...(r.theme ?? {}) };
  return { journey, dur: durByRec.get(r.recording_id) || durFeatured.get(id) || 200, builtin: false };
}

const flights = flightRuns();
const targets = ["first-snow", ...loop.filter((id) => {
  const jf = journeyFor(id);
  return jf && !MASTERED_JOURNEYS.has(id) && !(KIN.isKineticJourneyName(jf.journey.name) && !KIN.isExpansionKineticName(jf.journey.name));
})].filter((id) => !ONLY || ONLY.includes(id) || id === "first-snow");

const results = [];
for (const id of targets) {
  const { journey, dur } = journeyFor(id);
  const idx = loop.indexOf(id);
  const S = auditShots(journey.phases);
  const H = simulate(journey, dur, TAKES.SCRIPTED_TAKES[id], typeof TAKES.PINNED_TAKES[id] === "number" ? TAKES.PINNED_TAKES[id] : 20261005);
  const P = NO_IMAGES ? null : await stillStats(images[id] ?? []);
  const c = clips[id] ?? {};
  const boundaries = Math.max(1, journey.phases.length - 1);
  const morphSlots = Object.keys(c).filter((k) => /^t\d$/.test(k)).length;
  const F = flights.get(id) ?? null;
  const lead = KIN.isExpansionKineticName(journey.name) ? (H.top[0]?.m ?? null) : null;
  const nonLead = H.top.filter((t) => t.m !== lead);
  const ref = id === "first-snow"; // hand-curated pack: its shot list IS its stills, not phase prompts
  const checks = {
    L1: ref ? null : S.literal <= STD.L1_literal,
    S1: ref ? null : S.distinct >= STD.S1_distinctShots,
    S2: ref ? null : S.registers.length >= STD.S2_registers,
    S3: ref ? null : S.alternation >= STD.S3_alternation,
    S4: ref ? null : S.placeLock.phases <= STD.S4_placeLock,
    S5: ref ? null : S.cosmic >= STD.S5_cosmic,
    S6: ref ? null : S.camera >= STD.S6_camera,
    S7: ref ? null : S.sparseOpen >= STD.S7_sparseOpen,
    H1: H.distinct >= STD.H1_distinct,
    H2: (nonLead[0]?.share ?? 0) <= STD.H2_maxShare && (!lead || H.top[0].share <= STD.H3_leadShare),
    H4: Math.max(...H.top.map((t) => t.run)) <= STD.H4_maxRun,
    // H5 for non-kinetic journeys; kinetic ones (all but Snowflake + Ghost,
    // Karel 2026-10-09) are judged by H5k — kinetic is activation, its
    // always-on dual + tertiary windows are the design, not a failure.
    H5: H.meanLayers <= (KIN.isFullKineticJourney(journey) ? STD.H5k_layers : STD.H5_layers),
    P1: P ? P.dupRate <= STD.P1_dupRate : null,
    P2: P ? P.centred <= STD.P2_centred : null,
    P3: P ? P.negSpace >= STD.P3_negSpace : null,
    M1: morphSlots / boundaries >= STD.M1_morphCover,
    C1: F ? F.distinct / F.min >= STD.C1_stillsPerMin : null,
    C2: F ? (F.pushes ? F.repeats / F.pushes : 0) <= STD.C2_repeatRate : null,
    C3: F && F.shaders ? F.topPresence <= STD.C3_presence : null,
  };
  const scored = Object.values(checks).filter((v) => v !== null);
  results.push({
    id, name: journey.name, set: id === "first-snow" ? "REFERENCE" : setOf(idx), pos: idx + 1, dur: Math.round(dur),
    score: scored.filter(Boolean).length, of: scored.length,
    S, H, P, M: { morphSlots, boundaries }, F, checks,
  });
  process.stderr.write(`· ${journey.name}\n`);
}

// ══════════════════════ report ══════════════════════
const pct = (x) => `${Math.round(x * 100)}%`;
const lines = [];
lines.push(`# Snowflake Standard scorecard — ${new Date().toISOString().slice(0, 16)}Z`, "");
lines.push(`${results.length - 1} non-mastered loop journeys vs the reference (first-snow). Checks per docs/journey-archetype.md (H5 = H5k on kinetic journeys); ✗ = fails.`, "");
lines.push("| # | Journey | Set | Score | Literal | Shots (distinct/total) | Registers · alt | Place lock | Shaders · top share · longest run · layers | Stills dup · centred · neg | Morphs | Measured stills/min · repeats · top shader presence | Fails |");
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const ordered = [results[0], ...results.slice(1).sort((a, b) => a.score / a.of - b.score / b.of || a.pos - b.pos)];
for (const r of ordered) {
  const fails = Object.entries(r.checks).filter(([, v]) => v === false).map(([k]) => k).join(" ");
  const top = r.H.top[0];
  lines.push(`| ${r.pos || "ref"} | ${r.name} | ${r.set} | ${r.score}/${r.of} | ${pct(r.S.literal)} | ${r.S.distinct}/${r.S.shots} | ${r.S.registers.length} · ${pct(r.S.alternation)} | ${r.S.placeLock.noun}×${r.S.placeLock.phases} | ${r.H.distinct} · ${top?.m} ${pct(top?.share ?? 0)} · ${pct(Math.max(...r.H.top.map((t) => t.run)))} · ${r.H.meanLayers.toFixed(1)} | ${r.P ? `${pct(r.P.dupRate)} · ${pct(r.P.centred)} · ${pct(r.P.negSpace)} (n${r.P.n})` : "-"} | ${r.M.morphSlots}/${r.M.boundaries} | ${r.F ? `${(r.F.distinct / r.F.min).toFixed(1)} · ${r.F.repeats} · ${r.F.topShader} ${pct(r.F.topPresence)}` : "no run"} | ${fails} |`);
}
const fails = {};
for (const r of results.slice(1)) for (const [k, v] of Object.entries(r.checks)) if (v === false) fails[k] = (fails[k] ?? 0) + 1;
lines.push("", "## Failure counts (of " + (results.length - 1) + ")", "", Object.entries(fails).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`).join("\n"));
const md = lines.join("\n");
if (arg("md")) writeFileSync(arg("md"), md + "\n");
if (arg("json")) writeFileSync(arg("json"), JSON.stringify(results, (k, v) => (typeof v === "bigint" ? undefined : v), 1));
console.log(md);
