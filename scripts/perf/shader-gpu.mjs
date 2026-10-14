// GPU time per shader frame (EXT_disjoint_timer_query): main + prepass chain
// exactly as the visualizer runs them (gl-runtime.ts) at the kiosk's shader
// resolution (2268x1473, antialiased context), measured on the GPU itself —
// far less sensitive than wall-clock fps to other work on a shared machine.
// Shaders run round-robin, ROUNDS x FRAMES each; the median frame of the
// best round is reported. Hold the shared GPU measure lock while it runs.
//   node scripts/perf/shader-gpu.mjs /tmp/gl-runtime.js shaders.json name[,name] [frames] [rounds]
import { chromium } from "playwright";
import fs from "node:fs";
const [runtime, file, list] = process.argv.slice(2);
const FRAMES = Number(process.argv[5] ?? 24);
const ROUNDS = Number(process.argv[6] ?? 3);
const norm = (v) => (typeof v === "string" ? { main: v, prepass: null } : v);
const M = JSON.parse(fs.readFileSync(file, "utf8"));
const names = [...new Set((list ?? "").split(",").filter(Boolean))].filter((n) => M[n]);
const W = 2268, H = 1473;
const br = await chromium.launch({ headless: false, args: ["--ignore-gpu-blocklist"] });
const ctx = await br.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.setContent(`<body style="margin:0;background:#000"><canvas style="position:fixed;inset:0;width:100vw;height:100vh"></canvas></body>`);
await p.addScriptTag({ path: runtime });
const res = await p.evaluate(async ({ specs, W, H, FRAMES, ROUNDS, STAT }) => {
  const c = document.querySelector("canvas"); c.width = W; c.height = H;
  const gl = c.getContext("webgl");
  const tq = gl.getExtension("EXT_disjoint_timer_query");
  if (!tq) return [["ERR", "no EXT_disjoint_timer_query"]];
  const items = specs.map(([n, s]) => { try { return { n, run: window.__glrt.makeShader(gl, s, W, H), best: Infinity }; } catch (e) { return { n, err: String(e).slice(0, 100) }; } });
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  let t = 37;
  const measure = async (it) => {
    const qs = [];
    for (let f = 0; f < FRAMES; f++) {
      const q = tq.createQueryEXT(); tq.beginQueryEXT(tq.TIME_ELAPSED_EXT, q); it.run.draw((t += 0.016), [0.3, 0.3, 0.3, 0.3]); tq.endQueryEXT(tq.TIME_ELAPSED_EXT); qs.push(q);
      await frame();
    }
    const ms = [];
    for (let tries = 0; tries < 200 && qs.length; tries++) {
      await frame();
      for (let i = qs.length - 1; i >= 0; i--) {
        if (tq.getQueryObjectEXT(qs[i], tq.QUERY_RESULT_AVAILABLE_EXT)) {
          if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) ms.push(tq.getQueryObjectEXT(qs[i], tq.QUERY_RESULT_EXT) / 1e6);
          tq.deleteQueryEXT(qs[i]); qs.splice(i, 1);
        }
      }
    }
    ms.sort((a, b) => a - b);
    // STAT=min: the fastest frame — the shader's own cost with the least
    // interference from other GPU work on a shared machine (the live kiosk)
    return ms.length ? (STAT === "min" ? ms[0] : ms[Math.floor(ms.length / 2)]) : NaN;
  };
  for (const it of items) if (!it.err) await measure(it);
  for (let r = 0; r < ROUNDS; r++) for (const it of items) if (!it.err) { const m = await measure(it); if (m < it.best) it.best = m; }
  return items.map((it) => [it.n, it.err ?? +it.best.toFixed(2)]);
}, { specs: names.map((n) => [n, norm(M[n])]), W, H, FRAMES, ROUNDS, STAT: process.env.STAT ?? "median" });
const out = {};
for (const [n, v] of res) { out[n] = v; console.log(n.padEnd(22), v); }
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
await br.close();
