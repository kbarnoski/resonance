#!/usr/bin/env node
/**
 * BOUNDARY GAP PROBE (2026-10-08). Headed kiosk-flag Chrome (real GPU): opens
 * the loop on --journey, lets it settle, seeks its audio to the last few
 * seconds and records every frame gap > 40 ms across the handoff into the
 * next journey, with the flight-recorder events around each.
 *
 *   node scripts/journey-review/probe-boundary-gap.mjs --journey ghost [--base URL] [--runs 3] [--lead 5]
 */
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const arg = (k, d = null) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const BASE = arg("--base", "http://localhost:3000");
const JOURNEY = arg("--journey", "ghost");
const RUNS = Number(arg("--runs", "3"));
const LEAD = Number(arg("--lead", "5"));
const ARGS = ["--autoplay-policy=no-user-gesture-required", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--kiosk"];

for (let i = 1; i <= RUNS; i++) {
  const b = await chromium.launch({ headless: false, channel: "chrome", args: ARGS });
  const p = await (await b.newContext({ viewport: null })).newPage();
  for (const [pat, body] of [["**/api/pack/remote**", JSON.stringify({ commands: [] })], ["**/api/review/glitch-log**", "{}"], ["**/api/pack/log**", "{}"], ["**/api/installation/heartbeat**", "{}"]]) await p.route(pat, (r) => r.fulfill({ status: 200, contentType: "application/json", body }));
  await p.addInitScript(() => {
    const rv = (window.__bp = { gaps: [], ev: [], audios: [] });
    window.__resonanceGlitchTap = (e) => rv.ev.push([Math.round(performance.now()), e.type, e.detail ?? ""]);
    const oc = Document.prototype.createElement;
    Document.prototype.createElement = function (tag, ...r) { const el = oc.call(this, tag, ...r); if (String(tag).toLowerCase() === "audio") rv.audios.push(el); return el; };
    const A = window.Audio; window.Audio = function (...a) { const el = new A(...a); rv.audios.push(el); return el; }; window.Audio.prototype = A.prototype;
    let last = 0;
    const loop = (n) => { if (last && n - last > 40) rv.gaps.push([Math.round(n), Math.round(n - last)]); last = n; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  await p.goto(`${BASE}/room/installation?loop=1&kiosk=1&start=${JOURNEY}`, { waitUntil: "domcontentloaded" });
  let ok = false;
  for (let k = 0; k < 60 && !ok; k++) { await p.waitForTimeout(1000); ok = await p.evaluate(() => window.__bp.audios.some((x) => x.duration > 20 && !x.paused && x.currentTime > 14)); }
  if (!ok) { console.log(`run ${i}: never played`); await b.close(); continue; }
  const PROF = argv.includes("--profile");
  const cdp = PROF ? await p.context().newCDPSession(p) : null;
  if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start"); }
  const t0 = await p.evaluate((lead) => { const a = window.__bp.audios.find((x) => x.duration > 20 && !x.paused); a.currentTime = a.duration - lead; return Math.round(performance.now()); }, LEAD);
  await p.waitForTimeout((LEAD + 14) * 1000);
  const r = await p.evaluate(() => window.__bp);
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop");
    const nowMs = await p.evaluate(() => performance.now());
    // map samples to wall perf time: last sample ~ now
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    let t = profile.startTime; const times = profile.timeDeltas.map((d) => (t += d));
    const off = nowMs * 1000 - profile.endTime;
    const big = r.gaps.filter((g) => g[1] > 60);
    for (const g of big) {
      const lo = (g[0] - g[1]) * 1000 - off, hi = g[0] * 1000 - off;
      const self = new Map();
      profile.samples.forEach((id, k) => { if (times[k] < lo || times[k] > hi) return; const n = byId.get(id); const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`; self.set(key, (self.get(key) ?? 0) + 0.2); });
      console.log(`   profile gap ${g}:`, [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v.toFixed(0)}ms ${k}`).join("\n      "));
    }
  }
  const jc = r.ev.find((e) => e[1] === "journey-change" && e[0] > 0 && r.ev.indexOf(e) > 0 && e[0] > (r.ev.find((x) => x[1] === "journey-change")?.[0] ?? 0));
  const after = r.gaps.filter((g) => g[0] > t0 + 1500);
  console.log(`run ${i}: handoff @${jc?.[0] ?? "?"}  gaps after seek: ${JSON.stringify(after)}`);
  for (const g of after.filter((g) => g[1] > 100)) console.log("   ", g, JSON.stringify(r.ev.filter((e) => e[0] > g[0] - g[1] - 600 && e[0] <= g[0]).map((e) => [e[0] - g[0], e[1], String(e[2]).slice(0, 40)])));
  await b.close();
}
