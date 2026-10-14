// Kiosk-resolution fps per journey (lab only, port 3100): headed Chrome at
// 1512x982 @2x on the 120 Hz panel. Opening = 14 x 1 s samples from the
// journey's start (as the kiosk's emblem-trace); tour = seeks through the track.
// node journey-fps.mjs id[,id] [tour=1] [label]
import { chromium } from "playwright";
import fs from "node:fs";
const B = "http://localhost:3100";
const ids = process.argv[2].split(",");
const tour = process.argv[3] !== "0";
const label = process.argv[4] ?? "";
const OUT = process.env.OUT ?? "/tmp/journey-fps.jsonl";
const built = await fetch(`${B}/api/version`).then((r) => r.json()).catch(() => ({}));
const browser = await chromium.launch({ headless: false, args: ["--autoplay-policy=no-user-gesture-required"] });
for (const id of ids) {
  const ctx = await browser.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
  await ctx.route("**/api/review/glitch-log**", (r) => r.fulfill({ status: 204, body: "" }));
  await ctx.addInitScript(() => {
    window.__media = new Set();
    const op = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...a) { if (this.tagName === "AUDIO") window.__media.add(this); return op.apply(this, a); };
    const A = window.Audio; window.Audio = function (...a) { const el = new A(...a); window.__media.add(el); return el; }; window.Audio.prototype = A.prototype;
    window.__frames = []; let last = 0;
    const loop = (t) => { if (last) window.__frames.push(t - last); last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  const page = await ctx.newPage();
  const rec = { id, label, built: built.commit, at: new Date().toISOString(), open: [], tour: [] };
  try {
    await page.goto(`${B}/room/installation?loop=1&kiosk=1&start=${encodeURIComponent(id)}@tramokyo-mix&tier=high&lab=1${process.env.Q ?? ""}`);
    const jid = id;
    await page.waitForFunction((j) => window.__resonanceParticleLead?.journeyId === j, jid, { timeout: 120000 });
    const win = async (ms) => { await page.evaluate(() => { window.__frames = []; }); await page.waitForTimeout(ms); return page.evaluate(() => { const f = window.__frames; const tot = f.reduce((a, b) => a + b, 0); return { fps: +(1000 * f.length / Math.max(1, tot)).toFixed(1), gaps: f.filter((x) => x > 12.5).length, n: f.length }; }); };
    for (let i = 0; i < 14; i++) rec.open.push((await win(1000)).fps);
    if (tour) {
      const dur = await page.evaluate(() => { const a = [...window.__media].find((m) => m.duration > 0); return a?.duration ?? 0; });
      for (const p of [0.16, 0.22, 0.29, 0.35, 0.42, 0.48, 0.55, 0.6, 0.66, 0.72, 0.78, 0.83, 0.88, 0.94]) {
        await page.evaluate((to) => { for (const m of window.__media) if (m.duration > 0) m.currentTime = to; }, dur * p);
        await page.waitForTimeout(3500);
        const shader = await page.evaluate(() => [...document.querySelectorAll("canvas[data-shader-mode]")].filter((c) => +getComputedStyle(c).opacity > 0.02).map((c) => c.dataset.shaderMode).join("+"));
        const w = await win(3000);
        rec.tour.push({ p, shader, fps: w.fps, gaps: w.gaps });
      }
    }
  } catch (e) { rec.err = String(e).slice(0, 200); }
  fs.appendFileSync(OUT, JSON.stringify(rec) + "\n");
  const o = rec.open, avg = o.length ? (o.reduce((a, b) => a + b, 0) / o.length).toFixed(1) : "-";
  console.log(`${label} ${id.slice(0, 14).padEnd(14)} open avg ${avg} min ${o.length ? Math.min(...o) : "-"} [${o.map(Math.round).join(" ")}]`);
  if (rec.tour.length) console.log("   tour:", rec.tour.map((t) => `${t.p}:${t.shader}=${Math.round(t.fps)}`).join("  "));
  if (rec.err) console.log("   ERR", rec.err);
  await ctx.close();
}
await browser.close();
