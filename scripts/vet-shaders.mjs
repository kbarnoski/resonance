#!/usr/bin/env node
// vet-shaders.mjs — OBJECTIVE shader vetting over the whole registry
// (Karel 2026-10-04: "your responsive shaders need to have variety as we
// have 100s of shaders"). Renders every registered fragment shader in a
// headed Chromium (real GPU) WebGL1 canvas at 512×320 with the app's
// uniforms, driven by a synthetic kinetic-EQ signal (beat-locked band
// envelopes + the same band time-dilation the visualizer applies), and
// measures per shader:
//   mean luma, black floor (p5), bright coverage (% px > 200),
//   temporal flicker (frame-to-frame mean-luma std, max jump, and
//   >10%-of-range swing reversals per second — WCAG 2.3.1 general flash),
//   motion (mean abs pixel delta — static shaders can't carry the
//   kinetic drive, which is TIME dilation), blank.
// Exclusions: global/pick-time blocklists, Geometry family (engine bans
// it at pick time), 3D + AI-only modes, Karel's banned ribbon/line
// shaders, mastered-exclusive leads, Ghost-only r-petals.
// Output: scripts/shader-vetting.json (+ contact sheet of passing ones
// in the scratch dir given by --sheet=<path>).
// Usage: node scripts/vet-shaders.mjs [--only=a,b] [--sheet=/path/sheet.png]
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? null;
const SHEET = process.argv.find((a) => a.startsWith("--sheet="))?.slice(8) ?? null;

const tmp = mkdtempSync(path.join(os.tmpdir(), "vet-"));
const outfile = path.join(ROOT, ".tmp-vet-registry.mjs"); // in-repo so externals resolve
await build({
  stdin: { contents: `export { SHADERS, MODE_META, MODES_3D, MODES_AI } from "@/lib/shaders"; export { SHADER_HUES } from "@/lib/shaders/shader-hues.generated"; export { PICKTIME_SHADER_BLOCKLIST } from "@/lib/journeys/journeys";`, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "esm", platform: "node", packages: "external", alias: { "@": path.join(ROOT, "src") }, outfile, logLevel: "silent",
});
const reg = await import(pathToFileURL(outfile).href);
(await import("node:fs")).rmSync(outfile, { force: true });

// GLOBAL_SHADER_BLOCKLIST is module-private — parse it from source.
const jsrc = readFileSync(path.join(ROOT, "src/lib/journeys/journeys.ts"), "utf8");
const gblock = jsrc.slice(jsrc.indexOf("const GLOBAL_SHADER_BLOCKLIST"), jsrc.indexOf("];", jsrc.indexOf("const GLOBAL_SHADER_BLOCKLIST")));
const GLOBAL = new Set([...gblock.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]));

export const BANNED_LINES = ["r-silk", "r3-dreamtendrils", "r3-spirittrails", "r3-wishtrails", "r3-ghostribbons", "r3-lightrivers", "r3-silkwind", "r3-stellarribbon", "r3-aurorastreams", "r3-magneticwisps", "r2-fibers", "r-tendrils", "r3-coronastreams", "r3-memoryflow",
  // line-family survivors the first pass let through (thin colored lines)
  "r3-underwatervines", "r3-seaweedsway", "synapse", "soma", "r3-arcdischarge"];
export const MASTERED_LEADS = ["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"];
const OTHER = ["r-petals", "snow", "rain", "night-rain", "deluge", // rain-family
  "aurora-borealis", "aurora-wave", "r3-auroradream"]; // aurora = Snowflake material only
// Karel's general verdicts recorded in memory/journeys.ts comments (not
// realm-scoped): moon shaders banned globally; "colored dots full
// screen" spore; full-screen rainbow ring washes; web-like shaders;
// concentric shockwave rings; full-color closers.
export const CONVICTED = ["selene", "blood-moon", "eclipse-ring", "spore", "r3-pulseringssoft", "r3-coralpulse", "umbra", "lichen", "nova", "halo", "catacomb-torch", "flux", "credo", "enzyme", "maelstrom", "vortex", "whorl", "r2-coral", "r2-sunsetcascade", "r-molten"];

// Rejected by Karel IN PERSON (2026-10-04) — overrides any metric pass.
export const KAREL_REJECTED = {
  chakra: "banded/lightened the screen in Ghost",
  redshift: "the concentric rings — \"that oval one\"",
  gnosis: "glowing oval sun in the tunnel",
  biolume: "built-in bass flash (bassFlash strobe)",
  coral: "bright white sparkle (\"dont use that bright white sparkle shader\")",
  "r3-balllightning": "bright white sparkle (\"dont use that bright white sparkle shader\")",
};
const meta = new Map(reg.MODE_META.map((m) => [m.mode, m]));
const excluded = {};
const candidates = [];
for (const mode of Object.keys(reg.SHADERS)) {
  if (ONLY && !ONLY.includes(mode)) continue;
  const m = meta.get(mode);
  const why =
    !m ? "not in MODE_META" :
    GLOBAL.has(mode) ? "GLOBAL_SHADER_BLOCKLIST" :
    reg.PICKTIME_SHADER_BLOCKLIST.has(mode) ? "PICKTIME_SHADER_BLOCKLIST" :
    m.category === "Geometry" ? "geometry family (pick-time ban)" :
    reg.MODES_3D.has(mode) ? "3D mode" : reg.MODES_AI.has(mode) ? "AI-only mode" :
    BANNED_LINES.includes(mode) ? "banned ribbon/line shader" :
    MASTERED_LEADS.includes(mode) ? "mastered-exclusive lead" :
    OTHER.includes(mode) ? "ghost-only / banned material" :
    CONVICTED.includes(mode) ? "Karel-convicted (recorded verdict)" : null;
  if (why) excluded[mode] = why; else candidates.push(mode);
}
console.log(`registry ${Object.keys(reg.SHADERS).length} · candidates ${candidates.length} · excluded ${Object.keys(excluded).length}`);

const VS = "attribute vec2 a_position; void main(){ gl_Position = vec4(a_position,0.0,1.0); }";
const html = `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="512" height="320"></canvas><canvas id="t" width="192" height="120"></canvas>
<script>
const SH = ${JSON.stringify(Object.fromEntries(candidates.map((m) => [m, reg.SHADERS[m]])))};
const c = document.getElementById("c"), gl = c.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
const tctx = document.getElementById("t").getContext("2d");
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
function compile(fs) {
  const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, ${JSON.stringify(VS)}); gl.compileShader(v);
  const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
  if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) return { err: gl.getShaderInfoLog(f) };
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return { err: gl.getProgramInfoLog(p) };
  return { p };
}
// Synthetic music: 120 bpm kick, swelling mid, busy treble; the BASS
// band profile's time dilation (0.30-2.30x, slewed) as in visualizer.tsx.
function drive(t) {
  const beat = (t * 2) % 1, kick = Math.exp(-beat * 6);
  const bass = 0.35 + 0.55 * kick * (0.7 + 0.3 * Math.sin(t * 0.7));
  const mid = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.3)) + 0.1 * kick;
  const treble = 0.2 + 0.3 * Math.abs(Math.sin(t * 9.1) * Math.sin(t * 3.7));
  return { bass, mid, treble, eq: Math.min(1, Math.max(0.05, 0.5 + (kick - 0.3) * 0.9)) };
}
window.vet = (mode) => {
  const r = compile(SH[mode]); if (r.err) return { mode, error: r.err.slice(0, 200) };
  const p = r.p; gl.useProgram(p);
  const loc = gl.getAttribLocation(p, "a_position"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(p, n);
  const uT = U("u_time"), uR = U("u_resolution"), uB = U("u_bass"), uM = U("u_mid"), uTr = U("u_treble"), uA = U("u_amplitude");
  const rb = new Uint8Array(512 * 320 * 4); const FPS = 20, N = 80; let cum = 3.0, rate = 1; const means = [], frames = []; let p5s = [], p99s = [], maxs = [], brights = [], thumb = null;
  for (let k = 0; k < N; k++) {
    const t = k / FPS, d = drive(t);
    rate += (0.30 + d.eq * 2.0 - rate) * 0.3; cum += rate / FPS;
    gl.viewport(0, 0, 512, 320);
    gl.uniform1f(uT, cum); gl.uniform2f(uR, 512, 320);
    gl.uniform1f(uB, d.bass * 0.85); gl.uniform1f(uM, d.mid * 0.85); gl.uniform1f(uTr, d.treble * 0.85); gl.uniform1f(uA, d.eq * 0.85);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Full-res read (tiny particles vanish in a downsample), every 2nd px,
    // percentiles from a 256-bin histogram.
    gl.readPixels(0, 0, 512, 320, gl.RGBA, gl.UNSIGNED_BYTE, rb);
    const L = new Float32Array(256 * 160), hist = new Uint32Array(256);
    let sum = 0, br = 0, j = 0;
    for (let y = 0; y < 320; y += 2) for (let x = 0; x < 512; x += 2) { const i = (y * 512 + x) * 4; const l = 0.2126 * rb[i] + 0.7152 * rb[i + 1] + 0.0722 * rb[i + 2]; L[j++] = l; sum += l; if (l > 200) br++; hist[Math.min(255, l | 0)]++; }
    means.push(sum / L.length); brights.push(br / L.length);
    const pct = (q) => { let acc = 0, tgt = q * L.length; for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= tgt) return b; } return 255; };
    p5s.push(pct(0.05)); p99s.push(pct(0.999)); maxs.push(pct(1));
    if (k % 10 === 0) frames.push(L);
    if (k === 40) { tctx.drawImage(c, 0, 0, 192, 120); thumb = document.getElementById("t").toDataURL("image/jpeg", 0.8); }
  }
  const mean = means.reduce((a, b) => a + b, 0) / N;
  const std = Math.sqrt(means.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
  let maxJump = 0; for (let k = 1; k < N; k++) maxJump = Math.max(maxJump, Math.abs(means[k] - means[k - 1]));
  // WCAG-ish: count opposing swings ≥ 25.5 (10% of range) — flashes/sec
  let swings = 0, lastExt = means[0], dir = 0;
  for (let k = 1; k < N; k++) { const dlt = means[k] - lastExt; if (Math.abs(dlt) >= 25.5) { const nd = Math.sign(dlt); if (nd !== dir) { swings++; dir = nd; } lastExt = means[k]; } else if (Math.sign(means[k] - means[k - 1]) === dir) lastExt = means[k]; }
  const flashesPerSec = swings / 2 / (N / FPS);
  let motion = 0; for (let f = 1; f < frames.length; f++) { let dd = 0; for (let i = 0; i < frames[f].length; i++) dd += Math.abs(frames[f][i] - frames[f - 1][i]); motion += dd / frames[f].length; }
  motion /= frames.length - 1;
  const p99 = p99s.reduce((a, b) => a + b, 0) / N; const pmax = maxs.reduce((a, b) => a + b, 0) / N; const p5 = p5s.reduce((a, b) => a + b, 0) / N, bright = brights.reduce((a, b) => a + b, 0) / N;
  gl.deleteProgram(p);
  return { mode, mean: +mean.toFixed(1), p5: +p5.toFixed(1), p99: +p99.toFixed(1), max: +pmax.toFixed(1), bright: +(bright * 100).toFixed(2), lumaStd: +std.toFixed(2), maxJump: +maxJump.toFixed(1), flashesPerSec: +flashesPerSec.toFixed(2), motion: +motion.toFixed(2), thumb, series: means.map((x) => +x.toFixed(2)) };
};
</script></body></html>`;
const htmlPath = path.join(tmp, "vet.html");
writeFileSync(htmlPath, html);

const browser = await chromium.launch({ headless: false, args: ["--window-size=900,500"] });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href);
  for (const [i, mode] of candidates.entries()) {
    const r = await page.evaluate((m) => window.vet(m), mode).catch((e) => ({ mode, error: String(e).slice(0, 200) }));
    results.push(r);
    if (i % 25 === 0) console.log(`  ${i}/${candidates.length} ${mode}`);
  }
} finally { await browser.close(); }

// ── BRIGHTNESS-NORMALIZED LAYERS (Karel 2026-10-05: "the pool of
// shaders used in expansion journeys seems super limited ... create a
// solution that ensures there is true diversity"). The single-layer
// darkness cap (support mean <= 25, black floor <= 6) cut the pool,
// because three screen-blended layers washed the blacks. Instead each
// shader gets an OPACITY GAIN that brings it down to the target; a
// layer at opacity g over black scales every byte by g (luma, black
// floor and frame-to-frame jumps all scale linearly), so the gained
// metrics are exact. Applied on screen to Expansion kinetic layers
// only (src/lib/shaders/shader-gain.generated.ts). A shader that needs
// less than GAIN_MIN to fit is a wash, not a voice — still excluded.
export const SUPPORT_TARGET = { mean: 25, p5: 6 };
export const LEAD_TARGET = { mean: 45, p5: 10 };
export const GAIN_MIN = 0.35;
const gainTo = (r, t) => Math.min(1, t.mean / Math.max(r.mean, 0.01), t.p5 / Math.max(r.p5, 0.01));
function flashesAt(series, g) {
  let swings = 0, lastExt = series[0] * g, dir = 0;
  for (let k = 1; k < series.length; k++) { const x = series[k] * g; const dlt = x - lastExt; if (Math.abs(dlt) >= 25.5) { const nd = Math.sign(dlt); if (nd !== dir) { swings++; dir = nd; } lastExt = x; } else if (Math.sign(x - series[k - 1] * g) === dir) lastExt = x; }
  return swings / 2 / (series.length / 20);
}
function gainedVerdict(r, hardReasons) {
  if (r.error || hardReasons.length) return { gain: null, leadGain: null, gainedPass: false, gainedReasons: hardReasons };
  const gs = gainTo(r, SUPPORT_TARGET), gl = gainTo(r, LEAD_TARGET);
  const reasons = [];
  if (gs < GAIN_MIN) reasons.push(`wash even at gain ${GAIN_MIN} (needs ${gs.toFixed(2)})`);
  const g = Math.max(GAIN_MIN, gs);
  const jump = r.maxJump * g, fps = r.series ? flashesAt(r.series, g) : r.flashesPerSec * g;
  if (jump > 25.5 || fps > 3) reasons.push(`flicker at gain ${g.toFixed(2)} (jump ${jump.toFixed(1)}, ${fps.toFixed(2)}/s)`);
  return { gain: +Math.min(1, g).toFixed(3), leadGain: +Math.max(GAIN_MIN, Math.min(1, gl)).toFixed(3), gainedPass: reasons.length === 0, gainedReasons: reasons };
}

// Verdicts
const verdicts = {};
const thumbs = {};
for (const r of results) {
  const reasons = [];
  if (KAREL_REJECTED[r.mode]) reasons.push(`karelRejected: ${KAREL_REJECTED[r.mode]}`);
  if (r.error) reasons.push("compile error");
  else {
    if (r.max < 30) reasons.push(`blank (peak luma ${r.max})`);
    if (r.p5 > 15) reasons.push(`full-frame wash (black floor ${r.p5})`);
    if (r.mean > 70) reasons.push(`full-frame wash (mean ${r.mean})`);
    if (r.maxJump > 25.5 || r.flashesPerSec > 3) reasons.push(`flicker (jump ${r.maxJump}, ${r.flashesPerSec}/s)`);
    if (r.motion / Math.max(r.mean, 1) < 0.015) reasons.push(`static (motion ${r.motion}) — can't carry the kinetic time drive`);
  }
  const { thumb, series, ...stats } = r;
  if (thumb) thumbs[r.mode] = thumb;
  // Hard failures no gain can fix: rejection, compile, blank, static.
  const hard = reasons.filter((x) => !x.startsWith("full-frame wash") && !x.startsWith("flicker"));
  verdicts[r.mode] = { pass: reasons.length === 0, reasons, hue: reg.SHADER_HUES[r.mode] ?? "neutral", category: meta.get(r.mode)?.category, ...stats, ...gainedVerdict(r, hard) };
}
const pass = Object.entries(verdicts).filter(([, v]) => v.pass).map(([m]) => m).sort();
// THE POOL: everything that passes floor/mean/flicker WITH its gain.
const pool = Object.entries(verdicts).filter(([, v]) => v.gainedPass).map(([m]) => m).sort();
const out = { generated: new Date().toISOString(), method: "headed Chromium WebGL1 512x320, 80 frames @20fps synthetic 120bpm kinetic drive (bass time-dilation 0.30-2.30x), luma on full-res every-2nd-px sample; 'p99' = 99.9th percentile (peak of the contained forms)", thresholds: { washBlackFloorP5: 15, washMean: 70, flickerMaxJump: 25.5, flickerFlashesPerSec: 3, staticRelMotion: 0.015, blankPeakLuma: 30 }, gain: { supportTarget: SUPPORT_TARGET, leadTarget: LEAD_TARGET, min: GAIN_MIN, note: "gain = clamp(min(target.mean/mean, target.p5/p5), GAIN_MIN, 1); 'pool' = passes floor/mean/flicker WITH its support gain" }, counts: { registry: Object.keys(reg.SHADERS).length, excluded: Object.keys(excluded).length, tested: results.length, pass: pass.length, pool: pool.length }, pass, pool, excluded, verdicts };
if (!ONLY) writeFileSync(path.join(ROOT, "scripts/shader-vetting.json"), JSON.stringify(out, null, 1));
if (ONLY) for (const m of Object.keys(verdicts)) { const { thumb, ...v } = verdicts[m]; console.log(m, JSON.stringify(v)); }
console.log(`tested ${results.length} · PASS ${pass.length} (raw) · POOL ${pool.length} (with gain) · fail ${results.length - pass.length}`);

if (SHEET) {
  const b2 = await chromium.launch();
  const pg = await b2.newPage({ viewport: { width: 1600, height: 200 } });
  const cells = pass.map((m) => `<div style="display:inline-block;width:192px;margin:2px;font:11px sans-serif;color:#ddd"><img src="${thumbs[m]}" width="192" height="120"><br>${m} · ${verdicts[m].hue} · μ${verdicts[m].mean}</div>`).join("");
  await pg.setContent(`<body style="margin:0;background:#202020;width:1600px">${cells}</body>`);
  await pg.screenshot({ path: SHEET, fullPage: true });
  await b2.close();
  console.log(`sheet -> ${SHEET}`);
}
