#!/usr/bin/env node
// film-shaders.mjs — audition clips for shaders (SUN lab, 2026-10-12).
// Renders each registered shader full-frame at 1280×720 in a HEADED
// Chromium (real GPU, like scripts/vet-shaders.mjs) with a synthetic
// gentle audio drive, screen-blended (as the app composites shader
// layers) over BLACK and over sample stills, recording each with
// Playwright recordVideo → mp4 via ffmpeg-static.
//
//   node scripts/film-shaders.mjs --only=sun-corona,seraph --out=/abs/dir
//        [--bg=/abs/a.jpg,/abs/b.jpg] [--secs=8] [--stills]
//
// --stills: no video — writes <out>/stills.png, a grid of each shader
// over black at t = 6 / 24 / 48 s (fast iteration on the look).
import { build } from "esbuild";
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readdirSync, rmSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ONLY = arg("only")?.split(",") ?? null;
const OUT = arg("out");
const SECS = Number(arg("secs") ?? 8);
const STILLS = process.argv.includes("--stills");
const BGS = arg("bg")?.split(",").filter(Boolean) ?? [];
if (!ONLY || !OUT) { console.error("usage: --only=a,b --out=/abs/dir [--bg=..] [--secs=8] [--stills]"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const regFile = path.join(ROOT, ".tmp-film-registry.mjs");
await build({
  stdin: { contents: `export { SHADERS } from "@/lib/shaders";`, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "esm", platform: "node", packages: "external", alias: { "@": path.join(ROOT, "src") }, outfile: regFile, logLevel: "silent",
});
const reg = await import(pathToFileURL(regFile).href);
rmSync(regFile, { force: true });
const missing = ONLY.filter((m) => !reg.SHADERS[m]);
if (missing.length) { console.error("not registered:", missing); process.exit(1); }

const VS = "attribute vec2 a_position; void main(){ gl_Position = vec4(a_position,0.0,1.0); }";
// Gentle drive: a 72 bpm soft pulse under slow swells — a quiet piano
// passage, not the vetting rig's 120 bpm kick. Same band names/scale as
// the app's uniforms (0..~0.85).
const DRIVE = `function drive(t) {
  const beat = (t * 1.2) % 1, pulse = Math.exp(-beat * 4);
  const bass = 0.25 + 0.18 * pulse * (0.6 + 0.4 * Math.sin(t * 0.31));
  const mid = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.47)) + 0.05 * pulse;
  const treble = 0.15 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.9) * Math.sin(t * 0.7));
  const amp = 0.35 + 0.15 * (0.5 + 0.5 * Math.sin(t * 0.23)) + 0.08 * pulse;
  return { bass, mid, treble, amp };
}`;
const GL_SETUP = `
function makeGL(canvas) {
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  return gl;
}
function program(gl, fs) {
  const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, ${JSON.stringify(VS)}); gl.compileShader(v);
  const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
  if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(f));
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  gl.useProgram(p);
  const loc = gl.getAttribLocation(p, "a_position"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(p, n);
  const u = { t: U("u_time"), r: U("u_resolution"), b: U("u_bass"), m: U("u_mid"), tr: U("u_treble"), a: U("u_amplitude") };
  return (time, w, h, d) => {
    gl.viewport(0, 0, w, h);
    gl.uniform1f(u.t, time); gl.uniform2f(u.r, w, h);
    gl.uniform1f(u.b, d.bass); gl.uniform1f(u.m, d.mid); gl.uniform1f(u.tr, d.treble); gl.uniform1f(u.a, d.amp);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}`;

const browser = await chromium.launch({ headless: false, args: ["--window-size=1320,800"] });
try {
  if (STILLS) {
    const TIMES = [6, 24, 48];
    const W = 480, H = 270;
    const page = await browser.newPage({ viewport: { width: 1500, height: 300 * ONLY.length + 20 } });
    const html = `<!doctype html><html><body style="margin:0;background:#151515;font:13px sans-serif;color:#ccc">
<canvas id="g" width="${W}" height="${H}" style="display:none"></canvas><div id="grid"></div>
<script>${DRIVE}${GL_SETUP}
const SH = ${JSON.stringify(Object.fromEntries(ONLY.map((m) => [m, reg.SHADERS[m]])))};
const gl = makeGL(document.getElementById("g"));
for (const m of Object.keys(SH)) {
  const row = document.createElement("div"); row.style.margin = "4px";
  row.innerHTML = "<div>" + m + "</div>"; document.getElementById("grid").appendChild(row);
  let draw; try { draw = program(gl, SH[m]); } catch (e) { row.innerHTML += "<pre>" + e.message + "</pre>"; continue; }
  for (const t of ${JSON.stringify(TIMES)}) {
    draw(3 + t, ${W}, ${H}, drive(t));
    const c = document.createElement("canvas"); c.width = ${W}; c.height = ${H}; c.style.marginRight = "6px";
    c.getContext("2d").drawImage(document.getElementById("g"), 0, 0); row.appendChild(c);
  }
}
</script></body></html>`;
    const hp = path.join(OUT, "stills.html");
    writeFileSync(hp, html);
    await page.goto(pathToFileURL(hp).href);
    await page.screenshot({ path: path.join(OUT, "stills.png"), fullPage: true });
    rmSync(hp, { force: true });
    console.log(`stills -> ${path.join(OUT, "stills.png")}`);
  } else {
    const ffmpeg = createRequire(import.meta.url)("ffmpeg-static");
    const clipsDir = path.join(OUT, "clips");
    mkdirSync(clipsDir, { recursive: true });
    const backs = [{ name: "black", url: null }, ...BGS.map((b) => ({ name: path.basename(path.dirname(b)).slice(0, 12) + "-" + path.basename(b, path.extname(b)), url: pathToFileURL(b).href }))];
    for (const mode of ONLY) {
      for (const bg of backs) {
        const vidDir = path.join(OUT, ".rec");
        rmSync(vidDir, { recursive: true, force: true });
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: vidDir, size: { width: 1280, height: 720 } } });
        const page = await ctx.newPage();
        const html = `<!doctype html><html><body style="margin:0;background:#000;overflow:hidden">
${bg.url ? `<img src="${bg.url}" style="position:absolute;inset:0;width:1280px;height:720px;object-fit:cover">` : ""}
<canvas id="c" width="1280" height="720" style="position:absolute;inset:0;mix-blend-mode:screen"></canvas>
<script>${DRIVE}${GL_SETUP}
const gl = makeGL(document.getElementById("c"));
const draw = program(gl, ${JSON.stringify(reg.SHADERS[mode])});
let t0 = null;
function frame(now) { if (t0 === null) t0 = now; const t = (now - t0) / 1000; draw(3 + t, 1280, 720, drive(t)); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
</script></body></html>`;
        const hp = path.join(OUT, `.film-${mode}.html`);
        writeFileSync(hp, html);
        await page.goto(pathToFileURL(hp).href);
        await page.waitForTimeout(SECS * 1000 + 400);
        const video = page.video();
        await ctx.close();
        const webm = await video.path();
        const mp4 = path.join(clipsDir, `${mode}__${bg.name}.mp4`);
        // drop the first 0.4 s (page/compile settle)
        execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", "0.4", "-i", webm, "-t", String(SECS), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", mp4]);
        rmSync(hp, { force: true });
        rmSync(vidDir, { recursive: true, force: true });
        console.log(`  ${path.basename(mp4)}`);
      }
    }
  }
} finally { await browser.close(); }
