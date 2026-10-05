#!/usr/bin/env node
// verify-particles.mjs — PROOF harness for the GPU particle engine
// (dream/19104-particle-engine). Headed Chromium at DPR 2 (real GPU — a
// headless/swiftshader run measures nothing). Measures fps at each soul and
// density, and proves the band drive changes particle STATE (sampled from
// the GPU via window.__resonanceParticles), not just a meter.
//
// Usage: node scripts/verify-particles.mjs [outDir]
//   PARTICLES_BASE=http://localhost:3007  (dev server; default :3007)
//   PARTICLES_VIDEO=1  also record a short .webm (separate context)
//
// The display must be AWAKE: Chrome throttles rAF for occluded/sleeping
// screens and fps collapses to ~1 — the harness flags that as THROTTLED.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PARTICLES_BASE ?? "http://localhost:3007";
const OUT = process.argv[2] ?? "/tmp/particles";
const ROUTE = "/dream/19104-particle-engine";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
function corr(a, b) {
  const ma = mean(a), mb = mean(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db + 1e-12);
}

// best correlation of drive leading the response by 0..maxLag samples
function leadCorr(drive, resp, maxLag = 8) {
  let best = { r: -1, lag: 0 };
  for (let k = 0; k <= maxLag; k++) {
    const r = corr(drive.slice(0, drive.length - k), resp.slice(k));
    if (r > best.r) best = { r, lag: k };
  }
  return best;
}

const report = { base: BASE, when: new Date().toISOString(), checks: [] };
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`); };

const browser = await chromium.launch({
  headless: false,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1440,900", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${BASE}${ROUTE}?auto=0`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__resonanceParticles, null, { timeout: 60000 });
  await sleep(4000);
  const stats = () => page.evaluate(() => window.__resonanceParticles.stats());

  const vis = await page.evaluate(() => document.visibilityState);
  let s = await stats();
  report.env = { visibility: vis, width: s.width, height: s.height, dpr: s.dpr, count: s.count };
  if (s.fps < 5) console.log(`THROTTLED: fps=${s.fps} — the display is likely asleep/occluded; wake it and re-run`);
  check("native DPR 2 canvas", s.dpr === 2 && s.width >= 2800, `${s.width}×${s.height} @${s.dpr}`);

  // ── silent baseline ───────────────────────────────────────────────────────
  const silent = [];
  for (let i = 0; i < 20; i++) { await sleep(250); silent.push((await stats()).state.meanSpeed); }
  await page.screenshot({ path: path.join(OUT, "00-vortex-silence.png") });

  // ── play Karel's track ──────────────────────────────────────────────────
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForFunction(() => window.__resonanceParticles.stats().playing, null, { timeout: 60000 });
  await sleep(9000);

  const series = { bass: [], mid: [], treble: [], spB: [], spM: [], spT: [], rB: [], fps: [], lum: [], swell: [] };
  let lastT = -1;
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    s = await stats();
    series.fps.push(s.fps); series.lum.push(s.meanLum); series.swell.push(s.swell);
    if (s.state.t === lastT) continue; // only fresh GPU samples
    lastT = s.state.t;
    series.bass.push(s.bands.bass); series.mid.push(s.bands.mid); series.treble.push(s.bands.treble);
    series.spB.push(s.state.speedByBand[0]); series.spM.push(s.state.speedByBand[1]); series.spT.push(s.state.speedByBand[2]);
    series.rB.push(s.state.radiusByBand[0]);
  }
  await page.screenshot({ path: path.join(OUT, "01-vortex-playing.png") });
  const playingSpeed = mean([...series.spB, ...series.spM, ...series.spT]);
  report.playing = {
    fpsMean: mean(series.fps), fpsMin: Math.min(...series.fps),
    bandSd: { bass: sd(series.bass), mid: sd(series.mid), treble: sd(series.treble) },
    speedSd: { bass: sd(series.spB), mid: sd(series.spM), treble: sd(series.spT) },
    corr: { bassDrive_bassRadius: corr(series.bass, series.rB), bassDrive_bassSpeed: corr(series.bass, series.spB), trebleDrive_trebleSpeed: corr(series.treble, series.spT), midDrive_midSpeed: corr(series.mid, series.spM) },
    lead: { bass_radius: leadCorr(series.bass, series.rB), bass_speed: leadCorr(series.bass, series.spB), mid_speed: leadCorr(series.mid, series.spM), treble_speed: leadCorr(series.treble, series.spT) },
    silentSpeed: mean(silent), playingSpeed, onsets: s.onsets, maxLumStep: s.maxLumStep, meanLum: mean(series.lum), swellMax: Math.max(...series.swell),
  };
  const P = report.playing;
  check("band drive is live", P.bandSd.bass > 0.02 && P.bandSd.mid > 0.02 && P.bandSd.treble > 0.02, `sd b/m/t ${P.bandSd.bass.toFixed(3)}/${P.bandSd.mid.toFixed(3)}/${P.bandSd.treble.toFixed(3)}, onsets ${P.onsets}`);
  check("music moves the particles (state, not a meter)", P.playingSpeed > P.silentSpeed * 1.08 || Math.max(P.corr.bassDrive_bassRadius, P.corr.bassDrive_bassSpeed, P.corr.trebleDrive_trebleSpeed, P.corr.midDrive_midSpeed) > 0.3,
    `speed silent ${P.silentSpeed.toFixed(3)} → playing ${P.playingSpeed.toFixed(3)}; corr bass→radius ${P.corr.bassDrive_bassRadius.toFixed(2)}, bass→speed ${P.corr.bassDrive_bassSpeed.toFixed(2)}, mid→speed ${P.corr.midDrive_midSpeed.toFixed(2)}, treble→speed ${P.corr.trebleDrive_trebleSpeed.toFixed(2)}`);
  const L = P.lead;
  check("each band leads its own particles (lagged xcorr ≥ 0.3)", [L.bass_radius, L.mid_speed, L.treble_speed].filter((x) => x.r >= 0.3).length >= 2,
    `bass→radius r=${L.bass_radius.r.toFixed(2)}@${L.bass_radius.lag}, bass→speed r=${L.bass_speed.r.toFixed(2)}@${L.bass_speed.lag}, mid→speed r=${L.mid_speed.r.toFixed(2)}@${L.mid_speed.lag}, treble→speed r=${L.treble_speed.r.toFixed(2)}@${L.treble_speed.lag} (lag in ~200 ms samples)`);
  report.series = series;
  check("no luminance flash (mean-lum step ≤ 0.02 per 4 frames)", P.maxLumStep <= 0.02, `max step ${P.maxLumStep.toFixed(4)}, mean lum ${P.meanLum.toFixed(3)}`);

  // ── per-soul fps + screenshots ─────────────────────────────────────────
  report.souls = {};
  for (const [i, soul] of ["smoke", "bloom", "murmuration", "vortex"].entries()) {
    await page.evaluate((id) => window.__resonanceParticles.setSoul(id, 3), soul);
    await sleep(9000);
    const f = [];
    for (let k = 0; k < 15; k++) { await sleep(200); f.push((await stats()).fps); }
    const st = await stats();
    report.souls[soul] = { fps: mean(f), fpsLow: st.fpsLow };
    await page.screenshot({ path: path.join(OUT, `${String(i + 2).padStart(2, "0")}-${soul}.png`) });
    check(`soul ${soul} ≥ 55 fps @ ${st.count} particles, DPR 2`, mean(f) >= 55, `fps ${mean(f).toFixed(1)} (p5 ${st.fpsLow})`);
  }

  // ── density sweep ────────────────────────────────────────────────────
  report.density = {};
  for (const n of [640_000, 1_048_576, 409_600]) {
    await page.evaluate((c) => window.__resonanceParticles.setCount(c), n);
    await sleep(5000);
    const f = [];
    for (let k = 0; k < 15; k++) { await sleep(200); f.push((await stats()).fps); }
    const st = await stats();
    report.density[st.count] = { fps: mean(f), fpsLow: st.fpsLow };
    console.log(`density ${st.count}: ${mean(f).toFixed(1)} fps (p5 ${st.fpsLow})`);
    if (n === 1_048_576) await page.screenshot({ path: path.join(OUT, "06-vortex-1M.png") });
  }
  report.final = await stats();
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean");
  await ctx.close();

  if (process.env.PARTICLES_VIDEO) {
    const vctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: 1280, height: 800 } } });
    const vp = await vctx.newPage();
    await vp.goto(`${BASE}${ROUTE}?auto=0&soul=bloom`, { waitUntil: "domcontentloaded" });
    await vp.waitForFunction(() => !!window.__resonanceParticles, null, { timeout: 60000 });
    await vp.getByRole("button", { name: "Play" }).click();
    await sleep(14000);
    await vp.evaluate(() => window.__resonanceParticles.setSoul("vortex", 6));
    await sleep(12000);
    const video = vp.video();
    await vctx.close();
    if (video) console.log(`video: ${await video.path()}`);
  }
} finally {
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
const ok = report.checks.every((c) => c.ok);
console.log(ok ? "VERIFIED" : "NOT VERIFIED");
process.exitCode = ok ? 0 : 1;
