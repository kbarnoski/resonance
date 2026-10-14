// Film shaders through the REAL ShaderVisualizer (vis-harness.tsx, see
// vis-smoke.mjs) for the flicker gate: one clip per shader.
//   node scripts/perf/vis-film.mjs /tmp/vis-harness.js mode[,mode] /abs/out [secs]
import { chromium } from "playwright";
import fs from "node:fs";
const [bundle, list, out, secsArg] = process.argv.slice(2);
const secs = Number(secsArg ?? 8);
fs.mkdirSync(out, { recursive: true });
const br = await chromium.launch({ headless: false, args: ["--autoplay-policy=no-user-gesture-required", "--ignore-gpu-blocklist"] });
for (const mode of list.split(",")) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  await ctx.route("http://vis-smoke.local/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: `<html><body style="margin:0;background:#000"><div id="root"></div></body></html>` }));
  const p = await ctx.newPage();
  await p.goto("http://vis-smoke.local/");
  await p.evaluate((mode) => { window.__mode = mode; window.process = { env: { NODE_ENV: "production" } }; }, mode);
  await p.addScriptTag({ path: bundle });
  await p.waitForTimeout(secs * 1000);
  const v = p.video();
  await ctx.close();
  fs.renameSync(await v.path(), `${out}/${mode}.webm`);
  console.log("film", mode);
}
await br.close();
