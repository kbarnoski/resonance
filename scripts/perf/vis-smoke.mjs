// Smoke-test shaders through the REAL ShaderVisualizer (vis-harness.tsx):
// each must compile + link (prepass included), signal ready, log no [shader]
// warning, and draw a non-black frame — with float targets and, with
// --nofloat, without them (the original single-pass fallback).
//   npx esbuild scripts/perf/vis-harness.tsx --bundle --format=iife --jsx=automatic \
//     --alias:@=./src --define:process.env.NODE_ENV='"production"' --outfile=/tmp/vis-harness.js
//   node scripts/perf/vis-smoke.mjs /tmp/vis-harness.js mode[,mode] [--nofloat]
import { chromium } from "playwright";
const [bundle, list] = process.argv.slice(2);
const noFloat = process.argv.includes("--nofloat");
const modes = list.split(",");
const br = await chromium.launch({ headless: false, args: ["--autoplay-policy=no-user-gesture-required", "--ignore-gpu-blocklist"] });
const ctx = await br.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
await ctx.route("http://vis-smoke.local/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: `<html><body style="margin:0;background:#000"><div id="root"></div></body></html>` }));
let bad = 0;
for (const mode of modes) {
  const p = await ctx.newPage();
  const logs = [];
  p.on("console", (m) => { const t = m.text(); if (/shader|WebGL|GL_/i.test(t)) logs.push(t.slice(0, 160)); });
  p.on("pageerror", (e) => logs.push("pageerror " + String(e).slice(0, 160)));
  // a real origin (about:blank has no localStorage, which the app's stores read)
  await p.goto("http://vis-smoke.local/");
  await p.evaluate(({ mode, noFloat }) => { window.__mode = mode; window.__noFloat = noFloat; window.process = { env: { NODE_ENV: "production" } }; }, { mode, noFloat });
  await p.addScriptTag({ path: bundle });
  let ready = null;
  try { await p.waitForFunction(() => window.__ready !== null, null, { timeout: 15000 }); ready = await p.evaluate(() => window.__ready); } catch { ready = "timeout"; }
  await p.waitForTimeout(1500);
  // decode the screenshot in the page (2D canvas) for its luminance
  const b64 = (await p.screenshot({ type: "png" })).toString("base64");
  const { mean, max } = await p.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
    const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let sum = 0, max = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; if (l > max) max = l; }
    return { mean: sum / (d.length / 4), max };
  }, b64);
  const ok = ready === true && logs.length === 0 && max > 8;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${mode.padEnd(18)} ready=${ready} mean=${mean.toFixed(1)} max=${max.toFixed(0)}${logs.length ? " logs: " + logs.join(" | ") : ""}`);
  await p.close();
}
await br.close();
process.exit(bad ? 1 : 0);
