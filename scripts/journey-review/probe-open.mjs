#!/usr/bin/env node
/** OPENING-STALL PROBE (2026-10-08: a 1.1-3.3 s freeze as Snowflake's first
 *  emblem forms, on the kiosk only). Loads the kiosk loop at the kiosk's real
 *  pixel density and logs every frame > 40 ms in the first N s, with LoAF
 *  attribution. node scripts/journey-review/probe-open.mjs [--dpr 2] [--secs 16] [--runs 2] [--base url] */
import { chromium } from "playwright";
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const DPR = +arg("--dpr", "2"), SECS = +arg("--secs", "16"), RUNS = +arg("--runs", "2"), BASE = arg("--base", "http://localhost:3000");
const ARGS = ["--autoplay-policy=no-user-gesture-required", "--mute-audio", "--use-angle=metal", "--force-color-profile=srgb", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
for (let i = 1; i <= RUNS; i++) {
  // --headed: a REAL full-screen window with sound, like the kiosk (the
  // headless probe never reproduced the kiosk's opening freeze)
  const HEADED = argv.includes("--headed");
  const b = await chromium.launch({ headless: !HEADED, channel: "chrome", args: HEADED ? [...ARGS.filter((a) => a !== "--mute-audio" && !(argv.includes("--kioskflags") && new RegExp(arg("--drop", "force-color-profile|use-angle")).test(a))), "--kiosk", ...(argv.includes("--kioskflags") ? ["--start-fullscreen"] : [])] : ARGS });
  const p = await (await b.newContext(HEADED ? { viewport: null } : { viewport: { width: 1512, height: 945 }, deviceScaleFactor: DPR })).newPage();
  for (const [pat, body] of [["**/api/pack/remote**", JSON.stringify({ commands: [] })], ["**/api/review/glitch-log**", "{}"], ["**/api/pack/log**", "{}"], ["**/api/installation/heartbeat**", "{}"]]) await p.route(pat, (r) => r.fulfill({ status: 200, contentType: "application/json", body }));
  await p.addInitScript(() => {
    const rv = (window.__po = { gaps: [], loaf: [], ev: [] });
    window.__resonanceGlitchTap = (e) => rv.ev.push([Math.round(performance.now()), e.type, e.detail ?? ""]);
    let last = 0;
    const loop = (n) => { if (last && n - last > 40) rv.gaps.push([Math.round(n), Math.round(n - last)]); last = n; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) rv.loaf.push([Math.round(e.startTime), Math.round(e.duration), Math.round(e.blockingDuration ?? 0) + ` rs+${Math.round(e.renderStart - e.startTime)} sl+${Math.round(e.styleAndLayoutStart - e.startTime)} end+${Math.round(e.duration)}`, (e.scripts ?? []).map((s) => `${s.sourceFunctionName || "?"}@${(s.sourceURL || "").split("/").pop()}:${s.sourceCharPosition} ${Math.round(s.duration)}ms`).join(" | ")]); }).observe({ type: "long-animation-frame", buffered: true }); } catch {}
  });
  if (argv.includes("--css")) { const css = arg("--css", ""); await p.addInitScript((c) => { const add = () => { const st = document.createElement("style"); st.textContent = c; document.head.appendChild(st); }; if (document.head) add(); else document.addEventListener("DOMContentLoaded", add); }, css); }
  if (argv.includes("--warmop")) await p.addInitScript((v) => { const [o, al] = v.split(":").map(Number); window.__warmOp = o; window.__warmA = al; }, arg("--warmop", "1:0.02"));
  if (argv.includes("--warmat")) await p.addInitScript((v) => { window.__warmAt = +v; }, arg("--warmat", "4500"));
  if (argv.includes("--warm")) await p.addInitScript((u) => { setTimeout(() => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = 2048; c.height = 1300; c.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;opacity:" + (window.__warmOp ?? 0.001) + ";mix-blend-mode:screen;pointer-events:none;z-index:2"; document.body.appendChild(c); const x = c.getContext("2d"); x.globalAlpha = window.__warmA ?? 0.01; x.drawImage(img, 0, 0, 2048, 1300); window.__resonanceGlitchTap?.({ type: "WARM", detail: u }); setTimeout(() => c.remove(), 3000); }; img.src = u; }, window.__warmAt ?? 1200); }, arg("--warm", ""));
  if (argv.includes("--veil")) await p.addInitScript((css) => { const add = () => { const d = document.createElement("div"); d.style.cssText = css; document.body.appendChild(d); }; if (document.body) add(); else document.addEventListener("DOMContentLoaded", add); }, arg("--veil", ""));
  if (argv.includes("--spy")) await p.addInitScript(() => {
    const log = (window.__spy = []);
    const sz = (o) => o ? `${o.naturalWidth ?? o.videoWidth ?? o.width}x${o.naturalHeight ?? o.videoHeight ?? o.height}` : "";
    const wrap = (proto, name, desc) => { const f = proto[name]; if (!f) return; proto[name] = function (...a) { const t0 = performance.now(); const r = f.apply(this, a); const dt = performance.now() - t0; log.push([Math.round(t0), name, desc(this, a), +dt.toFixed(1)]); return r; }; };
    const cv = (c) => c && c.canvas ? `${c.canvas.width}x${c.canvas.height}` : "";
    wrap(CanvasRenderingContext2D.prototype, "drawImage", (c, a) => `${cv(c)} <- ${a[0]?.constructor?.name} ${sz(a[0])} ${(a[0]?.src ?? "").split("/").pop()}`);
    wrap(CanvasRenderingContext2D.prototype, "getImageData", (c, a) => `${cv(c)} ${a[2]}x${a[3]}`);
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      wrap(P, "texImage2D", (c, a) => `${cv(c)} ${a.length > 6 ? a[3] + "x" + a[4] : a[5]?.constructor?.name + " " + sz(a[5])}`);
      wrap(P, "texSubImage2D", (c, a) => `${cv(c)} ${a.length > 7 ? a[4] + "x" + a[5] : a[6]?.constructor?.name + " " + sz(a[6])}`);
      wrap(P, "linkProgram", (c) => cv(c)); wrap(P, "compileShader", (c) => cv(c)); wrap(P, "generateMipmap", (c) => cv(c)); wrap(P, "readPixels", (c, a) => `${cv(c)} ${a[2]}x${a[3]}`); wrap(P, "getError", (c) => cv(c)); wrap(P, "finish", (c) => cv(c));
    }
  });
  if (argv.includes("--mut")) await p.addInitScript(() => {
    const log = (window.__mut = []);
    const d = (n) => n.nodeType === 1 ? `${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${n.getAttribute("class") ? "." + n.getAttribute("class").split(" ").slice(0, 3).join(".") : ""}` : n.nodeName;
    const go = () => new MutationObserver((ms) => { const t = Math.round(performance.now()); for (const m of ms) { if (m.type === "childList") { for (const n of m.addedNodes) log.push([t, "+", d(m.target) + " > " + d(n), n.nodeType === 1 ? (n.getAttribute("style") ?? "").slice(0, 160) : ""]); for (const n of m.removedNodes) log.push([t, "-", d(m.target) + " > " + d(n), ""]); } else log.push([t, "@" + m.attributeName, d(m.target), (m.target.getAttribute(m.attributeName) ?? "").slice(0, 160)]); } }).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    if (document.documentElement) go(); else document.addEventListener("DOMContentLoaded", go);
  });
  if (argv.includes("--gpuload")) await p.addInitScript((spec) => { const [ms, n] = spec.split(":").map(Number); const c = document.createElement("canvas"); c.width = 2048; c.height = 2048; const gl = c.getContext("webgl"); const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; }; const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}")); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, "precision highp float;uniform float t;void main(){vec2 u=gl_FragCoord.xy/2048.;float a=0.;for(int i=0;i<" + (n || 40) + ";i++){a+=sin(u.x*float(i)+t)*cos(u.y*float(i)-t);}gl_FragColor=vec4(a*1e-4);}")); gl.linkProgram(pr); gl.useProgram(pr); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); const tl = gl.getUniformLocation(pr, "t"); const t0 = performance.now(); const f = (now) => { if (now - t0 > ms) return; gl.uniform1f(tl, now / 1000); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.flush(); requestAnimationFrame(f); }; requestAnimationFrame(f); }, arg("--gpuload", "9000:40"));
  if (argv.includes("--noidle")) await p.addInitScript(() => { window.requestIdleCallback = (cb) => setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 20000); });
  if (argv.includes("--ws")) await p.addInitScript((v) => { const [at, a] = v.split(":").map(Number); window.__wsAt = at; window.__wsA = a; }, arg("--ws", "4300:0.01"));
  if (argv.includes("--warmself")) await p.addInitScript((u) => { setTimeout(() => { const img = new Image(); img.onload = () => { const c = document.querySelector("[data-ai-image-canvas]"); if (!c) return window.__resonanceGlitchTap?.({ type: "WARMSELF-MISS" }); if (c.width < 400) { c.width = c.clientWidth * 2; c.height = c.clientHeight * 2; } const x = c.getContext("2d"); x.globalAlpha = window.__wsA ?? 0.01; x.drawImage(img, 0, 0, c.width, c.height); x.globalAlpha = 1; window.__resonanceGlitchTap?.({ type: "WARMSELF", detail: c.width + "x" + c.height }); }; img.src = u; }, +(window.__wsAt ?? 4300)); }, arg("--warmself", ""));
  const TRACE = argv.includes("--trace");
  const cdp = TRACE ? await p.context().newCDPSession(p) : null;
  const chunks = [];
  if (cdp) {
    cdp.on("Tracing.dataCollected", (e) => chunks.push(...e.value));
    await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["toplevel", "gpu", "viz", "cc", "blink", "devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-gpu.service", "v8.execute", "gpu.angle"] } });
  }
  await p.goto(`${BASE}/room/installation?loop=1&kiosk=1&start=first-snow${argv.includes("--no-particles") ? "&particles=0" : ""}${argv.includes("--q") ? "&" + arg("--q", "") : ""}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(SECS * 1000);
  if (argv.includes("--twice")) {
    const r1 = await p.evaluate(() => window.__po.gaps.filter((g) => g[1] > 100));
    console.log(`   first load gaps ${JSON.stringify(r1)}`);
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForTimeout(SECS * 1000);
  }
  if (cdp) {
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.end"); await done;
    const fs = await import("node:fs");
    fs.writeFileSync(`/tmp/probe-open-${i}.trace.json`, JSON.stringify({ traceEvents: chunks }));
    console.log(`   trace → /tmp/probe-open-${i}.trace.json (${chunks.length} events)`);
  }
  const r = await p.evaluate(() => window.__po);
  if (argv.includes("--mut")) { const big = r.gaps.filter((g) => g[1] > 200).map((g) => g[0]); const mu = await p.evaluate(() => window.__mut); for (const t of big) { console.log(`   DOM changes before gap ending ${t}:`); const seen = new Map(); for (const m of mu.filter((m) => m[0] > t - 900 && m[0] < t)) { const k = m[1] + " " + m[2]; if (!seen.has(k)) seen.set(k, [m[0], 0, m[3]]); seen.get(k)[1]++; seen.get(k)[2] = m[3]; } for (const [k, v] of seen) console.log(`     @${v[0]} x${v[1]} ${k}  ${v[2]}`); } }
  if (argv.includes("--spy")) { const big = r.gaps.filter((g) => g[1] > 200).map((g) => g[0]); const sp = await p.evaluate(() => window.__spy); for (const t of big) { console.log(`   calls before gap ending ${t}:`); const agg = {}; for (const c of sp.filter((c) => c[0] > t - 1500 && c[0] < t)) { const k = c[1] + " " + c[2]; agg[k] = agg[k] ?? [0, 0, c[0]]; agg[k][0]++; agg[k][1] += c[3]; } for (const [k, v] of Object.entries(agg).sort((x, y) => x[1][2] - y[1][2])) console.log(`     @${v[2]} x${v[0]} ${v[1].toFixed(1)}ms ${k}`); } }
  console.log(`run ${i} dpr ${DPR}: gaps>40ms ${JSON.stringify(r.gaps.filter((g) => g[1] > 100))}`);
  for (const l of r.loaf.filter((x) => x[1] > 150)) console.log(`   LoAF @${l[0]} ${l[1]}ms block ${l[2]} ${l[3].slice(0, 300)}`);
  const big = r.gaps.filter((g) => g[1] > (argv.includes("--events") ? -1 : 200)).map((g) => g[0]);
  for (const t of big) console.log(`   events near ${t}: ${JSON.stringify(r.ev.filter((e) => Math.abs(e[0] - t) < 2000))}`);
  await b.close();
}
