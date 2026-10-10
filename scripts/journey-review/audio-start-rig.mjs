// Audio-start rig (2026-10-09): attach to the REAL kiosk Chrome (--remote-debugging-port=9333), tap the
// master output level (post-gain analyser) + every media event / play / pause / seek / src / gain-ramp call,
// then seek each playing journey to its last SEEK s and record N hand-offs. Prints, per hand-off, the
// timeline of the new track's first seconds and any silence that interrupts it after sound began.
// Usage: node scripts/journey-review/audio-start-rig.mjs [N=4] [SEEK=10]
import { chromium } from "playwright";
const N = Number(process.argv[2] ?? 4), SEEK = Number(process.argv[3] ?? 10);
let b, page;
for (let k = 0; k < 60 && !page; k++) {
  try { b ??= await chromium.connectOverCDP("http://127.0.0.1:9333"); page = b.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("installation")); } catch {}
  if (!page) await new Promise((r) => setTimeout(r, 1000));
}
if (!page) { console.log("no page"); process.exit(1); }
await page.addInitScript(() => {
  const R = (window.__ar = { ev: [], lvl: [], audios: [] });
  const now = () => Math.round(performance.now());
  const who = () => (new Error().stack || "").split("\n").slice(3, 6).map((s) => s.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^/]+\/_next\/static\/chunks\//, "").replace(/\)$/, "")).join(" < ");
  const name = (el) => (el.currentSrc || el.src || "").split("/").pop().slice(0, 28);
  const track = (el) => {
    if (R.audios.includes(el)) return;
    R.audios.push(el);
    const id = R.audios.length - 1;
    for (const t of ["loadstart", "emptied", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "play", "playing", "waiting", "stalled", "pause", "seeking", "seeked", "ended", "error", "abort", "suspend"])
      el.addEventListener(t, () => R.ev.push([now(), `a${id}`, "ev", t, `${name(el)} t=${el.currentTime.toFixed(2)} rs=${el.readyState} p=${el.paused}`]));
  };
  const OrigAudio = window.Audio;
  window.Audio = function (...a) { const el = new OrigAudio(...a); track(el); return el; };
  window.Audio.prototype = OrigAudio.prototype;
  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...r) { const el = origCreate.call(this, tag, ...r); if (String(tag).toLowerCase() === "audio") track(el); return el; };
  const P = HTMLMediaElement.prototype;
  const op = P.play, opa = P.pause, ol = P.load;
  P.play = function () { if (this instanceof HTMLAudioElement) { track(this); R.ev.push([now(), `a${R.audios.indexOf(this)}`, "call", "play()", `${name(this)} paused=${this.paused} rs=${this.readyState} t=${this.currentTime.toFixed(2)} | ${who()}`]); } return op.call(this); };
  P.pause = function () { if (this instanceof HTMLAudioElement && !this.paused) R.ev.push([now(), `a${R.audios.indexOf(this)}`, "call", "pause()", `${name(this)} t=${this.currentTime.toFixed(2)} | ${who()}`]); return opa.call(this); };
  P.load = function () { if (this instanceof HTMLAudioElement) R.ev.push([now(), `a${R.audios.indexOf(this)}`, "call", "load()", `${name(this)} | ${who()}`]); return ol.call(this); };
  const ct = Object.getOwnPropertyDescriptor(P, "currentTime");
  Object.defineProperty(P, "currentTime", { get: ct.get, set(v) { if (this instanceof HTMLAudioElement && Math.abs(v - ct.get.call(this)) > 0.05) R.ev.push([now(), `a${R.audios.indexOf(this)}`, "call", `seek ${ct.get.call(this).toFixed(2)}→${Number(v).toFixed(2)}`, `${name(this)} | ${who()}`]); ct.set.call(this, v); } });
  const sd = Object.getOwnPropertyDescriptor(P, "src");
  Object.defineProperty(P, "src", { get: sd.get, set(v) { if (this instanceof HTMLAudioElement) R.ev.push([now(), `a${R.audios.indexOf(this)}`, "call", "src=", `${String(v).split("/").pop().slice(0, 28)} | ${who()}`]); sd.set.call(this, v); } });
  const ocm = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function (el) { track(el); R.main = R.audios.indexOf(el); return ocm.call(this, el); };
  // master output tap: the engine's graph is source → analyser → gain → destination; tap every gain that
  // gets connected to the destination, and log its ramps.
  const masters = new Set();
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...r) {
    const out = oc.call(this, dst, ...r);
    if (dst instanceof AudioDestinationNode && this instanceof GainNode && !masters.has(this)) {
      masters.add(this);
      const an = this.context.createAnalyser(); an.fftSize = 512; oc.call(this, an);
      const buf = new Float32Array(an.fftSize);
      setInterval(() => { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; R.lvl.push([now(), Math.sqrt(s / buf.length)]); if (R.lvl.length > 20000) R.lvl.splice(0, 5000); }, 10);
      const g = this.gain;
      for (const m of ["linearRampToValueAtTime", "setTargetAtTime", "setValueAtTime", "exponentialRampToValueAtTime"]) {
        const f = g[m].bind(g);
        g[m] = (v, t, ...x) => { if (m !== "setValueAtTime") R.ev.push([now(), "gain", "call", `${m}(${Number(v).toFixed(2)}, +${Math.round((t - this.context.currentTime) * 1000)}ms)`, who()]); return f(v, t, ...x); };
      }
    }
    return out;
  };
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.evaluate(() => { window.__resonanceGlitchTap = (e) => window.__ar.ev.push([Math.round(e.t), "rec", "glitch", e.type, (e.detail || "").slice(0, 60)]); });
const main = () => page.evaluate(() => { const a = window.__ar.audios[window.__ar.main]; return a && a.duration > 60 && !a.paused && a.currentTime > 6 ? window.__ar.main : -1; });
if (process.env.JUMP) {
  // start from a chosen journey via the phone-remote API (the ?start param can lose a race with the supervisor)
  await new Promise((r) => setTimeout(r, 6000));
  await fetch("http://localhost:3000/api/pack/remote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: `jump:${process.env.JUMP}` }) });
  await new Promise((r) => setTimeout(r, 4000));
}
for (let k = 0; k < N; k++) {
  let i = -1;
  for (let w = 0; w < 240 && i < 0; w++) { i = await main(); if (i < 0) await new Promise((r) => setTimeout(r, 500)); }
  if (i < 0) { console.log("no playing track"); break; }
  const s = await page.evaluate(([i, S]) => { const a = window.__ar.audios[i]; const from = a.currentSrc.split("/").pop(); window.__ar.mark = Math.round(performance.now()); a.currentTime = Math.max(a.currentTime, a.duration - S); return from; }, [i, SEEK]);
  console.log(`\n=== hand-off ${k + 1}: from ${s}`);
  // wait for the next track to be playing for 10 s
  await page.waitForFunction(([i, from]) => { const a = window.__ar.audios[i]; return a.currentSrc.split("/").pop() !== from && !a.paused && a.currentTime > 9; }, [i, s], { timeout: 120000, polling: 500 }).catch(() => console.log("timeout waiting for next track"));
  const R = await page.evaluate(() => { const m = window.__ar.mark; return { ev: window.__ar.ev.filter((e) => e[0] >= m), lvl: window.__ar.lvl.filter((e) => e[0] >= m), m }; });
  // find the new track's src= and its sound onset
  if (process.env.ALL) for (const e of R.ev) if ((e[1] === `a${i}` || e[1] === "gain" || (e[2] === "glitch" && /journey-change|take-seed/.test(e[3]))) && !/suspend|canplaythrough/.test(e[3])) console.log(`ALL ${String(e[0] - R.m).padStart(6)} ${e[1].padEnd(4)} ${e[3]}  ${e[4].slice(0, 150)}`);
  const srcSet = R.ev.filter((e) => e[3] === "src=" && !/^data:/.test(e[4]) && e[1] === `a${i}`);
  const T = srcSet.length ? srcSet[srcSet.length - 1][0] : R.m;
  for (const e of R.ev) if (e[0] >= T - 2500 && e[0] <= T + 9000 && !(e[2] === "glitch" && /particle|idle-rescue|push-refused|still|layer-push|clone/.test(e[3]))) console.log(`${String(e[0] - T).padStart(6)} ${e[1].padEnd(4)} ${e[2].padEnd(6)} ${e[3]}  ${e[4]}`);
  const pre = R.lvl.filter((x) => x[0] >= T - 1500 && x[0] < T);
  console.log(`max level in the 1.5 s before the new src (old track should be silent): ${Math.max(0, ...pre.map((x) => x[1])).toFixed(4)}`);
  const L = R.lvl.filter((x) => x[0] >= T);
  const on = L.findIndex((x) => x[1] > 0.003);
  if (on < 0) { console.log("no sound onset within window"); continue; }
  console.log(`sound onset +${L[on][0] - T} ms`);
  let gap = null;
  for (let j = on; j < L.length && L[j][0] < L[on][0] + 8000; j++) {
    if (L[j][1] < 0.0008) { gap ??= L[j][0]; } else if (gap != null) { if (L[j][0] - gap >= 40) console.log(`  SILENCE ${L[j][0] - gap} ms at +${gap - T} (after onset +${gap - L[on][0]})`); gap = null; }
  }
  const lv = L.filter((x) => x[0] < L[on][0] + 3000).filter((_, j) => j % 10 === 0).map((x) => `${x[0] - T}:${x[1].toFixed(3)}`);
  console.log("level first 3 s (ms:rms):", lv.join(" "));
}
await b.close();
