// WebGPU particle engine matrix (lab only): headed Chrome at kiosk size
// (1512×982 @2×, the 120 Hz panel) on /lab/webgpu, one fresh page per case.
// Measures rAF fps (mean, p5) over 3 × 3 s windows after warm-up, plus the
// engine's own snapshot (GPU ms per pass, compile ms, problems). Optional
// FILM=dir records a webm per case for scripts/flicker-gate.mjs.
//   B=http://localhost:3200 node scripts/perf/webgpu-lab-fps.mjs "label|query" ...
// Holds ~/Documents/Resonance/.gpu-measure.lock while timing (waits for others).
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const B = process.env.B ?? "http://localhost:3200";
const OUT = process.env.OUT ?? "/tmp/webgpu-lab-fps.jsonl";
const FILM = process.env.FILM ?? "";
const SEC = Number(process.env.SEC ?? 3);
const LOCK = path.join(os.homedir(), "Documents/Resonance/.gpu-measure.lock");
const cases = process.argv.slice(2).map((a) => { const [label, q] = a.split("|"); return { label, q: q ?? "" }; });
if (!cases.length) { console.error('usage: node webgpu-lab-fps.mjs "label|query" ...'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function takeLock() {
  for (let i = 0; fs.existsSync(LOCK); i++) {
    const owner = fs.readFileSync(LOCK, "utf8").trim();
    if (!owner.startsWith("webgpu-lab")) { if (i % 12 === 0) console.log(`waiting for GPU lock (${owner})…`); await sleep(5000); continue; }
    break;
  }
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, `webgpu-lab ${process.pid} ${new Date().toISOString()}\n`);
}
const dropLock = () => { try { if (fs.readFileSync(LOCK, "utf8").startsWith("webgpu-lab")) fs.unlinkSync(LOCK); } catch { /* gone */ } };
process.on("exit", dropLock);
process.on("SIGINT", () => { dropLock(); process.exit(130); });

await takeLock();
const browser = await chromium.launch({
  headless: false,
  args: ["--enable-unsafe-webgpu", "--window-size=1512,1040"],
});
try {
  for (const c of cases) {
    const ctx = await browser.newContext({
      viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2,
      ...(FILM ? { recordVideo: { dir: FILM, size: { width: 756, height: 491 } } } : {}),
    });
    await ctx.addInitScript(() => {
      window.__frames = []; let last = 0;
      const loop = (t) => { if (last) window.__frames.push(t - last); last = t; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    const page = await ctx.newPage();
    const logs = [];
    page.on("console", (m) => { if (/error|warn/i.test(m.type())) logs.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
    page.on("pageerror", (e) => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
    const rec = { label: c.label, q: c.q, at: new Date().toISOString(), win: [], logs };
    try {
      await page.goto(`${B}/lab/webgpu${c.q ? `?${c.q}` : ""}`);
      // running = frames counted by the engine
      await page.waitForFunction(() => { const s = window.__webgpuLab?.snapshot?.(); return (s?.stats?.fps ?? 0) > 1 || !!s?.problem; }, null, { timeout: 120000 });
      await page.waitForTimeout(Number(process.env.WARM ?? 5000));
      for (let k = 0; k < 3; k++) {
        await page.evaluate(() => { window.__frames = []; });
        await page.waitForTimeout(SEC * 1000);
        rec.win.push(await page.evaluate(() => {
          const f = window.__frames.slice().sort((a, b) => a - b);
          const tot = f.reduce((a, b) => a + b, 0);
          const p95 = f[Math.floor(f.length * 0.95)] ?? 0;
          return { fps: +(1000 * f.length / Math.max(1, tot)).toFixed(1), p5fps: +(1000 / Math.max(1e-3, p95)).toFixed(1), long: f.filter((x) => x > 25).length, n: f.length };
        }));
      }
      rec.snap = await page.evaluate(() => window.__webgpuLab?.snapshot?.() ?? null);
    } catch (e) { rec.err = String(e).slice(0, 300); rec.snap = await page.evaluate(() => window.__webgpuLab?.snapshot?.() ?? null).catch(() => null); }
    fs.appendFileSync(OUT, JSON.stringify(rec) + "\n");
    const fps = rec.win.map((w) => w.fps), p5 = rec.win.map((w) => w.p5fps);
    const g = rec.snap?.gpu;
    console.log(`${c.label.padEnd(28)} fps ${fps.join("/") || "-"}  p5 ${p5.join("/") || "-"}  long ${rec.win.map((w) => w.long).join("/")}` +
      `${g ? `  gpu sim ${g.integrate.toFixed(2)} spr ${g.sprites.toFixed(2)} gov ${g.govern.toFixed(2)} comp ${g.composite.toFixed(2)}` : ""}` +
      `${rec.snap?.info ? `  compile ${rec.snap.info.compileMs}ms` : ""}${rec.snap?.problem ? `  PROBLEM ${rec.snap.problem}` : ""}${rec.snap?.stale ? "  STALE" : ""}${rec.err ? `  ERR ${rec.err}` : ""}`);
    if (logs.length) console.log("   logs:", logs.slice(0, 4).join(" | "));
    const v = page.video();
    await ctx.close();
    if (v && FILM) { const p = await v.path(); fs.renameSync(p, path.join(FILM, `${c.label.replace(/[^\w.-]+/g, "_")}.webm`)); }
  }
} finally {
  await browser.close();
  dropLock();
}
