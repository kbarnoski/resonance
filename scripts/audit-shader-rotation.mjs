#!/usr/bin/env node
// audit-shader-rotation.mjs — which shaders are BIG ROTATING SWIRLS? (2026-10-11)
//
// Karel (Rattler 2, r3-fernunfurl finale): "big swirling shaders that rotate
// and react to the sound ... makes it feel like a glitch instead of
// intentional" / "its ok to have that shader ... just wouldnt want them
// glitching to music". The kinetic clock rides the music 0.08x-2.9x — on a
// texture that reads as flow, on a whole-frame rotation it reads as the
// frame lurching. This finds the rotators so they can run on a steady clock.
//
// Method: render each shader headless (SwiftShader, 192x108) at three times,
// frame pairs dt apart; resample both frames to polar coordinates around the
// centre and find the angular shift that best maps one onto the other.
// ROTATOR = the best shift explains >= EXPLAIN of the frame change and turns
// >= MIN_DEG deg/s, in >= 2 of 3 samples.
//
// Usage: nice -n 19 node scripts/audit-shader-rotation.mjs [--only=a,b] [--out=file.json]
import { build } from "esbuild";
import { chromium } from "playwright";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const ROOT = process.cwd();
const ONLY = arg("only", null)?.split(",") ?? null;
const OUT = arg("out", path.join(os.tmpdir(), "shader-rotation.json"));
const W = 192, H = 108, DT = 1.0, TIMES = [8, 37, 83];
const EXPLAIN = +arg("explain", 0.55), MIN_DEG = +arg("mindeg", 3);

const outfile = path.join(ROOT, ".tmp-rot-registry.mjs");
await build({
  stdin: { contents: `export { SHADERS } from "@/lib/shaders";`, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "esm", platform: "node", packages: "external", alias: { "@": path.join(ROOT, "src") }, outfile, logLevel: "silent",
});
const reg = await import(pathToFileURL(outfile).href + "?" + Date.now());
rmSync(outfile, { force: true });
const modes = Object.keys(reg.SHADERS).filter((m) => !ONLY || ONLY.includes(m));

const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.setContent(`<canvas id="c" width="${W}" height="${H}"></canvas>`);
await page.evaluate(({ W, H }) => {
  const c = document.getElementById("c");
  const gl = c.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const VS = "attribute vec2 a_position; void main(){ gl_Position = vec4(a_position,0.0,1.0); }";
  const NR = 32, NA = 360; // log-spaced radii x angles (1 deg)
  window.rot = (fs, times, dt) => {
    const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, VS); gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
    if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) return { err: gl.getShaderInfoLog(f).slice(0, 200) };
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    gl.useProgram(p);
    const loc = gl.getAttribLocation(p, "a_position"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (k) => gl.getUniformLocation(p, k);
    gl.viewport(0, 0, W, H); gl.uniform2f(U("u_resolution"), W, H);
    for (const k of ["u_bass", "u_mid", "u_treble", "u_amplitude"]) gl.uniform1f(U(k), 0.3);
    const px = new Uint8Array(W * H * 4);
    const polar = (t) => {
      gl.uniform1f(U("u_time"), t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const P = new Float32Array(NR * NA), cx = W / 2, cy = H / 2, R = H / 2 - 1;
      for (let r = 0; r < NR; r++) for (let a = 0; a < NA; a++) {
        const rr = R * Math.pow(0.08, 1 - (r + 0.5) / NR), th = (a / NA) * 2 * Math.PI; // log-polar: a zoom is a radial shift
        const x = Math.round(cx + rr * Math.cos(th)), y = Math.round(cy + rr * Math.sin(th));
        const i = (y * W + x) * 4; P[r * NA + a] = (px[i] + px[i + 1] + px[i + 2]) / 3;
      }
      return P;
    };
    const out = [];
    for (const t of times) {
      const A = polar(t), B = polar(t + dt);
      // best (angle, log-radius) shift: rotation and/or outward drift of the arms
      const err = (k, q) => { let s = 0, n = 0; for (let r = Math.max(0, q); r < Math.min(NR, NR + q); r++) for (let a = 0; a < NA; a++) { const d = A[(r - q) * NA + ((a - k + NA) % NA)] - B[r * NA + a]; s += d * d; n++; } return s / n; };
      const e0 = err(0, 0); let best = 0, bq = 0, eb = e0;
      for (let k = -45; k <= 45; k++) for (let q = -4; q <= 4; q++) { if (!k && !q) continue; const e = err(k, q); if (e < eb) { eb = e; best = k; bq = q; } }
      out.push({ t, e0: +e0.toFixed(2), explained: e0 > 1 ? +(1 - eb / e0).toFixed(2) : 0, degPerSec: +(best / dt).toFixed(1), zoom: bq });
    }
    gl.deleteProgram(p);
    return { samples: out };
  };
}, { W, H });

const results = {};
for (const m of modes) {
  const r = await page.evaluate(([fs, times, dt]) => window.rot(fs, times, dt), [reg.SHADERS[m], TIMES, DT]);
  const hits = (r.samples ?? []).filter((s) => s.explained >= EXPLAIN && (Math.abs(s.degPerSec) >= MIN_DEG || s.zoom !== 0)).length;
  results[m] = { ...r, rotator: hits >= 2 };
  if (results[m].rotator) console.log(`ROTATOR ${m.padEnd(24)} ${r.samples.map((s) => `${s.explained}@${s.degPerSec}°/s z${s.zoom}`).join("  ")}`);
}
await browser.close();
writeFileSync(OUT, JSON.stringify(results, null, 1));
const rot = Object.keys(results).filter((m) => results[m].rotator);
console.log(`\n${rot.length}/${modes.length} rotators. wrote ${OUT}\n${JSON.stringify(rot)}`);
