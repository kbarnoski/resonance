#!/usr/bin/env node
// audit-shader-time-wraps.mjs — periodic-time discontinuity audit (2026-10-10,
// kiosk film: supernova's big shockwave ring vanished in ONE frame while a
// tiny new ring appeared at the centre; elsewhere whole-frame darks/mids
// stepped ±3/255 in one frame — dim glow terms tied to fract()/mod() cycles
// resetting without an envelope).
//
// Renders every registered shader in headless Chromium (SwiftShader, tiny
// 96x54 canvas) at 30 fps over ~150 s of shader time with fixed audio
// uniforms, and flags any frame-to-frame change that is a DISCONTINUITY:
//   - MAD spike: mean-abs-diff (0..255, per channel) vs the previous frame
//     > RATIO x the median of its +-15 neighbours AND > MIN_MAD, or
//   - TILE spike: the same test on any of 8x6 tiles, > MIN_TILE (6/255)
//     (a small element vanishing — a local cut the frame MAD hides), or
//   Every candidate is then CONFIRMED by rendering 8 sub-frame steps
//   between the two frames: a true cut concentrates >= CONC (0.5) of the
//   change in one sub-step; fast continuous motion and pixel aliasing at
//   this tiny size spread it, and are dropped (counted as "soft").
//   - LUM step: |mean-luminance step| > 1.0/255 AND > RATIO x the neighbour
//     median of |steps| (an isolated step: the pace around it stays slow).
// The "sweep" pass holds time nearly still (5% speed) and ramps each of
// u_bass/u_mid/u_treble/u_amplitude 0 -> 1.0 -> 0 over 10 s, others at 0 (the kiosk
// slews uniforms <= 2.4/s; values are post-REACTIVITY 0.85), then all four:
// it catches hard thresholds on audio (step(k, u_bass), if (u_amp > k)...).
// Each event records time, magnitude, the neighbour median and whether the
// change is centred (centre third vs the rest of the frame).
// Fix by enveloping the cycling element to zero before the wrap (see
// src/lib/shaders/time-wrap.ts). LOCK = mastered Snowflake/Ghost roster.
//
// Usage: nice -n 19 node scripts/audit-shader-time-wraps.mjs
//   [--only=a,b] [--secs=150] [--fps=30] [--t0=0] [--audio=0.3|0|sine|sweep|slew|all|a,b]
//   [--out=file.json] [--md=file.md] [--src=overrides.json]
import { build } from "esbuild";
import { chromium } from "playwright";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const ROOT = process.cwd();
const ONLY = arg("only", null)?.split(",") ?? null;
const SECS = +arg("secs", 150), FPS = +arg("fps", 30), T0 = +arg("t0", 0); // --t0: start of the time window (long-running layers)
const W = 96, H = 54;
const CONC = +arg("conc", 0.5); // sub-frame concentration needed to call it a cut
const RATIO = +arg("ratio", 6), MIN_MAD = +arg("minmad", 2), MIN_LUM = +arg("minlum", 1.0), MIN_TILE = +arg("mintile", 6);
const OUT = arg("out", path.join(os.tmpdir(), "shader-time-wraps.json"));
const MD = arg("md", null);
const AUDIO = arg("audio", "0.3");
const SRCMAP = arg("src", null) ? JSON.parse(readFileSync(arg("src"), "utf8")) : null;

const outfile = path.join(ROOT, ".tmp-wrap-registry.mjs"); // in-repo so externals resolve
await build({
  stdin: { contents: `export { SHADERS } from "@/lib/shaders"; export { JOURNEYS, RECAST_SAFELIST } from "@/lib/journeys/journeys"; export { SCRIPTED_TAKES, TAKE_FINALE_SHADERS } from "@/lib/journeys/pinned-takes";`, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "esm", platform: "node", packages: "external", alias: { "@": path.join(ROOT, "src") }, outfile, logLevel: "silent",
});
const reg = await import(pathToFileURL(outfile).href + "?" + Date.now());
rmSync(outfile, { force: true });
const locked = new Set();
for (const id of ["first-snow", "ghost"]) {
  for (const e of reg.SCRIPTED_TAKES[id] ?? []) if (e.mode) locked.add(e.mode);
  if (reg.TAKE_FINALE_SHADERS[id]) locked.add(reg.TAKE_FINALE_SHADERS[id]);
  const j = reg.JOURNEYS.find((x) => x.id === id);
  for (const m of reg.RECAST_SAFELIST?.[j?.realmId] ?? []) locked.add(m);
}
const modes = Object.keys(reg.SHADERS).filter((m) => !ONLY || ONLY.includes(m));
console.log(`scanning ${modes.length} shaders, t0=${T0} ${SECS}s @ ${FPS}fps, ${W}x${H}, audio=${AUDIO}; locked: ${[...locked].sort().join(",")}`);

// Uniforms for (fractional) frame i of a pass — shared by the page scan and
// the sub-frame confirmation probe.
function UNI(audio, i, dt, t0) {
  if (audio === "sweep") {
    // Audio sweep: time crawls (5% speed) while each band in turn ramps
    // 0 -> 1.0 -> 0 over 10 s (others parked at 0 so segment boundaries
    // are continuous), then all four together. Catches hard thresholds.
    const seg = Math.min(4, Math.floor(i / 300)), k = (i - seg * 300) / 300;
    const ramp = 1.0 * (0.5 - 0.5 * Math.cos(k * 2 * Math.PI));
    const v = [0, 0, 0, 0];
    if (seg < 4) v[seg] = ramp; else v.fill(ramp);
    return [t0 + i * dt * 0.05, ...v];
  }
  const t = t0 + i * dt;
  if (audio === "slew") {
    // Kiosk transients: every band jumps between 0.1 and 0.5 every 2 s,
    // velocity-limited to 2.4 units/s like the kiosk's visible drive.
    // Catches phases that multiply u_time by an audio uniform (on a
    // long-running layer the phase leaps as the band moves).
    const T = 2, u = (i * dt) % T, rise = 0.4 / 2.4;
    const ph = Math.floor((i * dt) / T) % 2;
    const x = Math.min(1, u / rise), v = ph ? 0.5 - 0.4 * x : 0.1 + 0.4 * x;
    return [t, v, v, v, v];
  }
  const a = audio === "sine" ? 0.3 + 0.25 * Math.sin(t * 0.21) : +audio;
  return [t, a, a, a, a];
}
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.setContent(`<canvas id="c" width="${W}" height="${H}"></canvas>`);
await page.addInitScript(`window.uni = ${UNI.toString()};`);
await page.evaluate(`window.uni = ${UNI.toString()};`);
await page.evaluate(({ W, H, SWEEP_MAX }) => {
  const c = document.getElementById("c");
  const gl = c.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
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
  // 8x6 tiles: a small element vanishing is a big LOCAL change even when
  // the frame-wide MAD barely moves.
  const NT = 48, tileOf = new Uint8Array(W * H), tileN = new Float32Array(NT);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = Math.floor((y * 6) / H) * 8 + Math.floor((x * 8) / W); tileOf[y * W + x] = k; tileN[k]++; }
  const inCentre = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) inCentre[y * W + x] = x >= W / 3 && x < (2 * W) / 3 && y >= H / 3 && y < (2 * H) / 3 ? 1 : 0;
  // Returns per-frame metrics only (no pixels cross the bridge).
  window.scan = (fs, n, dt, audio, t0) => {
    const r = compile(fs); if (r.err) return { err: r.err.slice(0, 300) };
    const p = r.p; gl.useProgram(p);
    const loc = gl.getAttribLocation(p, "a_position"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (k) => gl.getUniformLocation(p, k);
    const uT = U("u_time"), uB = U("u_bass"), uM = U("u_mid"), uTr = U("u_treble"), uA = U("u_amplitude");
    gl.viewport(0, 0, W, H); gl.uniform2f(U("u_resolution"), W, H);
    let prev = new Uint8Array(W * H * 4), cur = new Uint8Array(W * H * 4);
    const mad = new Float32Array(n), madC = new Float32Array(n), madO = new Float32Array(n), lum = new Float32Array(n);
    const tile = new Float32Array(n * NT), tacc = new Float32Array(NT);
    for (let i = 0; i < n; i++) {
      const [t, ub, um, utr, ua] = window.uni(audio, i, dt, t0);
      gl.uniform1f(uT, t); gl.uniform1f(uB, ub); gl.uniform1f(uM, um); gl.uniform1f(uTr, utr); gl.uniform1f(uA, ua);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, cur);
      let s = 0, sc = 0, so = 0, l = 0, nc = 0; tacc.fill(0);
      for (let k = 0, q = 0; k < cur.length; k += 4, q++) {
        l += 0.2126 * cur[k] + 0.7152 * cur[k + 1] + 0.0722 * cur[k + 2];
        if (i === 0) continue;
        const d = Math.abs(cur[k] - prev[k]) + Math.abs(cur[k + 1] - prev[k + 1]) + Math.abs(cur[k + 2] - prev[k + 2]);
        s += d; if (inCentre[q]) { sc += d; nc++; } else so += d;
        tacc[tileOf[q]] += d;
      }
      lum[i] = l / (W * H);
      for (let k = 0; k < NT; k++) tile[i * NT + k] = tacc[k] / (3 * tileN[k]);
      mad[i] = s / (3 * W * H); madC[i] = sc / (3 * nc || 1); madO[i] = so / (3 * (W * H - nc));
      const tmp = prev; prev = cur; cur = tmp;
    }
    gl.deleteProgram(p);
    return { mad: Array.from(mad), madC: Array.from(madC), madO: Array.from(madO), lum: Array.from(lum), tile: Array.from(tile) };
  };
  // Sub-frame probe: render the given uniform sets, return successive
  // global and per-tile MADs (confirms a flagged step is a true cut).
  window.probe = (fs, sets) => {
    const r = compile(fs); if (r.err) return { err: r.err };
    const p = r.p; gl.useProgram(p);
    const loc = gl.getAttribLocation(p, "a_position"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (k) => gl.getUniformLocation(p, k);
    gl.viewport(0, 0, W, H); gl.uniform2f(U("u_resolution"), W, H);
    let prev = null; const out = [];
    for (const [t, b, m, tr, a] of sets) {
      gl.uniform1f(U("u_time"), t); gl.uniform1f(U("u_bass"), b); gl.uniform1f(U("u_mid"), m); gl.uniform1f(U("u_treble"), tr); gl.uniform1f(U("u_amplitude"), a);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const cur = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, cur);
      if (prev) {
        let s = 0; const tl = new Float32Array(NT);
        for (let k = 0, q = 0; k < cur.length; k += 4, q++) { const d = Math.abs(cur[k] - prev[k]) + Math.abs(cur[k + 1] - prev[k + 1]) + Math.abs(cur[k + 2] - prev[k + 2]); s += d; tl[tileOf[q]] += d; }
        out.push({ g: s / (3 * W * H), tl: Array.from(tl, (v, k) => v / (3 * tileN[k])) });
      }
      prev = cur;
    }
    gl.deleteProgram(p);
    return { out };
  };
}, { W, H, SWEEP_MAX: 1.0 });

const lbl = (e) => (e.band ? `${e.band}@${e.level}` : `${e.t}s`);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
function detect(m, dt, t0 = T0) {
  const n = m.mad.length, R = 15, ev = [];
  const dl = m.lum.map((v, i) => (i ? v - m.lum[i - 1] : 0));
  for (let i = 2; i < n; i++) {
    const nb = [], nbl = [];
    for (let j = Math.max(1, i - R); j <= Math.min(n - 1, i + R); j++) if (Math.abs(j - i) > 1) { nb.push(m.mad[j]); nbl.push(Math.abs(dl[j])); }
    const med = median(nb), medL = median(nbl);
    const madSpike = m.mad[i] > MIN_MAD && m.mad[i] > RATIO * Math.max(med, 0.05);
    const lumStep = Math.abs(dl[i]) > MIN_LUM && Math.abs(dl[i]) > RATIO * Math.max(medL, 0.05);
    // local (tile) spike: the worst tile vs its own neighbour median
    let tSpike = null;
    for (let k = 0; k < 48; k++) {
      const v = m.tile[i * 48 + k]; if (v <= MIN_TILE) continue;
      const nbt = []; for (let j = Math.max(1, i - R); j <= Math.min(n - 1, i + R); j++) if (Math.abs(j - i) > 1) nbt.push(m.tile[j * 48 + k]);
      const mt = median(nbt); if (v > RATIO * Math.max(mt, 0.1) && (!tSpike || v > tSpike.v)) tSpike = { k, v, mt };
    }
    if (!madSpike && !lumStep && !tSpike) continue;
    ev.push({ ...(tSpike ? { tile: tSpike.k, tileMad: +tSpike.v.toFixed(1), tileMed: +tSpike.mt.toFixed(2) } : {}), t: +(t0 + i * dt).toFixed(3), mad: +m.mad[i].toFixed(2), med: +med.toFixed(3), ratio: +(m.mad[i] / Math.max(med, 0.05)).toFixed(1),
      dLum: +dl[i].toFixed(2), centre: +m.madC[i].toFixed(2), outer: +m.madO[i].toFixed(2), kind: [madSpike && "mad", lumStep && "lum", tSpike && "tile"].filter(Boolean).join("+") });
  }
  return ev;
}

const passes = AUDIO === "all" ? ["0.3", "0", "sine", "sweep"] : AUDIO.split(",");
const dt = 1 / FPS, N = Math.round(SECS * FPS);
const frames = (a) => (a === "sweep" ? 1500 : N); // sweep: 5 x 10 s ramps
const results = {};
const t0 = Date.now();
for (const mode of modes) {
  const src = SRCMAP?.[mode] ?? reg.SHADERS[mode];
  const r = { locked: locked.has(mode), passes: {} };
  for (const a of passes) {
    const ts = Date.now();
    const m = await page.evaluate(([fs, n, dt, a, T0]) => window.scan(fs, n, dt, a, T0), [src, frames(a), dt, a, T0]);
    if (m.err) { r.err = m.err; break; }
    const ev = a === "sweep"
      ? detect(m, dt).map((e) => { const i = Math.round((e.t - T0) * FPS), seg = Math.floor(i / 300); return { ...e, t: undefined, frame: i, band: ["bass", "mid", "treble", "amplitude", "all"][seg], level: +(0.5 - 0.5 * Math.cos(((i % 300) / 300) * 2 * Math.PI)).toFixed(3) }; })
      : detect(m, dt);
    // Confirm each event with 8 sub-frame steps between frame i-1 and i: a
    // true cut puts most of the change in ONE sub-step (conc ~1); fast but
    // continuous motion / pixel aliasing spreads it (conc ~1/8..0.4).
    const SUB = 8;
    const sevOf = (e) => Math.max(e.mad, (e.tileMad ?? 0) / 8, Math.abs(e.dLum));
    const order = [...ev].sort((x, y) => sevOf(y) - sevOf(x));
    for (const e of order.slice(0, 40)) {
      const i = Math.round(((e.t ?? T0 + e.frame * dt) - T0) / dt);
      const sets = []; for (let k = 0; k <= SUB; k++) sets.push(UNI(a, i - 1 + k / SUB, dt, T0));
      const pr = await page.evaluate(([fs, sets]) => window.probe(fs, sets), [src, sets]);
      if (pr.err) continue;
      const pick = (o) => (e.tile !== undefined && e.kind === "tile" ? o.tl[e.tile] : o.g);
      const steps = pr.out.map(pick), tot = steps.reduce((x, y) => x + y, 0);
      e.conc = +(tot > 0 ? Math.max(...steps) / tot : 0).toFixed(2);
    }
    for (const e of order.slice(40)) e.conc = null; // unconfirmed (cap: the 40 strongest are probed)
    const anyCut = ev.some((e) => e.conc != null && e.conc >= CONC);
    const cut = ev.filter((e) => (e.conc == null ? anyCut : e.conc >= CONC));
    r.passes[a] = { events: cut, soft: ev.length - cut.length, medMad: +median(m.mad.slice(1)).toFixed(3), maxMad: +Math.max(...m.mad).toFixed(2), ms: Date.now() - ts };
  }
  results[mode] = r;
  const evs = Object.values(r.passes).flatMap((p) => p.events);
  const sev = (e) => Math.max(e.mad, (e.tileMad ?? 0) / 8, Math.abs(e.dLum));
  const worst = evs.reduce((w, e) => (!w || sev(e) > sev(w) ? e : w), null);
  console.log(`${mode.padEnd(24)} ${r.locked ? "LOCK" : "    "} ${r.err ? "ERR " + r.err.slice(0, 80) : `${String(evs.length).padStart(3)} events${worst ? `  worst ${lbl(worst)} mad=${worst.mad} (x${worst.ratio}) dLum=${worst.dLum} c/o=${worst.centre}/${worst.outer}${worst.tileMad ? ` tile=${worst.tileMad}/${worst.tileMed}` : ""} [${worst.kind}]` : ""}`}  ${Object.values(r.passes).map((p) => p.ms).join("/")}ms`);
}
await browser.close();
const flagged = Object.entries(results).filter(([, r]) => Object.values(r.passes).some((p) => p.events.length));
writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), secs: SECS, fps: FPS, W, H, passes, ratio: RATIO, minMad: MIN_MAD, minLum: MIN_LUM, locked: [...locked], results }, null, 1));
console.log(`\n${modes.length} scanned, ${flagged.length} flagged, ${((Date.now() - t0) / 1000).toFixed(0)}s. wrote ${OUT}`);
if (MD) {
  const rows = flagged.map(([m, r]) => {
    const evs = Object.entries(r.passes).flatMap(([a, p]) => p.events.map((e) => ({ ...e, a })));
    const sev = (e) => Math.max(e.mad, (e.tileMad ?? 0) / 8, Math.abs(e.dLum));
    const worst = evs.reduce((w, e) => (sev(e) > sev(w) ? e : w));
    const times = [...new Set(evs.map(lbl))].slice(0, 8).join(", ");
    return `| ${m} | ${r.locked ? "LOCKED" : ""} | ${evs.length} | ${worst.mad} | x${worst.ratio} | ${worst.dLum} | ${worst.centre}/${worst.outer} | ${worst.tileMad ?? ""} | ${worst.kind} | ${times}${evs.length > 8 ? " ..." : ""} |`;
  });
  writeFileSync(MD, `# Shader time-wrap audit\n\n${new Date().toISOString()} — ${modes.length} shaders, ${SECS}s @ ${FPS}fps, ${W}x${H}, audio ${passes.join("/")}; flag = MAD > ${RATIO}x neighbour median & > ${MIN_MAD}/255, or isolated luminance step > ${MIN_LUM}/255.\n\n${flagged.length} flagged.\n\n| shader | lock | events | worst MAD | x median | dLum | centre/outer MAD | tile MAD | kind | when (time s / band@level) |\n|---|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`);
  console.log(`wrote ${MD}`);
}
