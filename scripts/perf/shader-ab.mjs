// A/B a rewritten shader against its original at the kiosk's shader
// resolution: per-pixel difference of the rendered frames (8-bit) at several
// times / audio levels. Both sides run exactly as the visualizer runs them
// (main + prepass chain — gl-runtime.ts / src/lib/shaders/prepass-gl.ts).
//   npx esbuild scripts/perf/gl-runtime.ts --bundle --format=iife --outfile=/tmp/gl-runtime.js
//   npx esbuild scripts/perf/dump-shaders.ts --bundle --platform=node --format=esm --outfile=/tmp/dump.mjs
//   node /tmp/dump.mjs after.json   (and in a checkout of the base ref: before.json)
//   node scripts/perf/shader-ab.mjs /tmp/gl-runtime.js before.json after.json name[,name] [W H]
// TIMES=t1,t2,... picks the frames (default 37,123.4,611.7,2400.3).
import { chromium } from "playwright";
import fs from "node:fs";
const [runtime, aFile, bFile, list] = process.argv.slice(2);
const W = Number(process.argv[6] ?? 2268), H = Number(process.argv[7] ?? 1473);
const norm = (v) => (typeof v === "string" ? { main: v, prepass: null } : v);
const A = JSON.parse(fs.readFileSync(aFile, "utf8"));
const B = JSON.parse(fs.readFileSync(bFile, "utf8"));
const TIMES = (process.env.TIMES ?? "37,123.4,611.7,2400.3").split(",").map(Number);
const br = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const p = await br.newPage();
let worst = 0;
for (const n of list.split(",")) {
  await p.setContent("<canvas></canvas>");
  await p.addScriptTag({ path: runtime });
  const r = await p.evaluate(({ a, b, W, H, TIMES }) => {
    const c = document.querySelector("canvas"); c.width = W; c.height = H;
    const gl = c.getContext("webgl", { antialias: true, preserveDrawingBuffer: true });
    const run = [window.__glrt.makeShader(gl, a, W, H), window.__glrt.makeShader(gl, b, W, H)];
    const AU = [[0.3, 0.25, 0.2, 0.28], [0.8, 0.6, 0.7, 0.5], [0.05, 0.1, 0.9, 0.1], [0.42, 0.33, 0.21, 0.3]];
    const grab = (k, t, au) => { run[k].draw(t, au); const d = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, d); return d; };
    return TIMES.map((t, ti) => {
      const au = AU[ti % AU.length];
      const x = grab(0, t, au), y = grab(1, t, au);
      let at = 0, max = 0, n1 = 0, n2 = 0, sum = 0;
      for (let i = 0; i < x.length; i++) { if ((i & 3) === 3) continue; const d = Math.abs(x[i] - y[i]); sum += d; if (d > max) { max = d; at = i; } if (d > 1) n1++; if (d > 2) n2++; }
      return { t, max, n1, n2, mean: +(sum / (W * H * 3)).toFixed(4), at: `${(at >> 2) % W},${Math.floor((at >> 2) / W)}` };
    });
  }, { a: norm(A[n]), b: norm(B[n]), W, H, TIMES }).catch((e) => String(e).slice(0, 200));
  if (typeof r === "string") { console.log(n.padEnd(18), "ERR", r); worst = 999; continue; }
  worst = Math.max(worst, ...r.map((d) => d.max));
  console.log(n.padEnd(18), r.map((d) => `t${d.t}: max${d.max} >1:${d.n1} >2:${d.n2} mean${d.mean} @${d.at}`).join(" | "));
}
await br.close();
process.exitCode = worst > 2 ? 1 : 0;
