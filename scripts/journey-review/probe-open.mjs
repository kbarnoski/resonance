#!/usr/bin/env node
/** OPENING-STALL PROBE (2026-10-08: a 1.1-3.3 s freeze as Snowflake's first
 *  emblem forms, on the kiosk only). Loads the kiosk loop at the kiosk's real
 *  pixel density and logs every frame > 40 ms in the first N s, with LoAF
 *  attribution. node scripts/journey-review/probe-open.mjs [--dpr 2] [--secs 16] [--runs 2] [--base url] */
import { chromium } from "playwright";
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const DPR = +arg("--dpr", "2"), SECS = +arg("--secs", "16"), RUNS = +arg("--runs", "2"), BASE = arg("--base", "http://localhost:3000");
const ARGS = ["--autoplay-policy=no-user-gesture-required", "--mute-audio", "--use-angle=metal", "--force-color-profile=srgb", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
for (let i = 1; i <= RUNS; i++) {
  const b = await chromium.launch({ headless: true, channel: "chrome", args: ARGS });
  const p = await (await b.newContext({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: DPR })).newPage();
  for (const [pat, body] of [["**/api/pack/remote**", JSON.stringify({ commands: [] })], ["**/api/review/glitch-log**", "{}"], ["**/api/pack/log**", "{}"], ["**/api/installation/heartbeat**", "{}"]]) await p.route(pat, (r) => r.fulfill({ status: 200, contentType: "application/json", body }));
  await p.addInitScript(() => {
    const rv = (window.__po = { gaps: [], loaf: [], ev: [] });
    window.__resonanceGlitchTap = (e) => rv.ev.push([Math.round(performance.now()), e.type, e.detail ?? ""]);
    let last = 0;
    const loop = (n) => { if (last && n - last > 40) rv.gaps.push([Math.round(n), Math.round(n - last)]); last = n; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) rv.loaf.push([Math.round(e.startTime), Math.round(e.duration), Math.round(e.blockingDuration ?? 0), (e.scripts ?? []).map((s) => `${s.sourceFunctionName || "?"}@${(s.sourceURL || "").split("/").pop()}:${s.sourceCharPosition} ${Math.round(s.duration)}ms`).join(" | ")]); }).observe({ type: "long-animation-frame", buffered: true }); } catch {}
  });
  await p.goto(`${BASE}/room/installation?loop=1&kiosk=1&start=first-snow`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(SECS * 1000);
  const r = await p.evaluate(() => window.__po);
  console.log(`run ${i} dpr ${DPR}: gaps>40ms ${JSON.stringify(r.gaps.filter((g) => g[1] > 100))}`);
  for (const l of r.loaf.filter((x) => x[1] > 150)) console.log(`   LoAF @${l[0]} ${l[1]}ms block ${l[2]} ${l[3].slice(0, 300)}`);
  const big = r.gaps.filter((g) => g[1] > 300).map((g) => g[0]);
  for (const t of big) console.log(`   events near ${t}: ${JSON.stringify(r.ev.filter((e) => Math.abs(e[0] - t) < 2000))}`);
  await b.close();
}
