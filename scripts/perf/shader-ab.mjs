// Shader JSON maps come from dump-shaders.ts, bundled and run in each tree:
//   npx esbuild scripts/perf/dump-shaders.ts --bundle --platform=node --format=esm --outfile=/tmp/dump.mjs && node /tmp/dump.mjs after.json
// (the same in a checkout of the base ref gives before.json).
// A/B a rewritten shader against the original: GPU ms per frame at kiosk
// shader resolution + per-pixel difference of the rendered frames (8-bit).
// Either side may carry a low-res prepass (`<name>::pre` + `<name>::scale`),
// run exactly as the visualizer runs it.
// node shader-ab.mjs before.json after.json name[,name] [W H]
import { chromium } from "playwright";
import fs from "node:fs";
const A = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const Bm = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const names = process.argv[4].split(",");
const W = Number(process.argv[5] ?? 2268), H = Number(process.argv[6] ?? 1473);
const TIMES = (process.env.TIMES ?? "37,123.4,611.7,2400.3").split(",").map(Number);
const br = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const p = await br.newPage();
for (const n of names) {
  await p.setContent("<canvas></canvas>");
  const side = (M) => ({ main: M[n], pre: M[`${n}::pre`] ?? null, scale: M[`${n}::scale`] ?? 0, size: M[`${n}::size`] ?? null, nearest: !!M[`${n}::nearest`] });
  const r = await p.evaluate(({ a, b, W, H, TIMES }) => {
    const c = document.querySelector("canvas"); c.width = W; c.height = H;
    const gl = c.getContext("webgl", { antialias: true, preserveDrawingBuffer: true });
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, "attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.0,1.0);}"); gl.compileShader(vs);
    const mk = (src) => {
      const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, src); gl.compileShader(fs);
      const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.bindAttribLocation(pr, 0, "a_position"); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getShaderInfoLog(fs));
      return pr;
    };
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const build = (s) => {
      const o = { main: mk(s.main), pre: s.pre ? mk(s.pre) : null, scale: s.scale };
      if (o.pre) {
        o.pw = s.size ? s.size[0] : Math.max(1, Math.round(W * s.scale)); o.ph = s.size ? s.size[1] : Math.max(1, Math.round(H * s.scale));
        o.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, o.tex);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, s.nearest ? gl.NEAREST : gl.LINEAR], [gl.TEXTURE_MAG_FILTER, s.nearest ? gl.NEAREST : gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, o.pw, o.ph, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        o.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, o.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, o.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      return o;
    };
    const P = [build(a), build(b)];
    const setU = (pr, t, au, extra) => {
      gl.useProgram(pr);
      const cache = (pr.__u ??= {}); const u = (k) => (k in cache ? cache[k] : (cache[k] = gl.getUniformLocation(pr, k)));
      gl.uniform2f(u("u_resolution"), W, H); gl.uniform1f(u("u_time"), t);
      gl.uniform1f(u("u_bass"), au[0]); gl.uniform1f(u("u_mid"), au[1]); gl.uniform1f(u("u_treble"), au[2]); gl.uniform1f(u("u_amplitude"), au[3]);
      if (extra) extra(u);
    };
    const frame = (o, t, au) => {
      if (o.pre) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, o.fbo); gl.viewport(0, 0, o.pw, o.ph);
        setU(o.pre, t, au, (u) => gl.uniform2f(u("u_preres"), o.pw, o.ph));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, o.tex);
      }
      setU(o.main, t, au, (u) => { const l = u("u_pre"); if (l) gl.uniform1i(l, 0); });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    gl.viewport(0, 0, W, H);
    const px = new Uint8Array(4);
    const timeIt = (o) => { const ms = []; for (let rep = 0; rep < 5; rep++) { const t0 = performance.now(); for (let i = 0; i < 6; i++) frame(o, 50 + i * 0.016, [0.3, 0.25, 0.2, 0.28]); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms.push((performance.now() - t0) / 6); } ms.sort((x, y) => x - y); return +ms[1].toFixed(2); };
    timeIt(P[0]); timeIt(P[1]);
    const ra = [], rb = [];
    for (let k = 0; k < 8; k++) { ra.push(timeIt(P[0])); rb.push(timeIt(P[1])); }
    ra.sort((x, y) => x - y); rb.sort((x, y) => x - y);
    const msA = ra[1], msB = rb[1];
    const grab = (o, t, au) => { frame(o, t, au); const d = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, d); return d; };
    const AU = [[0.3, 0.25, 0.2, 0.28], [0.8, 0.6, 0.7, 0.5], [0.05, 0.1, 0.9, 0.1], [0.42, 0.33, 0.21, 0.3]];
    const diffs = [];
    TIMES.forEach((t, ti) => {
      const au = AU[ti % AU.length];
      const x = grab(P[0], t, au), y = grab(P[1], t, au);
      let max = 0, n1 = 0, n2 = 0, sum = 0, lumA = 0;
      for (let i = 0; i < x.length; i++) { if ((i & 3) === 3) continue; const d = Math.abs(x[i] - y[i]); sum += d; lumA += x[i]; if (d > max) max = d; if (d > 1) n1++; if (d > 2) n2++; }
      diffs.push({ t, max, gt1: n1, gt2: n2, meanDiff: +(sum / (W * H * 3)).toFixed(4), meanA: +(lumA / (W * H * 3)).toFixed(2) });
    });
    return { msA, msB, diffs };
  }, { a: side(A), b: side(Bm), W, H, TIMES });
  console.log(n.padEnd(18), `before ${r.msA}ms  after ${r.msB}ms`, r.diffs.map((d) => `t${d.t}: max${d.max} >1:${d.gt1} >2:${d.gt2} mean${d.meanDiff} (lum ${d.meanA})`).join(" | "));
}
await br.close();
