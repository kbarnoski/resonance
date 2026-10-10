#!/usr/bin/env node
// audit-angle-seams.mjs — atan branch-cut seam audit (2026-10-10, kiosk film:
// maelstrom's straight line on the left half of the centre line).
// Renders every registered shader that calls atan() twice in headless
// Chromium (SwiftShader, 320x200, t = 0 / 7.3 / 31.1, audio uniforms 0.3):
// once as written and once with atan's cut moved to +x (range 0..2π).
// Properly 2π-periodic shaders render identically (altDiff ~ 0); anything
// else differs, and the seam ratio (left-centre-line straddle diff vs the
// right side / nearby rows) shows how visible the cut is for centred ones.
// Fix with withAngleSeamBlend() (src/lib/shaders/angle-seam.ts) or verify
// and allowlist in angle-seam.test.ts. LOCK = mastered Snowflake/Ghost roster.
// Usage: node scripts/audit-angle-seams.mjs [--only=a,b] [--out=file.json] [--png=dir]
import { build } from "esbuild";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = process.cwd();
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? null;
const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? path.join((await import("node:os")).tmpdir(), "angle-seams.json");
const SRC = process.argv.find((a) => a.startsWith("--src="))?.slice(6) ?? null; // optional JSON {mode: src} override (baseline compare)
const outfile = path.join(ROOT, ".tmp-seam-registry.mjs"); // in-repo so externals resolve
await build({
  stdin: { contents: `export { SHADERS } from "@/lib/shaders"; export { JOURNEYS, RECAST_SAFELIST } from "@/lib/journeys/journeys"; export { SCRIPTED_TAKES, TAKE_FINALE_SHADERS } from "@/lib/journeys/pinned-takes"; export { JOURNEY_CASTS } from "@/lib/journeys/journey-casts.generated";`, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "esm", platform: "node", packages: "external", alias: { "@": path.join(ROOT, "src") }, outfile, logLevel: "silent",
});
const reg = await import(pathToFileURL(outfile).href + "?" + Date.now());
(await import("node:fs")).rmSync(outfile, { force: true });
const locked = new Set(), pool = new Set();
for (const id of ["first-snow", "ghost"]) {
  for (const e of reg.SCRIPTED_TAKES[id] ?? []) if (e.mode) locked.add(e.mode);
  if (reg.TAKE_FINALE_SHADERS[id]) locked.add(reg.TAKE_FINALE_SHADERS[id]);
  const j = reg.JOURNEYS.find((x) => x.id === id);
  for (const m of reg.RECAST_SAFELIST[j.realmId] ?? []) locked.add(m);
  for (const p of j?.phases ?? []) for (const m of p.shaderModes ?? []) pool.add(m);
  const c = reg.JOURNEY_CASTS[id]; if (c) for (const arr of Object.values(c.cast)) arr.forEach((m) => locked.add(m));
}
const modes = Object.keys(reg.SHADERS).filter((m) => (ONLY ? ONLY.includes(m) : /\batan\s*\(/.test(reg.SHADERS[m])));
const SRCMAP = SRC ? JSON.parse((await import("node:fs")).readFileSync(SRC, "utf8")) : null;
const shaders = Object.fromEntries(modes.map((m) => [m, SRCMAP?.[m] ?? reg.SHADERS[m]]));
console.log(`atan modes: ${modes.length}; locked roster: ${[...locked].sort().join(",")}`);
const W = +(process.argv.find((a) => a.startsWith("--w="))?.slice(4) ?? 320), H = +(process.argv.find((a) => a.startsWith("--h="))?.slice(4) ?? 200);
const PNG = process.argv.find((a) => a.startsWith("--png="))?.slice(6) ?? null;
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.setContent(`<canvas id="c" width="${W}" height="${H}"></canvas>`);
await page.evaluate(({ W, H }) => {
  const c = document.getElementById("c"); const gl = c.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const VS = "attribute vec2 a_position; void main(){ gl_Position = vec4(a_position,0.0,1.0); }";
  function compile(fs) {
    const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, VS); gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
    if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) return { err: gl.getShaderInfoLog(f) };
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return { err: gl.getProgramInfoLog(p) };
    return { p };
  }
  window.render = (fs, times) => {
    const r = compile(fs); if (r.err) return { err: r.err.slice(0, 300) };
    const p = r.p; gl.useProgram(p);
    const loc = gl.getAttribLocation(p, "a_position"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(p, n);
    const frames = [];
    for (const t of times) {
      gl.viewport(0, 0, W, H);
      gl.uniform1f(U("u_time"), t); gl.uniform2f(U("u_resolution"), W, H);
      for (const n of ["u_bass", "u_mid", "u_treble", "u_amplitude"]) gl.uniform1f(U(n), 0.3);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      frames.push(Array.from(px)); if (window.wantPng) (window.pngs ||= []).push(c.toDataURL("image/png"));
    }
    gl.deleteProgram(p);
    const pngs = window.pngs; window.pngs = []; return { frames, pngs };
  };
}, { W, H });
// alt atan: branch cut moved to +x axis (range 0..2π). Same value for y>=0.
const ALT = `
float _sAtan(float y, float x) { return atan(-y, -x) + 3.14159265358979; }
vec2 _sAtan(vec2 y, vec2 x) { return atan(-y, -x) + 3.14159265358979; }
vec3 _sAtan(vec3 y, vec3 x) { return atan(-y, -x) + 3.14159265358979; }
float _sAtan(float x) { return atan(x); }
vec2 _sAtan(vec2 x) { return atan(x); }
`;
function altify(src) {
  const s = src.replace(/\batan\s*\(/g, "_sAtan(");
  const m = s.match(/precision\s+\w+\s+float\s*;/);
  if (!m) return ALT.replace(/^/, "precision highp float;\n") + s;
  const i = s.indexOf(m[0]) + m[0].length;
  return s.slice(0, i) + ALT + s.slice(i);
}
const TIMES = [0, 7.3, 31.1];
const lum = (f, i) => 0.2126 * f[i] + 0.7152 * f[i + 1] + 0.0722 * f[i + 2];
function rowPairDiff(f, y0, x0, x1) { let s = 0; for (let x = x0; x < x1; x++) { const a = (y0 * W + x) * 4, b = ((y0 + 1) * W + x) * 4; s += Math.abs(f[a] - f[b]) + Math.abs(f[a + 1] - f[b + 1]) + Math.abs(f[a + 2] - f[b + 2]); } return s / (3 * (x1 - x0)); }
const results = {};
for (const mode of modes) {
  if (PNG) await page.evaluate(() => { window.wantPng = true; });
  const o = await page.evaluate(([fs, t]) => window.render(fs, t), [shaders[mode], TIMES]);
  if (o.err) { results[mode] = { err: o.err }; console.log(mode, "ERR", o.err.slice(0, 120)); continue; }
  if (PNG) o.pngs?.forEach((u, k) => writeFileSync(`${PNG}/${mode}-${k}.png`, Buffer.from(u.split(',')[1], 'base64')));
  if (PNG) await page.evaluate(() => { window.wantPng = false; });
  const a = await page.evaluate(([fs, t]) => window.render(fs, t), [altify(shaders[mode]), TIMES]);
  if (a.err) { results[mode] = { altErr: a.err }; console.log(mode, "ALT ERR", a.err.slice(0, 160)); continue; }
  const per = TIMES.map((t, k) => {
    const f = o.frames[k], g = a.frames[k];
    let d = 0, dm = 0; for (let i = 0; i < f.length; i += 4) { const x = Math.abs(f[i] - g[i]) + Math.abs(f[i + 1] - g[i + 1]) + Math.abs(f[i + 2] - g[i + 2]); d += x; if (x > dm) dm = x; }
    const yc = H / 2 - 1; // rows yc,yc+1 straddle uv.y=0
    const L = rowPairDiff(f, yc, 4, W / 2 - 6), R = rowPairDiff(f, yc, W / 2 + 6, W - 4);
    const N = (rowPairDiff(f, yc - 5, 4, W / 2 - 6) + rowPairDiff(f, yc + 5, 4, W / 2 - 6)) / 2;
    const meanLum = (() => { let s = 0; for (let i = 0; i < f.length; i += 4) s += lum(f, i); return s / (W * H); })();
    return { t, altDiff: +(d / (3 * W * H)).toFixed(3), altMax: dm, L: +L.toFixed(2), R: +R.toFixed(2), N: +N.toFixed(2), ratio: +(L / Math.max((R + N) / 2, 0.25)).toFixed(2), meanLum: +meanLum.toFixed(1) };
  });
  if (process.argv.includes("--keep")) results[mode] = { frames: o.frames }; else results[mode] = { locked: locked.has(mode), pool: pool.has(mode), per, frames: process.argv.includes("--keep") ? o.frames : undefined };
  const mx = Math.max(...per.map((p) => p.ratio)), ad = Math.max(...per.map((p) => p.altDiff));
  console.log(`${mode.padEnd(22)} ${locked.has(mode) ? "LOCK" : pool.has(mode) ? "pool" : "    "} altDiff ${ad.toFixed(3).padStart(8)} seamRatio ${mx.toFixed(2).padStart(7)}  ${per.map((p) => `L${p.L}/R${p.R}/N${p.N}`).join(" ")}`);
}
await browser.close();
writeFileSync(OUT, JSON.stringify({ locked: [...locked], results }));
console.log(`wrote ${OUT}`);
