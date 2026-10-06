#!/usr/bin/env node
// verify-particles-kiosk.mjs — kiosk-hang guard for the particle layer
// (2026-10-05: particle v3 froze the real kiosk Chrome at Snowflake 0:08).
// Drives the INSTALLED Google Chrome (channel "chrome"), headless — never a
// headed window — with the kiosk's own flags (scripts/tramokyo-kiosk.sh)
// against a PRODUCTION build served in pack mode (OFFLINE_PACK=1 next start).
// Instruments every potentially synchronous WebGL call (>20 ms is logged,
// attributed to the particle canvas or not), rAF frame gaps, the particle
// probe (presence / window / programs / warm log) and the session failsafe.
//
// Usage:
//   BASE=http://localhost:3011 URLQ="/room/installation?loop=1&kiosk=1" SECS=42 \
//     node scripts/verify-particles-kiosk.mjs
//   (start=ghost to begin on Ghost; &particles=0 for the no-particle baseline)
// Pass = no "page unresponsive", no slowParticles, gapsOver100 no worse than
// the &particles=0 baseline, "off": null (failsafe never tripped).
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3011"; // never the live kiosk on :3000
const URLQ = process.env.URLQ ?? "/room/installation?loop=1&kiosk=1";
const SECS = Number(process.env.SECS ?? 45);
const b = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check", "--disable-session-crashed-bubble", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await b.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const A = window.Audio; window.__audios = [];
  window.Audio = function (...a) { const el = new A(...a); window.__audios.push(el); return el; }; window.Audio.prototype = A.prototype;
  window.__gaps = []; window.__slow = []; window.__ctxCount = 0; window.__glErrs = []; window.__glErrCount = 0;
  let last = 0;
  const loop = (t) => { if (last && t - last > 50) window.__gaps.push([Math.round(t), Math.round(t - last), (window.__audios.find((x) => x.duration > 0) || {}).currentTime]); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const P = WebGL2RenderingContext.prototype;
  for (const name of ["getShaderParameter", "getProgramParameter", "linkProgram", "compileShader", "drawArrays", "readPixels", "getBufferSubData", "getError", "finish", "texImage2D", "texStorage2D", "generateMipmap", "getSyncParameter", "clientWaitSync", "checkFramebufferStatus"]) {
    const orig = P[name];
    P[name] = function (...a) {
      const t0 = performance.now(); const r = orig.apply(this, a); const dt = performance.now() - t0;
      const ours = !!(this.canvas && this.canvas.dataset && this.canvas.dataset.particleLead);
      if (dt > 20) window.__slow.push([name, Math.round(dt), Math.round(t0), ours ? "PARTICLES" : (this.canvas && this.canvas.width + "x" + this.canvas.height), (window.__audios.find((x) => x.duration > 0) || {}).currentTime]);
      return r;
    };
  }
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (k, o) { if (k === "webgl2" || k === "webgl") window.__ctxCount++; return gc.call(this, k, o); };
});
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
p.on("console", (m) => { const t = m.text(); if (/context lost|CONTEXT_LOST|too many|WebGL/i.test(t)) errs.push("console: " + t.slice(0, 200)); });
await p.goto(BASE + URLQ, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3000);
const btn = p.locator("button[aria-label='Begin']"); if (await btn.count()) await btn.first().click().catch(() => {});
const t0 = Date.now();
let hung = false;
for (let i = 0; i < SECS; i++) {
  const r = await Promise.race([
    p.evaluate(() => ({ t: (window.__audios.find((x) => x.duration > 0) || {}).currentTime, pl: window.__resonanceParticleLead ? { run: window.__resonanceParticleLead.running, pres: window.__resonanceParticleLead.presence, win: window.__resonanceParticleLead.window, soul: window.__resonanceParticleLead.soul, em: window.__resonanceParticleLead.emergences, prog: window.__resonanceParticleLead.programs } : null, off: window.__resonanceParticlesDisabled || null, gaps: window.__gaps.length, slow: window.__slow.length, ctx: window.__ctxCount })),
    new Promise((res) => setTimeout(() => res("TIMEOUT"), 5000)),
  ]).catch((e) => "ERR " + String(e).slice(0, 80));
  if (r === "TIMEOUT") { console.log(`${i}s: page unresponsive (evaluate timed out)`); hung = true; break; }
  if (i % 3 === 0) console.log(`${i}s`, JSON.stringify(r));
  await p.waitForTimeout(1000);
}
const dump = await Promise.race([p.evaluate(() => ({ warmLog: window.__resonanceParticleLead && window.__resonanceParticleLead.warmLog, programs: window.__resonanceParticleLead && window.__resonanceParticleLead.programs, maxGap: Math.max(0, ...window.__gaps.map((g) => g[1])), gapsOver100: window.__gaps.filter((g) => g[1] > 100), slowParticles: window.__slow.filter((x) => x[3] === "PARTICLES"), slowOther: window.__slow.filter((x) => x[3] !== "PARTICLES").length, glErrs: window.__glErrs, off: window.__resonanceParticlesDisabled || null, ctx: window.__ctxCount, renderer: (() => { const c = document.createElement("canvas").getContext("webgl2"); const d = c && c.getExtension("WEBGL_debug_renderer_info"); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : "?"; })() })), new Promise((res) => setTimeout(() => res(null), 8000))]);
console.log("HUNG", hung, "elapsed", (Date.now() - t0) / 1000);
console.log("DUMP", JSON.stringify(dump));
console.log("ERRS", JSON.stringify(errs.slice(0, 6)));
await b.close().catch(() => {});
