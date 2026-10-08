#!/usr/bin/env node
/**
 * CYCLE-RESTART PROBE (perf-all 2026-10-08: a sporadic 67–133 ms frame ~0.2 s
 * after an in-page `cycle-start`, on the black intro stage). Plays the LAST
 * journey of a program from near its end, lets the loop wrap into the next
 * cycle, and records every long animation frame (LoAF, with script
 * attribution) + a JS CPU profile across the restart.
 *
 *   node scripts/journey-review/probe-cycle.mjs [--journey <id>] [--runs 3]
 *
 * Same safety as record.mjs: kiosk-shared routes are answered locally.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const arg = (k, d = null) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const BASE = arg("--base", "http://localhost:3000");
const JOURNEY = arg("--journey", "46216435-4340-4ad4-9033-101e66fb29e7"); // Love Again — ends tramokyo-mix-4
const RUNS = Number(arg("--runs", "3"));
// --hide <css selector>: experiment — display:none an element class to attribute the stall
const HIDE = arg("--hide", null);
const OUT = path.join(HERE, "runs", `probe-cycle-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });

const LAUNCH_ARGS = [
  "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--use-angle=metal", "--force-color-profile=srgb",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
];

function inPage() {
  const rv = (window.__probe = { loaf: [], frames: [], audios: [] });
  const oc = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...r) {
    const el = oc.call(this, tag, ...r);
    if (String(tag).toLowerCase() === "audio") rv.audios.push(el);
    return el;
  };
  const A = window.Audio;
  window.Audio = function (...a) { const el = new A(...a); rv.audios.push(el); return el; };
  window.Audio.prototype = A.prototype;
  let last = 0;
  const loop = (now) => { if (last && now - last > 40) rv.frames.push([Math.round(now), Math.round(now - last)]); last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) rv.loaf.push({
        start: Math.round(e.startTime), dur: Math.round(e.duration), block: Math.round(e.blockingDuration ?? 0),
        render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
        style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
        scripts: (e.scripts ?? []).map((s) => ({ dur: Math.round(s.duration), inv: s.invoker, type: s.invokerType, fn: s.sourceFunctionName, url: (s.sourceURL || "").split("/").pop(), pos: s.sourceCharPosition, layout: Math.round(s.forcedStyleAndLayoutDuration ?? 0) })),
      });
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch { /* */ }
  window.__probeSeekEnd = (lead) => {
    const a = rv.audios.filter((x) => x.duration > 30 && !x.paused);
    if (!a.length) return null;
    a[0].currentTime = a[0].duration - lead;
    return a[0].duration;
  };
}

async function once(i) {
  const browser = await chromium.launch({ headless: true, channel: "chrome", args: LAUNCH_ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
  const packLog = [];
  await page.route("**/api/pack/remote**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ commands: [] }) }));
  await page.route("**/api/review/glitch-log**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/pack/log**", (r) => { try { packLog.push({ wall: Date.now(), ...r.request().postDataJSON() }); } catch { /* */ } return r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await page.route("**/api/installation/heartbeat**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.addInitScript(inPage);
  if (HIDE) await page.addInitScript((sel) => { const add = () => { const st = document.createElement("style"); st.textContent = `${sel}{display:none!important}`; document.head.appendChild(st); }; if (document.head) add(); else document.addEventListener("DOMContentLoaded", add); }, HIDE);
  await page.goto(`${BASE}/room/installation?loop=1&kiosk=1&start=${JOURNEY}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const cdp = await page.context().newCDPSession(page);
  // wait for the journey to be playing, then jump to its last seconds
  let dur = null;
  for (let k = 0; k < 120 && !dur; k++) { await page.waitForTimeout(1000); dur = await page.evaluate(() => { const a = window.__probe.audios.filter((x) => x.duration > 30 && !x.paused && x.currentTime > 25); return a.length ? a[0].duration : null; }); }
  if (!dur) { console.log(`run ${i}: journey never played`); await browser.close(); return null; }
  await page.evaluate(() => window.__probeSeekEnd(6));
  const seekWall = Date.now();
  // profile from just before the expected cycle-start (end + credits/black hold)
  const ended = async () => packLog.some((l) => /cycle-complete/.test(l.event ?? ""));
  for (let k = 0; k < 60 && !(await ended()); k++) await page.waitForTimeout(500);
  const endWall = packLog.find((l) => /cycle-complete/.test(l.event ?? ""))?.wall ?? seekWall + 6000;
  await page.waitForTimeout(Math.max(0, endWall + 12000 - Date.now()));
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  const traceChunks = [];
  cdp.on("Tracing.dataCollected", (e) => traceChunks.push(...e.value));
  const traceDone = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["toplevel", "gpu", "viz", "cc", "blink", "devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-gpu.service", "v8.execute"] } });
  const profStartEpoch = await page.evaluate(() => performance.timeOrigin + performance.now());
  const isRestart = (l) => /cycle-start/.test(l.event ?? "") && l.wall > endWall;
  for (let k = 0; k < 40 && !packLog.some(isRestart); k++) await page.waitForTimeout(500);
  await page.waitForTimeout(4000);
  const { profile } = await cdp.send("Profiler.stop");
  await cdp.send("Tracing.end");
  await traceDone;
  const res = await page.evaluate(() => ({ origin: performance.timeOrigin, loaf: window.__probe.loaf, frames: window.__probe.frames }));
  const cs = packLog.find(isRestart);
  const csT = cs ? cs.wall - res.origin : null;
  const near = (t) => csT != null && t > csT - 3000 && t < csT + 4000;
  const out = { run: i, cycleStartPageT: csT && Math.round(csT), frames: res.frames.filter(([t]) => near(t)), loaf: res.loaf.filter((l) => near(l.start)) };
  fs.writeFileSync(path.join(OUT, `run${i}.json`), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(OUT, `run${i}.cpuprofile`), JSON.stringify(profile));
  fs.writeFileSync(path.join(OUT, `run${i}.trace.json`), JSON.stringify({ traceEvents: traceChunks }));
  // self-time by function inside the profile window
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, k) => {
    const n = byId.get(id); const f = n.callFrame;
    const key = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt[k + 1] ?? 0) / 1000);
  });
  out.topSelf = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, ms]) => `${ms.toFixed(1).padStart(7)} ms  ${k}`);
  out.profStartPageT = Math.round(profStartEpoch - res.origin);
  fs.writeFileSync(path.join(OUT, `run${i}.json`), JSON.stringify(out, null, 1));
  console.log(`run ${i}: cycle-start @${out.cycleStartPageT} frames>40ms ${JSON.stringify(out.frames)} loaf ${out.loaf.length}`);
  await browser.close();
  return out;
}

for (let i = 1; i <= RUNS; i++) await once(i);
console.log(`→ ${OUT}`);
