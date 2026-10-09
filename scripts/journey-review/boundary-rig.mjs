// Boundary rig (2026-10-09): attach to the REAL kiosk Chrome (launched with --remote-debugging-port=9333),
// seek the playing journey to its last SEEK s, and log glitch events + LoAF + rAF gaps across the hand-off.
// Env: TRACE=<file> GPU trace around it; SHOTS=<dir> screenshots from the hand-off on (timings invalid then);
// WARMBLEND=1 experiment. Usage: node scripts/journey-review/boundary-rig.mjs [SEEK=12] [DUR=40]
import { chromium } from "playwright";
const SEEK = Number(process.argv[2] ?? 12), DUR = Number(process.argv[3] ?? 40);
let b, page;
for (let k = 0; k < 60 && !page; k++) {
  try { b ??= await chromium.connectOverCDP("http://127.0.0.1:9333"); page = b.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("installation")); } catch {}
  if (!page) await new Promise((r) => setTimeout(r, 1000));
}
if (!page) { console.log("no page"); process.exit(1); }
await page.addInitScript(() => {
  window.__audios = [];
  const OrigAudio = window.Audio;
  window.Audio = function (...a) { const el = new OrigAudio(...a); window.__audios.push(el); return el; };
  window.Audio.prototype = OrigAudio.prototype;
  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...r) { const el = origCreate.call(this, tag, ...r); if (String(tag).toLowerCase() === "audio") window.__audios.push(el); return el; };
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(() => (window.__audios || []).some((x) => x.duration > 60 && x.currentTime > 8), undefined, { timeout: 120000 });
await page.evaluate(() => {
  const R = (window.__lf = { loaf: [], gaps: [], ev: [], t0: performance.now() });
  window.__resonanceGlitchTap = (e) => R.ev.push(e);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration >= 50) R.loaf.push({ s: Math.round(e.startTime), d: Math.round(e.duration), blk: Math.round(e.blockingDuration), rs: e.renderStart ? Math.round(e.renderStart - e.startTime) : null,
    scripts: (e.scripts ?? []).filter((x) => x.duration >= 5).map((x) => `${x.invoker}|${x.sourceFunctionName}@${(x.sourceURL || "").split("/").pop()}:${x.sourceCharPosition} ${Math.round(x.duration)}`) }); }).observe({ type: "long-animation-frame" });
  let last = performance.now(); const tick = (n) => { if (n - last > 50) R.gaps.push([Math.round(n), Math.round(n - last)]); last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
});
await new Promise((r) => setTimeout(r, 3000));
if (process.env.WARMBLEND) console.log("warmblend", await page.evaluate(async () => {
  const ds = [...document.querySelectorAll("div")].filter((d) => d.style.visibility === "hidden" && d.querySelector("canvas"));
  const saved = ds.map((d) => [d.style.visibility, d.style.opacity]);
  ds.forEach((d) => { d.style.visibility = "visible"; d.style.opacity = "0.001"; });
  await new Promise((r) => setTimeout(r, 2000));
  ds.forEach((d, i) => { d.style.visibility = saved[i][0]; d.style.opacity = saved[i][1]; });
  return ds.length;
}));
const seekInfo = await page.evaluate((S) => { const a = (window.__audios || []).find((x) => x.duration > 60 && !x.paused); if (!a) return "no playing audio"; a.currentTime = a.duration - S; return `seek ${a.currentSrc.slice(-40)} -> ${a.currentTime.toFixed(1)}/${a.duration.toFixed(1)}`; }, SEEK);
console.log(seekInfo);
if (process.env.SHOTS) {
  // poll until the hand-off, then grab frames around it (screenshots cost ~50-100 ms each — the gap timing is NOT valid in this mode)
  await page.waitForFunction(() => window.__lf.ev.some((e) => e.type === "journey-change"), undefined, { timeout: 60000, polling: 16 });
  for (let k = 0; k < 40; k++) {
    const t = await page.evaluate(() => { const jc = window.__lf.ev.find((e) => e.type === "journey-change"); return jc ? Math.round(performance.now() - jc.t) : "pre"; });
    await page.screenshot({ path: `${process.env.SHOTS}/f${String(k).padStart(2, "0")}_${t}.jpg`, type: "jpeg", quality: 60, scale: "css" });
  }
  await new Promise((r) => setTimeout(r, 5000));
} else if (process.env.TRACE) {
  await new Promise((r) => setTimeout(r, (SEEK - 1) * 1000));
  await b.startTracing(page, { path: process.env.TRACE, categories: ["toplevel", "gpu", "gpu.service", "viz", "cc", "disabled-by-default-gpu.service", "devtools.timeline", "media"] });
  await new Promise((r) => setTimeout(r, 14000));
  await b.stopTracing();
  await new Promise((r) => setTimeout(r, Math.max(0, DUR - SEEK - 3) * 1000));
} else await new Promise((r) => setTimeout(r, DUR * 1000));
const R = await page.evaluate(() => window.__lf);
const jc = R.ev.find((e) => e.type === "journey-change");
const T = jc ? jc.t : R.t0;
for (const e of R.ev) if (Math.abs(e.t - T) < 4000 && !["idle-rescue", "push-refused"].includes(e.type)) console.log(`ev ${e.t - T} ${e.type} ${(e.detail || "").slice(0, 100)}`);
for (const [t, g] of R.gaps) {
  const l = R.loaf.filter((x) => x.s <= t && x.s + x.d >= t - g);
  console.log(`gap ${g}ms @${t - T}  ` + (l.length ? l.map((x) => `LoAF ${x.d}ms blk ${x.blk} render+${x.rs} ${x.scripts.join(" ; ")}`).join(" || ") : "no LoAF"));
}
await b.close();
