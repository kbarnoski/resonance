// Frame rate of a stack of real shader layers at the kiosk's resolution
// (1512x982 @2x, headed — the real GPU), under the 60 Hz headroom cap, with the
// frame stagger on vs off (?stagger=0). Alternates the variants to cancel drift.
// Hold the shared GPU measure lock while it runs.
//   node scripts/perf/stack-fps.mjs /tmp/vis-stack.js a,b,c[;d,e,f] [secs] [reps]
import { chromium } from "playwright";
const [bundle, stacksArg, secsArg, repsArg] = process.argv.slice(2);
const secs = Number(secsArg ?? 8), reps = Number(repsArg ?? 2);
const br = await chromium.launch({ headless: false, args: ["--autoplay-policy=no-user-gesture-required", "--ignore-gpu-blocklist"] });
async function measure(modes, stagger) {
  const ctx = await br.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
  await ctx.route("http://vis-stack.local/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: `<html><body style="margin:0;background:#000"><div id="root"></div></body></html>` }));
  const p = await ctx.newPage();
  await p.goto(`http://vis-stack.local/?fpscap=60${stagger ? "" : "&stagger=0"}`);
  await p.evaluate((modes) => {
    window.__modes = modes; window.process = { env: { NODE_ENV: "production" } };
    window.__f = []; let last = 0;
    const loop = (t) => { if (last) window.__f.push(t - last); last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }, modes);
  await p.addScriptTag({ path: bundle });
  await p.waitForFunction((n) => (window.__ready ?? 0) >= n, modes.length, { timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__f = []; });
  await p.waitForTimeout(secs * 1000);
  const r = await p.evaluate(() => {
    const f = window.__f; const tot = f.reduce((a, b) => a + b, 0);
    const s = [...f].sort((a, b) => a - b);
    return { fps: +(1000 * f.length / tot).toFixed(1), long: f.filter((x) => x > 12.5).length, p99: +s[Math.floor(s.length * 0.99)].toFixed(1), n: f.length };
  });
  await ctx.close();
  return r;
}
for (const stack of stacksArg.split(";")) {
  const modes = stack.split(",");
  for (let k = 0; k < reps; k++) {
    for (const stagger of [false, true]) {
      const r = await measure(modes, stagger);
      console.log(`${stack.padEnd(40)} stagger=${stagger ? "on " : "off"} fps ${r.fps} long ${r.long}/${r.n} p99 ${r.p99}ms`);
    }
  }
}
await br.close();
