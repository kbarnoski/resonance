// GPU time per shader frame (EXT_disjoint_timer_query): the prepass + main
// draw of each shader at the kiosk's shader resolution (2268x1473, the 1.5x
// shader DPR, antialiased context as the visualizer creates it), measured on
// the GPU itself — far less sensitive than wall-clock fps to other work on a
// shared machine. Shaders run round-robin, ROUNDS x FRAMES each; the median
// frame of the best round is reported.
// node scripts/perf/shader-gpu.mjs shaders.json name[,name] [frames] [rounds]
// (shaders.json from scripts/perf/dump-shaders.ts — see shader-ab.mjs)
import { chromium } from "playwright";
import fs from "node:fs";
const M = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const only = (process.argv[3] ?? "").split(",").filter(Boolean);
const names = [...new Set(only.length ? only : Object.keys(M).filter((k) => !k.includes("::")))].filter((n) => M[n]);
const FRAMES = Number(process.argv[4] ?? 24);
const ROUNDS = Number(process.argv[5] ?? 3);
const W = 2268, H = 1473;
const br = await chromium.launch({ headless: false, args: ["--ignore-gpu-blocklist", "--enable-webgl-draft-extensions"] });
const ctx = await br.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.setContent(`<body style="margin:0;background:#000"><canvas style="position:fixed;inset:0;width:100vw;height:100vh"></canvas></body>`);
const specs = names.map((n) => ({ n, main: M[n], pre: M[`${n}::pre`] ?? null, scale: M[`${n}::scale`] ?? 0, size: M[`${n}::size`] ?? null, nearest: !!M[`${n}::nearest`], float: !!M[`${n}::float`], extraRows: M[`${n}::extraRows`] ?? 0, blocks: M[`${n}::blocks`] ?? 1, whole: !!M[`${n}::whole`], columns: M[`${n}::columns`] ?? 0 }));
const res = await p.evaluate(async ({ specs, W, H, FRAMES, ROUNDS }) => {
  const c = document.querySelector("canvas"); c.width = W; c.height = H;
  const gl = c.getContext("webgl");
  for (const e of ["OES_texture_float", "OES_texture_float_linear", "WEBGL_color_buffer_float"]) gl.getExtension(e);
  const tq = gl.getExtension("EXT_disjoint_timer_query");
  if (!tq) return [["ERR", "no EXT_disjoint_timer_query"]];
  const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, "attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.0,1.0);}"); gl.compileShader(vs);
  const mk = (src) => { const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, src); gl.compileShader(fs); const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.bindAttribLocation(pr, 0, "a_position"); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getShaderInfoLog(fs)); return pr; };
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = (pr) => { const o = {}; for (const k of ["u_resolution", "u_time", "u_bass", "u_mid", "u_treble", "u_amplitude", "u_preres", "u_pre"]) o[k] = gl.getUniformLocation(pr, k); return o; };
  const items = [];
  for (const s of specs) {
    try {
      const it = { n: s.n, s, PM: mk(s.main), PP: s.pre ? mk(s.pre) : null, best: Infinity };
      it.um = U(it.PM); it.up = it.PP ? U(it.PP) : null;
      if (it.PP) {
        it.pw = s.size ? s.size[0] : s.columns ? s.columns : Math.max(1, Math.round(W * s.scale)); it.ph = s.size ? s.size[1] : s.columns ? H : Math.max(1, Math.round(H * s.scale)) * (s.blocks || 1) + (s.extraRows ?? 0);
        it.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, it.tex);
        const F = s.nearest ? gl.NEAREST : gl.LINEAR;
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, F], [gl.TEXTURE_MAG_FILTER, F], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, it.pw, it.ph, 0, gl.RGBA, s.float ? gl.FLOAT : gl.UNSIGNED_BYTE, null);
        it.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, it.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, it.tex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      items.push(it);
    } catch (e) { items.push({ n: s.n, err: String(e).slice(0, 80) }); }
  }
  const set = (pr, u, t, w, h, pw, ph) => { gl.useProgram(pr); gl.uniform2f(u.u_resolution, w, h); gl.uniform1f(u.u_time, t); for (const k of ["u_bass", "u_mid", "u_treble", "u_amplitude"]) gl.uniform1f(u[k], 0.3); if (u.u_preres) gl.uniform2f(u.u_preres, pw, ph); if (u.u_pre) gl.uniform1i(u.u_pre, 0); };
  let t = 37;
  const draw = (it) => {
    t += 0.016;
    if (it.PP) { gl.bindFramebuffer(gl.FRAMEBUFFER, it.fbo); gl.viewport(0, 0, it.pw, it.ph); set(it.PP, it.up, t, it.s.whole ? it.pw : W, it.s.whole ? it.ph : H, it.pw, it.ph); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, it.tex); }
    gl.viewport(0, 0, W, H); set(it.PM, it.um, t, W, H, it.pw, it.ph); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const measure = async (it) => {
    const qs = [];
    for (let f = 0; f < FRAMES; f++) {
      const q = tq.createQueryEXT(); tq.beginQueryEXT(tq.TIME_ELAPSED_EXT, q); draw(it); tq.endQueryEXT(tq.TIME_ELAPSED_EXT); qs.push(q);
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
    return ms.length ? ms[Math.floor(ms.length / 2)] : NaN;
  };
  for (const it of items) if (!it.err) await measure(it); // warm
  for (let r = 0; r < ROUNDS; r++) for (const it of items) if (!it.err) { const m = await measure(it); if (m < it.best) it.best = m; }
  return items.map((it) => [it.n, it.err ?? +it.best.toFixed(2)]);
}, { specs, W, H, FRAMES, ROUNDS });
const out = {};
for (const [n, v] of res) { out[n] = v; console.log(n.padEnd(22), v); }
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
await br.close();
