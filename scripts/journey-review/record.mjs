#!/usr/bin/env node
/**
 * JOURNEY REVIEW — RECORDER (Karel 2026-10-07: "review every second of every
 * journey keeping a detailed log … then run it again and fix as needed and
 * repeat until you have measured with 100% quality the app is perfect").
 *
 * Plays journeys IN REAL TIME, start to end (title card + the handoff into the
 * next journey), in headless Chrome on the real GPU (`channel:"chrome"`,
 * `--use-angle=metal`, 1440×900 @ DPR 1 = the kiosk), against the production
 * server, and logs EVERY SECOND:
 *
 *   runs/<runId>/<journeyId>/timeline.jsonl  1 Hz: audio clock, fps/p95/max frame,
 *                                            long tasks, heap, particle diag,
 *                                            videos playing, kiosk status diag
 *   runs/<runId>/<journeyId>/events.jsonl    every flight-recorder event (glitchRecord)
 *   runs/<runId>/<journeyId>/frames/*.jpg    a 640 px frame every 2 s (+ frames.jsonl)
 *   runs/<runId>/<journeyId>/summary.json    + DONE marker when the journey is complete
 *   runs/<runId>/run.json                    args, build, task plan, timings
 *
 * SAFETY (the kiosk shares this server): /api/pack/remote is answered locally
 * (a review page must never post kiosk status or receive Karel's commands),
 * the glitch-log / pack-log / heartbeat uploads are captured and NOT forwarded
 * (the real kiosk's docs/glitch-events.jsonl stays clean). Never touches the
 * kiosk Chrome profile.
 *
 * Usage:
 *   node scripts/journey-review/record.mjs --journeys ghost,first-snow
 *   node scripts/journey-review/record.mjs --all [--parallel 4]
 *   node scripts/journey-review/record.mjs --only-failed <runId> [--parallel 4]
 *   node scripts/journey-review/record.mjs --perf --journeys ghost      (clean timing)
 * Options: --dry-run (print the plan only)  --run <id>  --tail <s> (default 20)  --frames-every <s> (default 2;
 *          --perf default 10)  --base <url>  --headed
 * Then:   node scripts/journey-review/check.mjs <runId> [--watch]
 *
 * --parallel N: N independent browsers each play a contiguous slice of the
 * plan. Frame-timing numbers from N>1 are CONTENDED (summary.contended=true)
 * and check.mjs excludes them from timing verdicts; correctness checks stay
 * valid as long as audio advances 1 s/s (the recorder logs audio drift).
 * --perf: one journey at a time, one browser, sparse screenshots — the only
 * mode whose frame timing is a verdict.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "../..");
const argv = process.argv.slice(2);
const arg = (k, d = null) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const flag = (k) => argv.includes(k);

const BASE = arg("--base", process.env.BASE_URL || "http://localhost:3000");
const PERF = flag("--perf");
const PARALLEL = PERF ? 1 : Math.max(1, Number(arg("--parallel", "1")));
const TAIL = Number(arg("--tail", "20"));
const FRAME_EVERY = Number(arg("--frames-every", PERF ? "10" : "2"));
const RUN_ID = arg("--run", `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}${PERF ? "-perf" : ""}`);
const OUT = path.join(HERE, "runs", RUN_ID);
fs.mkdirSync(OUT, { recursive: true });

// durations (for planning + timeouts) from the generated deep-analysis profiles
const DUR = {};
{
  const s = fs.readFileSync(path.join(ROOT, "src/lib/journeys/particle-profiles.generated.ts"), "utf8");
  for (const m of s.matchAll(/^\s*"([^"]+)": \{"name":"([^"]+)".*?"duration":([0-9.]+)/gm)) DUR[m[1]] = { name: m[2], dur: +m[3] };
}

const LAUNCH_ARGS = [
  "--autoplay-policy=no-user-gesture-required",
  // Karel listens to the real kiosk while passes run: media still plays and
  // advances, output is silent
  "--mute-audio",
  "--use-angle=metal",
  "--force-color-profile=srgb",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
];

/** Routes that must never reach the kiosk server's shared state. */
async function guard(page, sink) {
  await page.route("**/api/pack/remote**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ commands: [] }) }).then(() => {
    // the kiosk status snapshot is great data — keep it, never forward it
    try { const b = r.request().postDataJSON(); if (b?.status) sink.status(b.status); } catch { /* GET */ }
  }));
  await page.route("**/api/review/glitch-log**", (r) => {
    try { const b = r.request().postDataJSON(); for (const e of b?.events ?? []) sink.event(e, "upload"); } catch { /* */ }
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/pack/log**", (r) => {
    try { sink.log(r.request().postDataJSON()); } catch { /* */ }
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/installation/heartbeat**", (r) => r.fulfill({ status: 200, body: "{}" }));
}

/** In-page collector: frame times, long tasks, glitch tap, media elements. */
function collector() {
  const rv = (window.__rv = { frames: [], longtasks: [], events: [], audios: [], videos: [] });
  const A = window.Audio;
  window.Audio = function (...a) { const el = new A(...a); rv.audios.push(el); return el; };
  window.Audio.prototype = A.prototype;
  const oc = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...r) {
    const el = oc.call(this, tag, ...r);
    const t = String(tag).toLowerCase();
    if (t === "audio") rv.audios.push(el);
    else if (t === "video") rv.videos.push(el);
    return el;
  };
  // the app's flight recorder (opt-in tap; falls back to upload interception)
  window.__resonanceGlitchTap = (e) => rv.events.push(e);
  let last = 0;
  const loop = (now) => { if (last) rv.frames.push([Math.round(now), +(now - last).toFixed(1)]); last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) rv.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ["longtask"] });
  } catch { /* */ }
  window.__rvDrain = () => {
    const a = rv.audios.filter((x) => x.duration > 5);
    const playing = a.find((x) => !x.paused) ?? a[a.length - 1] ?? null;
    const pl = window.__resonanceParticleLead;
    const vids = rv.videos.filter((v) => v.isConnected || !v.paused);
    const out = {
      now: Math.round(performance.now()),
      epoch: Math.round(performance.timeOrigin + performance.now()),
      audio: playing ? { ct: +playing.currentTime.toFixed(2), dur: +(playing.duration || 0).toFixed(1), paused: playing.paused, src: (playing.currentSrc || "").split("/").pop() } : null,
      frames: rv.frames.splice(0),
      longtasks: rv.longtasks.splice(0),
      events: rv.events.splice(0),
      videosPlaying: vids.filter((v) => !v.paused && !v.ended && v.currentTime > 0).map((v) => (v.currentSrc || "").split("/").slice(-2).join("/")),
      pl: pl ? {
        journeyId: pl.journeyId, t: pl.t, presence: pl.presence, veil: pl.veil, morph: pl.morph, window: pl.window,
        soul: pl.soul, transition: pl.transition, density: pl.density, dissolve: pl.dissolve, hue: pl.hue, sat: pl.sat,
        running: pl.running, fps: pl.fps, fpsLow: pl.fpsLow, count: pl.count, dpr: pl.dpr, tier: pl.tier,
        jumpScore: pl.jumpScore, maxSpeed: pl.maxSpeed, meanLum: pl.meanLum, maxLumStep: pl.maxLumStep, stale: Date.now() - (pl.stamp || 0),
      } : null,
      disabled: window.__resonanceParticlesDisabled ?? null,
      phaseLabel: window.__resonanceKioskPhaseLabel ?? null,
      programs: window.__rvProgramsSent ? undefined : (window.__rvProgramsSent = 1, window.__resonanceKioskPrograms ?? null),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      vis: document.visibilityState,
    };
    return out;
  };
}

const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

async function discoverPlan() {
  const b = await chromium.launch({ headless: true, channel: "chrome", args: LAUNCH_ARGS });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
  await guard(p, { status() {}, event() {}, log() {} });
  await p.goto(`${BASE}/room/installation?loop=1&kiosk=1`, { waitUntil: "domcontentloaded" });
  const progs = await p.waitForFunction(() => window.__resonanceKioskPrograms, undefined, { timeout: 60000 }).then((h) => h.jsonValue());
  await b.close();
  return progs;
}

async function buildCommit() {
  try { const r = await fetch(`${BASE}/api/version`); return (await r.json()).commit ?? null; } catch { return null; }
}

/** One browser plays `ids` (contiguous in loop order) from the first id onward. */
async function playSlice(slot, ids, log) {
  const browser = await chromium.launch({ headless: !flag("--headed"), channel: "chrome", args: LAUNCH_ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const seen = new Set();
  const first = ids[0];
  const lastId = ids[ids.length - 1];
  let leftLastAt = null;
  const state = { current: "_intro", order: [], journeys: {}, statuses: [], pending: [], switches: [{ t: -Infinity, to: "_intro", src: "start" }] };
  // WHICH JOURNEY IS ON SCREEN at page time t — events can arrive up to 20 s
  // late (upload interception on builds without the tap), so every event and
  // every row is filed by its OWN timestamp against this switch log.
  // Sources: the live particle diag journeyId (100 ms fresh) and the
  // authoritative journey-change events.
  const journeyAt = (t) => { let j = "_intro"; for (const sw of state.switches) if (sw.t <= t) j = sw.to; return j; };
  const addSwitch = (t, to, src) => {
    if (!to) return;
    const near = state.switches.find((sw) => sw.to === to && Math.abs(sw.t - t) < 5000);
    if (near) { if (src === "event") { near.t = t; near.src = "event"; state.switches.sort((a, b) => a.t - b.t); } return; }
    if (journeyAt(t) === to) return;
    const from = journeyAt(t);
    state.switches.push({ t, to, src });
    state.switches.sort((a, b) => a.t - b.t);
    dirOf(to);
    if (from === "_intro" && to !== first) state.startMismatch = to;
    if (from === lastId && to !== lastId) leftLastAt ??= Date.now();
  };
  // journeys OUTSIDE this slice (the loop intro, the handoff tail) get
  // slice-scoped dirs — another slice may be recording that journey for real
  const dirName = (jid) => (ids.includes(jid) ? jid : `${jid}~slice${slot}-${ids[0].slice(0, 8)}`);
  const dirOf = (jid) => {
    const d = path.join(OUT, dirName(jid));
    if (!state.journeys[jid]) {
      fs.mkdirSync(path.join(d, "frames"), { recursive: true });
      for (const f of ["timeline.jsonl", "events.jsonl", "frames.jsonl", "errors.jsonl"]) fs.writeFileSync(path.join(d, f), "");
      state.journeys[jid] = { id: jid, name: DUR[jid]?.name ?? jid, slot, startedWall: Date.now(), samples: 0, firstCt: null, lastCt: null, dur: null, frameMs: [], longtasks: 0, maxLongtask: 0, eventsN: 0, audioStallS: 0, driftMax: 0, screenshotWins: [] };
      state.order.push(jid);
    }
    return d;
  };
  const append = (jid, f, obj) => fs.appendFileSync(path.join(dirOf(jid), f), JSON.stringify(obj) + "\n");
  const withTimeout = (p, ms, what) => {
    let timer;
    return Promise.race([
      Promise.resolve(p).finally(() => clearTimeout(timer)),
      new Promise((r) => { timer = setTimeout(() => { log(`slot ${slot}: ${what} timed out after ${ms} ms`); r(null); }, ms); }),
    ]);
  };
  const onEvent = (e, via) => {
    const k = `${e.t}|${e.type}|${e.detail ?? ""}`;
    if (seen.has(k)) return;
    seen.add(k);
    state.pending.push({ ...e, via });
  };
  await guard(page, {
    status: (s) => state.statuses.push({ wall: Date.now(), s }),
    event: onEvent,
    log: (l) => append(state.current, "errors.jsonl", { wall: Date.now(), packLog: l }),
  });
  page.on("pageerror", (e) => append(state.current, "errors.jsonl", { wall: Date.now(), pageerror: String(e.message).slice(0, 400) }));
  page.on("response", (r) => { if (r.status() >= 400) append(state.current, "errors.jsonl", { wall: Date.now(), http: r.status(), url: r.url().replace(BASE, "") }); });
  page.on("requestfailed", (r) => { const f = r.failure()?.errorText ?? ""; if (!/ERR_ABORTED/.test(f)) append(state.current, "errors.jsonl", { wall: Date.now(), requestfailed: f, url: r.url().replace(BASE, "") }); });
  page.on("console", (m) => { if (m.type() === "error") append(state.current, "errors.jsonl", { wall: Date.now(), console: m.text().slice(0, 400) }); });
  await page.addInitScript(collector);

  const tGo = Date.now();
  await page.goto(`${BASE}/room/installation?loop=1&kiosk=1&start=${encodeURIComponent(first)}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const t0 = Date.now();
  log(`slot ${slot}: page loaded in ${t0 - tGo} ms`);
  const budgetS = ids.reduce((s, id) => s + (DUR[id]?.dur ?? 300), 0) + 120 + TAIL + 60 * ids.length;
  let lastFrameShot = 0;
  let prev = null; // previous sample (audio drift)
  let stallSince = null;

  const flushEvents = () => {
    state.pending.sort((a, b) => a.t - b.t);
    for (const e of state.pending) if (e.type === "journey-change") addSwitch(e.t, String(e.detail ?? "").split("->").pop().trim(), "event");
    for (const e of state.pending.splice(0)) {
      const j = journeyAt(e.t);
      dirOf(j);
      append(j, "events.jsonl", e);
      state.journeys[j].eventsN++;
      // the boundary event belongs to both sides
      if (e.type === "journey-change") { const from = journeyAt(e.t - 1); if (from !== j) { append(from, "events.jsonl", e); state.journeys[from].eventsN++; } }
    }
  };

  for (;;) {
    const tick = Date.now();
    let d;
    try {
      d = await Promise.race([page.evaluate(() => window.__rvDrain()), new Promise((r) => setTimeout(() => r(null), 8000))]);
    } catch (e) { log(`slot ${slot}: evaluate failed ${e.message}`); d = null; }
    if (!d) {
      append(state.current, "errors.jsonl", { wall: Date.now(), rig: "page unresponsive >8 s" });
    } else {
      if (d.programs) fs.writeFileSync(path.join(OUT, "programs.json"), JSON.stringify(d.programs, null, 1));
      if (d.pl?.journeyId && d.pl.stale < 1500) addSwitch(d.now - Math.min(d.pl.stale, 1000), d.pl.journeyId, "diag");
      for (const e of d.events) onEvent(e, "tap");
      flushEvents();
      const jid = journeyAt(d.now);
      state.current = jid;
      dirOf(jid);
      const J = state.journeys[jid];
      const dts = d.frames.map((f) => f[1]);
      const st = state.statuses.length ? state.statuses[state.statuses.length - 1].s : null;
      // audio drift: media clock advance vs wall advance since the last sample
      let drift = null;
      let row_disc = null;
      if (prev && d.audio && prev.audio && d.audio.src === prev.audio.src && !d.audio.paused) {
        const wall = (d.epoch - prev.epoch) / 1000;
        drift = +((d.audio.ct - prev.audio.ct) - wall).toFixed(2);
        // a jump of >5 s is a seek / track change (handoff), not clock drift —
        // logged as a discontinuity for the checker to judge by position
        if (Math.abs(drift) > 5) { row_disc = drift; drift = null; }
        else J.driftMax = Math.max(J.driftMax, Math.abs(drift));
        if (d.audio.ct - prev.audio.ct < 0.2) { stallSince ??= Date.now(); } else stallSince = null;
      }
      // the audio element is shared: rows right after a track ends can show the
      // NEXT track's clock before the switch registers — keep the max reached,
      // and only take dur from rows that agree with the journey's own track
      if (d.audio) {
        J.firstCt ??= d.audio.ct;
        J.src ??= d.audio.src;
        if (d.audio.src === J.src) { J.maxCt = Math.max(J.maxCt ?? 0, d.audio.ct); J.lastCt = d.audio.ct; J.dur = d.audio.dur; }
      }
      J.samples++;
      J.frameMs.push(...dts);
      J.longtasks += d.longtasks.length;
      for (const lt of d.longtasks) J.maxLongtask = Math.max(J.maxLongtask, lt[1]);
      const row = {
        wall: tick, t: +((tick - t0) / 1000).toFixed(1), now: d.now, epoch: d.epoch, journey: jid,
        ct: d.audio?.ct ?? null, dur: d.audio?.dur ?? null, paused: d.audio?.paused ?? null, src: d.audio?.src ?? null, drift, disc: row_disc,
        fps: dts.length ? +(1000 / (dts.reduce((a, b) => a + b, 0) / dts.length)).toFixed(1) : 0,
        p95: pct(dts, 95), maxFrame: dts.length ? Math.max(...dts) : null, nFrames: dts.length,
        longtasks: d.longtasks, heapMB: d.heapMB, vis: d.vis, videos: d.videosPlaying,
        pl: d.pl, disabled: d.disabled, phaseLabel: d.phaseLabel,
        kiosk: st ? { journey: st.journey, isPlaying: st.isPlaying, currentTime: st.currentTime, diag: st.diag } : null,
        frameTimes: d.frames, // [perfNow, dt] — check.mjs maps gaps to screenshots
      };
      append(jid, "timeline.jsonl", row);

      // frames every FRAME_EVERY s (screenshot windows recorded: their readback can cost frames)
      if (tick - lastFrameShot >= FRAME_EVERY * 1000 - 50) {
        lastFrameShot = tick;
        const s0 = Date.now();
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 70 });
          const s1 = Date.now();
          const name = `${String(Math.round((d.audio?.ct ?? 0) * 10)).padStart(5, "0")}_${String(Math.round((tick - t0) / 100)).padStart(6, "0")}.jpg`;
          await sharp(buf).resize(640).jpeg({ quality: 72 }).toFile(path.join(dirOf(jid), "frames", name));
          append(jid, "frames.jsonl", { file: `frames/${name}`, wall: tick, ct: d.audio?.ct ?? null, shotStart: s0, shotEnd: s1 });
          J.screenshotWins.push([s0, s1]);
        } catch (e) { append(jid, "errors.jsonl", { wall: Date.now(), rig: `screenshot ${e.message}` }); }
      }
      prev = d;
    }
    const el = (Date.now() - t0) / 1000;
    const stalled = stallSince && Date.now() - stallSince > 60000;
    if (state.startMismatch) {
      append(state.current, "errors.jsonl", { wall: Date.now(), rig: `start not honoured: asked ${first}, loop opened ${state.startMismatch} — slice aborted` });
      break;
    }
    if ((leftLastAt && Date.now() - leftLastAt > TAIL * 1000) || el > budgetS || stalled) {
      if (stalled) append(state.current, "errors.jsonl", { wall: Date.now(), rig: "audio stalled >60 s — slice aborted" });
      if (el > budgetS) append(state.current, "errors.jsonl", { wall: Date.now(), rig: `slice budget ${budgetS}s exceeded` });
      break;
    }
    const wait = 1000 - (Date.now() - tick);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  // final drain (tap builds lose nothing; on builds without the tap, the
  // journey-change hot flush already delivered every boundary). NO synthetic
  // pagehide — it wedged the page's main thread (the app tears down on it) and
  // hung every shutdown for 20 s. Every step bounded; the process is killed last.
  const tEnd = Date.now();
  try {
    const d = await withTimeout(page.evaluate(() => window.__rvDrain()), 3000, "final drain");
    for (const e of d?.events ?? []) onEvent(e, "tap");
  } catch { /* */ }
  flushEvents();
  await withTimeout(ctx.close().catch(() => {}), 5000, "context.close");
  await withTimeout(browser.close().catch(() => {}), 5000, "browser.close");
  try { browser.process()?.kill("SIGKILL"); } catch { /* already gone */ }
  log(`slot ${slot}: shutdown ${Date.now() - tEnd} ms`);

  // summaries + DONE markers (a journey is complete when it was played from its
  // start to its end; the tail journey after the slice is partial)
  for (const jid of state.order) {
    const J = state.journeys[jid];
    const complete = ids.includes(jid) && J.firstCt !== null && J.firstCt < 3 && J.dur && (J.maxCt ?? 0) > J.dur - 4;
    const fm = J.frameMs;
    const summary = {
      id: jid, name: J.name, runId: RUN_ID, slot, inSlice: ids.includes(jid), complete: !!complete,
      // only --perf (one browser, kiosk Chrome closed) yields timing verdicts
      contended: !PERF || PARALLEL > 1, perf: PERF, build: commit,
      audio: { firstCt: J.firstCt, lastCt: J.lastCt, maxCt: J.maxCt ?? null, dur: J.dur, src: J.src ?? null, driftMax: J.driftMax },
      samples: J.samples, events: J.eventsN,
      frames: { n: fm.length, fps: fm.length ? +(1000 / (fm.reduce((a, b) => a + b, 0) / fm.length)).toFixed(1) : 0, p95: pct(fm, 95), p99: pct(fm, 99), max: fm.length ? Math.max(...fm) : null, over50: fm.filter((x) => x > 50).length, over80: fm.filter((x) => x > 80).length },
      longtasks: { n: J.longtasks, max: J.maxLongtask },
      screenshotWins: J.screenshotWins,
      wallS: Math.round((Date.now() - J.startedWall) / 1000),
    };
    fs.writeFileSync(path.join(OUT, dirName(jid), "summary.json"), JSON.stringify(summary, null, 1));
    if (summary.inSlice) fs.writeFileSync(path.join(OUT, dirName(jid), "DONE"), complete ? "complete\n" : "incomplete\n");
  }
  return state.order;
}

// ── plan ──
if (PERF) {
  // clean timing needs the GPU to ourselves: refuse while the kiosk Chrome runs
  const { execSync } = await import("node:child_process");
  let kiosk = "";
  try { kiosk = execSync(`pgrep -f "user-data-dir=${process.env.HOME}/.tramokyo-chrome"`, { encoding: "utf8" }).trim(); } catch { /* none */ }
  if (kiosk) {
    console.error("--perf refused: the kiosk Chrome (user-data-dir=~/.tramokyo-chrome) is running and shares the GPU — close it (or run a correctness pass without --perf; its timing is flagged contended).");
    process.exit(2);
  }
}
const commit = await buildCommit();
let ids;
if (flag("--only-failed")) {
  const prevRun = arg("--only-failed");
  const v = JSON.parse(fs.readFileSync(path.join(HERE, "runs", prevRun, "violations.json"), "utf8"));
  // journeys with an error or warning in their OWN recording (tail fragments' handoff findings belong to the slice before)
  const prevPlan = JSON.parse(fs.readFileSync(path.join(HERE, "runs", prevRun, "run.json"), "utf8"));
  const bad = v.filter((x) => x.severity !== "info");
  // a finding in a tail fragment (dir "<id>~slice<n>-<first8>") is that slice's
  // handoff — re-run the slice's journey that leads into it
  const owner = (x) => {
    const m = /~slice\d+-([0-9a-z-]{1,8})$/.exec(String(x.dir ?? ""));
    if (!m) return x.journey;
    const slice = (prevPlan.slices ?? []).find((sl) => sl[0].startsWith(m[1]));
    return slice ? slice[slice.length - 1] : null;
  };
  ids = [...new Set(bad.map(owner).filter((j) => j && !j.startsWith("_")))];
} else if (flag("--all")) {
  ids = null;
} else {
  ids = (arg("--journeys") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
// the loop's journeys (programs repeat journeys — unique, first-occurrence order)
const progs = await discoverPlan();
fs.writeFileSync(path.join(OUT, "programs.json"), JSON.stringify(progs, null, 1));
const loopIds = [...new Set(progs.flatMap((p) => p.journeys.map((j) => j.id)))];
// the loop plays programs in order; contiguous slices are only valid across the
// LEADING programs that introduce no repeat (the Tramokyo mix sets) — a journey
// first seen after a repeat program gets its own start=<id> slice
const contiguousIds = new Set();
{
  const seen = new Set();
  for (const p of progs) {
    const js = p.journeys.map((j) => j.id);
    if (js.some((id) => seen.has(id))) break;
    for (const id of js) { seen.add(id); contiguousIds.add(id); }
  }
}
if (ids === null) ids = loopIds;
const notInLoop = ids.filter((id) => !loopIds.includes(id));
if (notInLoop.length) {
  console.error(`not in the kiosk loop (?start would silently fall back to journey 0): ${notInLoop.join(", ")}`);
  process.exit(1);
}
if (!ids.length) { console.error("nothing to record (use --journeys, --all or --only-failed <runId>)"); process.exit(1); }

// slices: --all keeps contiguous loop order (real handoffs); explicit lists /
// --only-failed / --perf play each journey on its own (start → end + tail)
let slices;
if (flag("--all") && !PERF) {
  const contig = ids.filter((id) => contiguousIds.has(id));
  const total = contig.reduce((s, id) => s + (DUR[id]?.dur ?? 240), 0);
  const per = total / PARALLEL;
  slices = [[]];
  let acc = 0;
  for (const id of contig) {
    if (acc >= per && slices.length < PARALLEL) { slices.push([]); acc = 0; }
    slices[slices.length - 1].push(id);
    acc += DUR[id]?.dur ?? 240;
  }
  for (const id of ids) if (!contiguousIds.has(id)) slices.push([id]);
} else slices = ids.map((id) => [id]);

const planS = ids.reduce((s, id) => s + (DUR[id]?.dur ?? 240), 0);
const run = { runId: RUN_ID, base: BASE, build: commit, perf: PERF, parallel: PARALLEL, tail: TAIL, frameEvery: FRAME_EVERY, journeys: ids, slices, plannedAudioS: Math.round(planS), startedAt: new Date().toISOString() };
fs.writeFileSync(path.join(OUT, "run.json"), JSON.stringify(run, null, 1));
const log = (m) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
if (flag("--dry-run")) {
  console.log(JSON.stringify({ runId: RUN_ID, perf: PERF, parallel: PARALLEL, journeys: ids.length, plannedAudioMin: Math.round(planS / 60), slices: slices.map((sl) => sl.map((id) => DUR[id]?.name ?? id)) }, null, 1));
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(0);
}
log(`run ${RUN_ID} on ${commit}: ${ids.length} journeys, ${(planS / 60).toFixed(0)} min of audio, ${slices.length} slice(s), parallel ${PARALLEL}${PERF ? " (PERF)" : ""}`);

// work queue: PARALLEL workers pull slices
let next = 0;
const done = [];
await Promise.all(Array.from({ length: Math.min(PARALLEL, slices.length) }, async (_, w) => {
  while (next < slices.length) {
    const i = next++;
    log(`slot ${w}: slice ${i} → ${slices[i].join(", ")}`);
    try { done.push(...(await playSlice(w, slices[i], log))); } catch (e) { log(`slot ${w}: slice ${i} FAILED ${e.stack}`); }
  }
}));
run.finishedAt = new Date().toISOString();
run.recorded = done;
fs.writeFileSync(path.join(OUT, "run.json"), JSON.stringify(run, null, 1));
fs.writeFileSync(path.join(OUT, "RUN_DONE"), "");
log(`done → ${path.relative(ROOT, OUT)}  (check: node scripts/journey-review/check.mjs ${RUN_ID})`);
