#!/usr/bin/env node
/**
 * OFFLINE 4K EXPORT — frame-perfect, deterministic renders of a journey
 * (docs/export-4k.md). NOT a screen capture: the page runs on a virtual
 * clock (scripts/export/page-runtime.mjs) and every frame is stepped,
 * settled and grabbed, so nothing can drop or stutter however slow the
 * render is. The track's real audio is muxed in afterwards.
 *
 *   node scripts/export-journey.mjs --journey=ghost --from=0 --to=60
 *   node scripts/export-journey.mjs --journey=ghost --verify       (determinism check)
 *   node scripts/export-journey.mjs --dry-run --journey=ghost --audio=track.m4a
 *
 * Targets a RUNNING server on --port (default 3100, the lab). It refuses
 * 3000 — that's the live kiosk.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, extname } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import {
  parseArgs, parseRes, buildUrl, planFrames, onGrid, defaultOut, encodeArgs, muxArgs, decodeArgs,
  parseFrameMd5, parsePsnrStats, compareRuns, fmtDuration, USAGE, INTERMEDIATE_EXT,
} from "./export/plan.mjs";
import { buildInitScript } from "./export/build-init-script.mjs";
import { downmixInterleaved, precomputeByteSpectra } from "./export/analyser-math.mjs";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");

// ── output helpers ──────────────────────────────────────────────────
const T0 = Date.now();
const stamp = () => {
  const s = Math.floor((Date.now() - T0) / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const say = (msg) => console.log(`[export ${stamp()}] ${msg}`);
const warnLine = (msg) => console.log(`[export ${stamp()}] WARNING: ${msg}`);
class ExportError extends Error {}
const die = (msg) => { throw new ExportError(msg); };
const short = (u) => { const s = String(u ?? ""); return s.length > 90 ? "…" + s.slice(-89) : s; };

// ── ffmpeg ──────────────────────────────────────────────────────────
function runFfmpeg(args, { capture = false } = {}) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, args, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    const chunks = [];
    let err = "";
    if (capture) p.stdout.on("data", (c) => chunks.push(c));
    p.stderr.on("data", (c) => { err += c; if (err.length > 20000) err = err.slice(-20000); });
    p.on("error", rej);
    p.on("close", (code) => {
      if (code === 0) res(capture ? Buffer.concat(chunks) : null);
      else rej(new ExportError(`ffmpeg exited ${code}: ${err.trim().slice(-2000)}\n  args: ${args.join(" ")}`));
    });
  });
}

function spawnEncoder(args) {
  const p = spawn(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  let exitCode = null;
  p.stderr.on("data", (c) => { err += c; if (err.length > 20000) err = err.slice(-20000); });
  const exited = new Promise((res) => p.on("close", (code) => { exitCode = code ?? -1; res(exitCode); }));
  p.stdin.on("error", () => { /* surfaced through exitCode */ });
  const deadMsg = () => `ffmpeg encoder exited (${exitCode}) mid-export: ${err.trim().slice(-2000)}\n  args: ${args.join(" ")}`;
  return {
    async write(buf) {
      if (exitCode !== null) die(deadMsg());
      if (!p.stdin.write(buf)) {
        await Promise.race([new Promise((r) => p.stdin.once("drain", r)), exited]);
        if (exitCode !== null) die(deadMsg());
      }
    },
    async close() {
      p.stdin.end();
      const code = await exited;
      if (code !== 0) die(`ffmpeg encoder failed (${code}): ${err.trim().slice(-2000)}`);
    },
    kill() { try { p.stdin.end(); } catch { /* closed */ } },
  };
}

async function decodeMono(file, sampleRate) {
  const buf = await runFfmpeg(decodeArgs(file, sampleRate), { capture: true });
  const inter = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return downmixInterleaved(inter, 2);
}

function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function frameSize(buf) {
  return pngSize(buf) ?? jpegSize(buf);
}

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** data:/blob: sources are placeholders (silent unlock wav, local blobs), never the journey track. */
function isPlaceholderSrc(src) {
  return /^(data|blob):/i.test(String(src ?? ""));
}

function decodeDataUri(uri) {
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const meta = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  return /;base64$/i.test(meta) ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "latin1");
}

// ── preflight ───────────────────────────────────────────────────────
async function checkServer(o) {
  const url = `http://${o.host}:${o.port}/`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    await fetch(url, { redirect: "manual", signal: ac.signal });
  } catch (e) {
    die(`no server answering on ${url} (${e.cause?.code ?? e.message}). Start the LAB server on :${o.port} first — never point this at the kiosk.`);
  } finally {
    clearTimeout(t);
  }
}

// ── one rendered range ──────────────────────────────────────────────
/**
 * Launch a fresh browser, run the journey on the virtual clock, capture
 * frames [from, to) of TRACK time into `videoOut` (video only).
 */
async function renderRange(o, { videoOut, lossless, label = "", probe = false }) {
  const { chromium } = await import("playwright");
  const res = parseRes(o.res);
  const viewport = { width: res.width / o.dpr, height: res.height / o.dpr };
  const url = buildUrl(o);
  const tag = label ? `[${label}] ` : "";
  const tmp = mkdtempSync(join(tmpdir(), "resonance-export-"));
  const meta = { url, viewport, dpr: o.dpr, warnings: [], pageErrors: 0, blocked: {}, settleTimeouts: 0, seekTimeouts: 0 };

  const chromeArgs = [
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
    "--force-color-profile=srgb",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--hide-scrollbars",
  ];
  if (o.gl === "metal") chromeArgs.push("--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist");
  if (o.gl === "swiftshader") chromeArgs.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");

  say(`${tag}launching chromium (${o.headed ? "headed" : "headless"}, gl=${o.gl}) viewport ${viewport.width}x${viewport.height} @${o.dpr}x → ${o.res}`);
  const browser = await chromium.launch({
    headless: !o.headed,
    // the full chromium build in new-headless mode (GPU + the same compositor
    // as headed) rather than the stripped headless shell
    channel: o.headed ? undefined : "chromium",
    args: chromeArgs,
  });
  let encoder = null;
  let interrupted = false;
  const onSigint = () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    warnLine("Ctrl-C — finishing the current frame and closing the file (Ctrl-C again to abort hard)");
  };
  process.on("SIGINT", onSigint);
  try {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: o.dpr,
      serviceWorkers: "block",
      bypassCSP: true,
      colorScheme: "dark",
    });

    // Network: never let the export talk to kiosk plumbing, deploy watchdogs
    // or live generation (nondeterministic + costs money).
    const BLOCK = [/^\/api\/pack\/remote/, /^\/api\/version/, /^\/api\/review\/glitch-log/, /^\/api\/pack\/log/, /^\/api\/installation\/heartbeat/];
    if (!o.allowLiveImagery) BLOCK.push(/^\/api\/ai-image\//);
    await ctx.route((u) => BLOCK.some((r) => r.test(u.pathname)), (route) => {
      const p = new URL(route.request().url()).pathname;
      meta.blocked[p] = (meta.blocked[p] ?? 0) + 1;
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"blocked during offline export"}' });
    });
    const pcmBuffers = new Map();
    await ctx.route((u) => u.pathname.startsWith("/__resonance_export__/pcm/"), (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop().replace(/\.f32$/, "");
      const buf = pcmBuffers.get(id);
      return buf
        ? route.fulfill({ status: 200, contentType: "application/octet-stream", body: buf })
        : route.fulfill({ status: 404, body: "no such pcm" });
    });

    const epochMs = Date.parse(o.epoch);
    await ctx.addInitScript({
      content: buildInitScript({ fps: o.fps, seed: o.seed, epochMs, settleMs: o.settleMs, analyserLeadS: o.analyserLead }),
    });

    const page = await ctx.newPage();
    let crashed = false;
    let navigatedAway = null;
    let started = false;
    page.on("crash", () => { crashed = true; });
    page.on("pageerror", (e) => {
      meta.pageErrors++;
      if (meta.pageErrors <= 15) say(`${tag}page error: ${String(e.message).split("\n")[0].slice(0, 200)}`);
      if (meta.pageErrors === 15) say(`${tag}(further page errors counted, not printed)`);
    });
    let consoleShown = 0;
    page.on("console", (m) => {
      const txt = m.text();
      if (txt.startsWith("[export]")) { say(`${tag}page: ${txt}`); return; }
      if (m.type() === "error" && consoleShown < 15 && !/favicon|ERR_FAILED|503/.test(txt)) {
        consoleShown++;
        say(`${tag}console.error: ${txt.slice(0, 200)}`);
      }
    });
    // a NEW DOCUMENT (reload / location change) — framenavigated also fires for
    // same-document history.replaceState, which the app does on purpose
    page.on("domcontentloaded", () => {
      if (started && !navigatedAway) navigatedAway = page.url();
    });

    say(`${tag}opening ${url}`);
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    started = true;
    const hasRuntime = await page.evaluate(() => !!window.__resonanceExport);
    if (!hasRuntime) die("the export runtime did not install (init script missing or ?export=1 dropped by a redirect)");
    await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
    const gl = await page.evaluate(() => window.__resonanceExport.glInfo());
    meta.gl = gl;
    const pageDpr = await page.evaluate(() => window.devicePixelRatio);
    say(`${tag}WebGL: ${gl.renderer}${gl.webgl2 ? " (WebGL2)" : ""} · devicePixelRatio ${pageDpr}`);
    if (pageDpr !== o.dpr) die(`the page reports devicePixelRatio ${pageDpr}, expected ${o.dpr}`);
    if (/swiftshader|llvmpipe|software/i.test(String(gl.renderer)) && o.gl !== "swiftshader") {
      warnLine("WebGL is running in SOFTWARE — slow, and not the kiosk's look. Try --headed (real Metal GPU).");
    }
    if (/NO WEBGL/.test(String(gl.renderer))) die("no WebGL in this browser — try --headed or --gl=swiftshader");

    // Frame grab. Playwright's screenshot at scale "device" — raw CDP
    // Page.captureScreenshot in new-headless returned CSS-pixel (1x) frames
    // despite deviceScaleFactor 2, and with a clip it returned black
    // (2026-10-13 lab runs). The page's rAF override doesn't affect it.
    async function grab() {
      return page.screenshot({
        type: o.capture,
        ...(o.capture === "jpeg" ? { quality: o.jpegQuality } : {}),
        scale: "device",
        animations: "allow", // the runtime owns animation time
        caret: "initial",
        timeout: 120000,
      });
    }
    const stepTimeoutMs = o.settleMs * 2 + 90000;
    const pcmFiles = new Map(); // src → local file
    let shownWarnings = 0;

    /** Bytes of a media src: http(s) through the page's request context, data: decoded locally, blob: unreachable (null). */
    async function fetchMedia(key) {
      if (isPlaceholderSrc(key)) {
        if (key.startsWith("data:")) return decodeDataUri(key);
        return null;
      }
      const r = await page.request.get(key, { timeout: 180000 });
      if (!r.ok()) die(`could not download media: HTTP ${r.status()} ${key}`);
      return r.body();
    }

    async function loadPcm(list) {
      for (const { key, sampleRate } of list) {
        const placeholder = isPlaceholderSrc(key);
        const body = await fetchMedia(key);
        if (!body) { say(`${tag}analyser audio: skipping unreachable ${short(key)} (blob:) — it reads silence`); continue; }
        if (!placeholder) say(`${tag}analyser audio: downloading + decoding ${short(key)} @ ${sampleRate} Hz`);
        const ext = placeholder ? ".wav" : extname(new URL(key).pathname).slice(0, 6) || ".audio";
        const file = join(tmp, `track-${pcmFiles.size}${ext}`);
        writeFileSync(file, body);
        let mono;
        try {
          mono = await decodeMono(file, sampleRate);
        } catch (e) {
          if (placeholder) { say(`${tag}analyser audio: placeholder ${short(key)} did not decode — it reads silence`); continue; }
          throw e;
        }
        if (!placeholder && mono.length < sampleRate) die(`decoded audio is suspiciously short (${mono.length} samples): ${key}`);
        const id = String(pcmBuffers.size);
        pcmBuffers.set(id, Buffer.from(mono.buffer, mono.byteOffset, mono.byteLength));
        const n = await page.evaluate(([k, u, sr]) => window.__resonanceExport.loadPcm(k, u, sr), [key, `/__resonance_export__/pcm/${id}.f32`, sampleRate]);
        pcmFiles.set(key, file);
        if (!placeholder) say(`${tag}analyser audio ready: ${(n / sampleRate).toFixed(1)} s`);
      }
    }

    // --expect-name: the journey's title must appear on the page early in the
    // track. An unknown ?start= silently falls back to the first journey of the
    // loop (Ghost), so this is what proves we're rendering the right one.
    const expect = o.expectName ? String(o.expectName).toLowerCase().replace(/\s+/g, " ").trim() : null;
    let titleSeen = !expect;
    let earlyFrames = 0;
    async function checkTitle(d) {
      if (titleSeen || d.frame % 15) return;
      const seen = await page.evaluate((n) => (document.body?.innerText ?? "").toLowerCase().replace(/\s+/g, " ").includes(n), expect);
      if (seen) { titleSeen = true; meta.titleSeenAtFrame = d.frame; return; }
      const m = d.main;
      if (m && m.playing && m.src && !isPlaceholderSrc(m.src) && m.t <= 25) earlyFrames += 15;
      // only judge once we have WATCHED the track's opening (a seek skips it)
      if (m && m.playing && m.src && !isPlaceholderSrc(m.src) && m.t > 25 && earlyFrames >= 20 * o.fps) {
        die(`the title "${o.expectName}" never appeared by track ${m.t.toFixed(1)}s — wrong journey (unresolved ?start= falls back to the loop's first journey)?`);
      }
    }

    let lastFrameSeen = 0;
    let lastTrackT = 0;
    async function step() {
      if (crashed) die("the page CRASHED (GPU process / out of memory?)");
      const call = (fn) => {
        let timer;
        return Promise.race([
          page.evaluate(fn),
          new Promise((_, rej) => { timer = setTimeout(() => rej(new ExportError(`a frame step hung for ${stepTimeoutMs / 1000}s (after virtual frame ${lastFrameSeen}, track ${lastTrackT.toFixed(2)}s) — the page's main thread or GPU stalled`)), stepTimeoutMs); }),
        ]).finally(() => clearTimeout(timer));
      };
      let d = await call(() => window.__resonanceExport.step());
      if (d.needPcm) {
        await loadPcm(d.needPcm); // the frame is held before its rAF meanwhile
        d = await call(() => window.__resonanceExport.resume());
      }
      lastFrameSeen = d.frame ?? lastFrameSeen;
      lastTrackT = d.main?.t ?? lastTrackT;
      if (navigatedAway) die(`the page navigated away mid-export (${navigatedAway}) — the loop reloaded or jumped`);
      for (const w of d.warnings) { meta.warnings.push(w); if (shownWarnings++ < 25) warnLine(`${tag}${w}`); }
      if (d.errors.length && meta.pageErrors < 15) for (const e of d.errors.slice(0, 3)) say(`${tag}callback error: ${String(e).split("\n")[0].slice(0, 200)}`);
      if (!d.settle.ok) {
        const pend = d.settle.pending;
        warnLine(`${tag}frame ${d.frame}: async work did not settle in ${o.settleMs} ms — ${JSON.stringify(pend && { ...pend, detail: undefined })} ${(pend?.detail ?? []).join("; ")}`);
      }
      meta.settleTimeouts = d.totals.settleTimeouts;
      meta.seekTimeouts = d.totals.seekTimeouts;
      if (d.wantedPcm.length) await loadPcm(d.wantedPcm);
      if (!probe) await checkTitle(d);
      return d;
    }

    // Settle the hydrated page before the first frame.
    await page.evaluate((ms) => window.__resonanceExport.settle(ms), o.settleMs);

    // Phase A — wait for the journey's track to start (intro, title card…)
    const fps = o.fps;
    const half = 0.5 / fps;
    let d = await step();
    const maxPre = Math.ceil(o.maxWaitStart * fps);
    let lastPrint = Date.now();
    for (let n = 0; ; n++) {
      const m = d.main;
      // the REAL track: the kiosk first 'plays' a silent data: wav (audio unlock /
      // pre-buffer) on the same element — never mistake that for the journey
      if (m && m.playing && Number.isFinite(m.duration) && m.duration > 0 && m.src && !isPlaceholderSrc(m.src)) break;
      if (n > maxPre) {
        die(`the track never started within ${o.maxWaitStart}s of virtual time.\n  main audio: ${JSON.stringify(m)}\n  pending: ${JSON.stringify(await page.evaluate(() => window.__resonanceExport.pending()))}\n  Check the journey id / --set (url: ${url}).`);
      }
      if (Date.now() - lastPrint > 3000) {
        lastPrint = Date.now();
        say(`${tag}waiting for the track… virtual ${(d.nowMs / 1000).toFixed(1)}s · main audio: ${m ? `${m.src ? short(m.src) : "(no src)"} rs=${m.readyState}` : "(none yet)"}`);
      }
      d = await step();
    }
    const src = d.main.src;
    const gen = d.main.generation;
    const duration = d.main.duration;
    if (probe) return { probe: true, src, duration, tmp };
    if (!d.main.analysed) warnLine("the playing audio is not wired to an AnalyserNode — audio-reactive layers will read silence");
    say(`${tag}track started at virtual ${(d.nowMs / 1000).toFixed(2)}s: ${short(src)} (${duration.toFixed(2)} s)`);
    if (o.to !== null && o.to > duration) warnLine(`--to=${o.to} is past the end of the track (${duration.toFixed(2)} s) — clamped`);
    const plan = planFrames({ from: o.from, to: o.to, fps, duration });
    meta.plan = { startFrame: plan.startFrame, count: plan.count, startTime: plan.startTime, durationS: plan.durationS };
    say(`${tag}range: track ${plan.startTime.toFixed(3)}s → ${(plan.startTime + plan.durationS).toFixed(3)}s = ${plan.count} frames @ ${fps} fps`);

    if (o.warm === "seek") {
      const seekFrame = Math.max(0, plan.startFrame - Math.round(o.preroll * fps));
      if (seekFrame / fps > d.main.t + half) {
        const t = await page.evaluate((s) => window.__resonanceExport.seekMain(s), seekFrame / fps);
        say(`${tag}--warm=seek: jumped the track to ${t.toFixed(3)}s (${o.preroll}s pre-roll before the range)`);
        d = await step();
      }
    }

    // Phase B — pre-roll on the virtual clock up to the first frame
    const preStart = Date.now();
    const preFrom = d.main.t;
    while (d.main.t < plan.startTime - half) {
      const m = d.main;
      if (m.src !== src || m.generation !== gen) die(`the track changed before the range began (now ${short(m.src)}) — the loop moved on`);
      if (!m.playing) die(`the track stopped at ${m.t.toFixed(3)}s before the range began (ended=${m.ended})`);
      if (interrupted) die("interrupted during pre-roll");
      if (Date.now() - lastPrint > 5000) {
        lastPrint = Date.now();
        const done = m.t - preFrom;
        const rate = done > 0 ? (Date.now() - preStart) / 1000 / done : 0;
        say(`${tag}pre-roll: track ${m.t.toFixed(1)}s → ${plan.startTime.toFixed(1)}s · ${(rate).toFixed(2)} s per track-second · ETA ${fmtDuration(rate * (plan.startTime - m.t))}`);
      }
      d = await step();
    }
    const t0 = d.main.t;
    if (!onGrid(t0, plan.startTime, fps)) {
      warnLine(`first frame lands at track ${t0.toFixed(4)}s, not ${plan.startTime.toFixed(4)}s (the app put the track off the 1/${fps}s grid) — audio is cut at ${t0.toFixed(4)}s so it stays in sync`);
    }

    // Phase C — capture
    const durationS = plan.durationS;
    encoder = spawnEncoder(encodeArgs(o, { width: res.width, height: res.height, fps, durationS, out: videoOut, lossless }));
    const capStart = Date.now();
    let frames = 0;
    lastPrint = 0;
    const tm = { step: 0, grab: 0, write: 0 }; // where a frame's time goes (ms totals)
    let tq = Date.now();
    for (let i = 0; i < plan.count; i++) {
      tq = Date.now();
      if (i > 0) d = await step();
      tm.step += Date.now() - tq;
      const m = d.main;
      if (!m || m.src !== src || m.generation !== gen) die(`frame ${i}: the track changed under the export (now ${short(m?.src)}) — the loop moved on`);
      const expected = t0 + i / fps;
      if (!onGrid(m.t, expected, fps)) {
        if (m.ended) { warnLine(`track ended at ${m.t.toFixed(3)}s — stopping after ${frames} frames`); break; }
        die(`frame ${i}: track time ${m.t.toFixed(4)}s ≠ expected ${expected.toFixed(4)}s — the app seeked or paused the track mid-range; the audio would desync`);
      }
      if (!m.playing && !m.ended) die(`frame ${i}: the track is paused at ${m.t.toFixed(3)}s`);
      tq = Date.now();
      const img = await grab();
      tm.grab += Date.now() - tq;
      if (i === 0) {
        const sz = frameSize(img);
        if (!sz || sz.width !== res.width || sz.height !== res.height) {
          die(`captured frame is ${sz ? `${sz.width}x${sz.height}` : "unreadable"}, expected ${res.width}x${res.height} — deviceScaleFactor not applied?`);
        }
      }
      tq = Date.now();
      await encoder.write(img);
      tm.write += Date.now() - tq;
      frames++;
      if (Date.now() - lastPrint > 5000 || i === plan.count - 1) {
        lastPrint = Date.now();
        const per = (Date.now() - capStart) / 1000 / frames;
        say(`${tag}frame ${frames}/${plan.count} (${((100 * frames) / plan.count).toFixed(1)}%) · track ${m.t.toFixed(2)}s · ${per.toFixed(2)} s/frame · ETA ${fmtDuration(per * (plan.count - frames))} · step/grab/encode ${(tm.step / frames / 1000).toFixed(2)}/${(tm.grab / frames / 1000).toFixed(2)}/${(tm.write / frames / 1000).toFixed(2)} s · settle timeouts ${d.totals.settleTimeouts}`);
      }
      if (interrupted) { warnLine(`interrupted after ${frames} frames`); break; }
    }
    await encoder.close();
    encoder = null;
    meta.frames = frames;
    if (expect && !titleSeen) warnLine(`the title "${o.expectName}" was not seen (range ended before 25 s of track) — journey identity unverified`);
    meta.titleVerified = titleSeen && !!expect;
    meta.secondsPerFrame = { total: (Date.now() - capStart) / 1000 / Math.max(1, frames), step: tm.step / 1000 / Math.max(1, frames), grab: tm.grab / 1000 / Math.max(1, frames), encodeWait: tm.write / 1000 / Math.max(1, frames) };
    meta.firstFrameTrackTime = t0;
    meta.trackSrc = src;
    meta.trackDuration = duration;
    meta.captureSeconds = (Date.now() - capStart) / 1000;
    const audioFile = pcmFiles.get(src) ?? null;
    if (!audioFile) warnLine("the track's audio was never fetched for analysis — will download it for the mux");
    let muxAudio = audioFile;
    if (!muxAudio) {
      const body = await fetchMedia(src);
      if (!body) die(`could not fetch the track for muxing: ${short(src)}`);
      muxAudio = join(tmp, `track-mux${extname(new URL(src).pathname) || ".audio"}`);
      writeFileSync(muxAudio, body);
    }
    return { frames, t0, durationS: frames / fps, audioFile: muxAudio, meta, tmp, interrupted };
  } catch (e) {
    if (encoder) encoder.kill();
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  } finally {
    process.off("SIGINT", onSigint);
    await browser.close().catch(() => {});
  }
}

// ── modes ───────────────────────────────────────────────────────────
async function exportMode(o) {
  const out = resolve(o.out ?? defaultOut(o));
  mkdirSync(dirname(out), { recursive: true });
  const intermediate = `${out}${INTERMEDIATE_EXT}`;
  say(`output: ${out}`);
  await checkServer(o);
  let r;
  try {
    r = o.workers > 1 ? await renderParallel(o, intermediate) : await renderRange(o, { videoOut: intermediate });
  } catch (e) {
    if (existsSync(intermediate)) warnLine(`partial video (no audio) left at ${intermediate}`);
    throw e;
  }
  try {
    if (r.frames === 0) die("no frames were captured");
    say(`muxing audio: track ${r.t0.toFixed(3)}s + ${r.durationS.toFixed(3)}s → ${out}`);
    await runFfmpeg(muxArgs(o, { video: intermediate, audio: r.audioFile, audioStart: r.t0, durationS: r.durationS, out: `${out}.part${extname(out)}` }));
    renameSync(`${out}.part${extname(out)}`, out);
    if (!o.keepIntermediate) rmSync(intermediate, { force: true });
    const sidecar = { ...r.meta, out, options: o, finishedAt: new Date().toISOString(), totalSeconds: (Date.now() - T0) / 1000 };
    writeFileSync(`${out}.export.json`, JSON.stringify(sidecar, null, 2));
    const mb = (statSync(out).size / 1e6).toFixed(1);
    say(`DONE ${out} (${mb} MB, ${r.frames} frames, ${fmtDuration(r.durationS)}) in ${fmtDuration((Date.now() - T0) / 1000)}`);
    if (r.meta.settleTimeouts || r.meta.seekTimeouts) warnLine(`${r.meta.settleTimeouts} settle timeouts, ${r.meta.seekTimeouts} video seek timeouts — see ${out}.export.json`);
    if (r.interrupted) warnLine("this file is PARTIAL (interrupted)");
  } finally {
    rmSync(r.tmp, { recursive: true, force: true });
  }
}

/**
 * --workers=N: split the range into N contiguous frame chunks, each rendered
 * by its own browser in SIMULATE mode (pre-rolled from the track start, so a
 * chunk's first frame is the exact continuation of the previous chunk's
 * last — the runs are deterministic), then concatenated losslessly.
 */
async function renderParallel(o, intermediate) {
  const fps = o.fps;
  if (o.warm !== "simulate") warnLine("--workers forces --warm=simulate (seek pre-roll would show at the chunk seams)");
  const pr = await renderRange(o, { probe: true, label: "probe" });
  rmSync(pr.tmp, { recursive: true, force: true });
  const plan = planFrames({ from: o.from, to: o.to, fps, duration: pr.duration });
  const n = Math.max(1, Math.min(o.workers, Math.floor(plan.count / (fps * 2)))); // ≥ 2 s per chunk
  const edges = Array.from({ length: n + 1 }, (_, k) => plan.startFrame + Math.round((k * plan.count) / n));
  say(`parallel: ${plan.count} frames in ${n} chunks (${edges.slice(0, -1).map((a, k) => `${(a / fps).toFixed(2)}–${(edges[k + 1] / fps).toFixed(2)}s`).join(", ")})`);
  const parts = edges.slice(0, -1).map((a, k) => ({ a, b: edges[k + 1], file: `${intermediate}.part${k}.nut` }));
  let results;
  try {
    results = await Promise.all(parts.map((p, k) =>
      // stagger the launches a little so n browsers don't hydrate at once
      new Promise((res) => setTimeout(res, k * 4000)).then(() =>
        renderRange({ ...o, warm: "simulate", from: p.a / fps, to: p.b / fps }, { videoOut: p.file, label: `w${k + 1}/${n}` }))));
  } catch (e) {
    for (const p of parts) rmSync(p.file, { force: true });
    throw e;
  }
  results.forEach((r, k) => {
    const want = parts[k].b - parts[k].a;
    if (r.frames !== want && !r.interrupted) die(`chunk ${k + 1} captured ${r.frames} frames, expected ${want}`);
    if (!onGrid(r.t0, parts[k].a / fps, fps)) die(`chunk ${k + 1} started at track ${r.t0.toFixed(4)}s, expected ${(parts[k].a / fps).toFixed(4)}s — seams would desync`);
  });
  const list = `${intermediate}.concat.txt`;
  writeFileSync(list, parts.map((p) => `file '${p.file.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  await runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", intermediate]);
  rmSync(list, { force: true });
  for (const p of parts) rmSync(p.file, { force: true });
  for (const r of results.slice(1)) rmSync(r.tmp, { recursive: true, force: true });
  const frames = results.reduce((s, r) => s + r.frames, 0);
  const r0 = results[0];
  const meta = {
    ...r0.meta,
    frames,
    workers: n,
    chunks: results.map((r, k) => ({ from: parts[k].a / fps, to: parts[k].b / fps, frames: r.frames, secondsPerFrame: r.meta.secondsPerFrame, settleTimeouts: r.meta.settleTimeouts, seekTimeouts: r.meta.seekTimeouts, warnings: r.meta.warnings.length })),
    settleTimeouts: results.reduce((s, r) => s + r.meta.settleTimeouts, 0),
    seekTimeouts: results.reduce((s, r) => s + r.meta.seekTimeouts, 0),
    pageErrors: results.reduce((s, r) => s + r.meta.pageErrors, 0),
  };
  return { frames, t0: r0.t0, durationS: frames / fps, audioFile: r0.audioFile, meta, tmp: r0.tmp, interrupted: results.some((r) => r.interrupted) };
}

async function verifyMode(o) {
  await checkServer(o);
  const dir = mkdtempSync(join(tmpdir(), "resonance-verify-"));
  const ranged = { ...o, to: o.from + o.verifySeconds };
  say(`determinism check: rendering track ${o.from}s → ${ranged.to}s twice (fresh browser each), lossless`);
  const files = [];
  for (const label of ["run A", "run B"]) {
    const f = join(dir, `${label.replace(" ", "-")}${INTERMEDIATE_EXT}`);
    const r = await renderRange(ranged, { videoOut: f, lossless: true, label });
    rmSync(r.tmp, { recursive: true, force: true });
    files.push(f);
  }
  const md5 = [];
  for (const f of files) md5.push(parseFrameMd5((await runFfmpeg(["-hide_banner", "-loglevel", "error", "-i", f, "-f", "framemd5", "-"], { capture: true })).toString()));
  const stats = join(dir, "psnr.log");
  await runFfmpeg(["-hide_banner", "-loglevel", "error", "-i", files[0], "-i", files[1], "-lavfi", `[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]psnr=stats_file=${stats}`, "-f", "null", "-"]);
  const psnr = parsePsnrStats(existsSync(stats) ? readFileSync(stats, "utf8") : "");
  const v = compareRuns(md5[0], md5[1], psnr, o.verifyMinPsnr);
  say(`determinism: ${v.verdict} — ${v.identical}/${v.frames} frames bit-identical` +
    (v.differing ? `, ${v.differing} differ (worst PSNR ${v.worstPsnr.toFixed(2)} dB at frame ${v.worstFrame}; threshold ${o.verifyMinPsnr} dB)` : "") +
    (v.lengthMismatch ? ` — FRAME COUNTS DIFFER (${md5[0].length} vs ${md5[1].length})` : ""));
  say(`lossless renders kept for inspection: ${files.join("  ")}`);
  if (v.verdict === "FAIL") process.exitCode = 1;
}

async function dryRun(o) {
  const res = parseRes(o.res);
  say("DRY RUN — no browser, no server");
  say(`url:      ${o.journey ? buildUrl(o) : "(no --journey)"}`);
  say(`viewport: ${res.width / o.dpr}x${res.height / o.dpr} CSS @ ${o.dpr}x → ${o.res}, ${o.fps} fps, codec ${o.codec}${o.codec === "prores" ? ` (${o.prores})` : ` crf ${o.crf}`}`);
  say(`range:    track ${o.from}s → ${o.to ?? "end of track"} · warm=${o.warm} · seed ${o.seed} · epoch ${o.epoch}`);
  say(`ffmpeg:   ${FFMPEG}`);
  const script = buildInitScript({ fps: o.fps, seed: o.seed, epochMs: Date.parse(o.epoch) });
  new vm.Script(script, { filename: "export-init.js" });
  say(`init script: ${(script.length / 1024).toFixed(1)} KB, parses OK`);
  const out = resolve(o.out ?? (o.journey ? defaultOut(o) : "exports/out.mp4"));
  const durationS = o.to !== null ? o.to - o.from : 60;
  say(`encode:   ffmpeg ${encodeArgs(o, { width: res.width, height: res.height, fps: o.fps, durationS, out: `${out}${INTERMEDIATE_EXT}` }).join(" ")}`);
  say(`mux:      ffmpeg ${muxArgs(o, { video: `${out}${INTERMEDIATE_EXT}`, audio: "<track>", audioStart: o.from, durationS, out }).join(" ")}`);
  if (!o.audio) return;
  const sr = 48000;
  const t = Date.now();
  const mono = await decodeMono(o.audio, sr);
  const dur = mono.length / sr;
  const plan = planFrames({ from: o.from, to: o.to === null ? Math.min(dur, o.from + 60) : o.to, fps: o.fps, duration: dur });
  const spec = precomputeByteSpectra(mono, sr, { fps: o.fps, frames: plan.count, startTime: plan.startTime, fftSize: 256, smoothing: 0.8 });
  const band = (f, a, b) => { let s = 0; for (let k = a; k <= b; k++) s += spec.data[f * spec.bins + k]; return s / (b - a + 1); };
  say(`audio:    ${o.audio} → ${dur.toFixed(2)} s mono @ ${sr} Hz (decode+analyse ${((Date.now() - t) / 1000).toFixed(2)} s for ${plan.count} frames)`);
  say("analyser bytes the app would read (fftSize 256, smoothing 0.8) — bass bins 0-5 / mid 6-30 / treble 31-63:");
  const every = Math.max(1, Math.round(o.fps));
  for (let f = 0; f < plan.count; f += every) {
    say(`  t=${plan.timeOf(f).toFixed(2).padStart(7)}s  bass ${band(f, 0, 5).toFixed(0).padStart(3)}  mid ${band(f, 6, 30).toFixed(0).padStart(3)}  treble ${band(f, 31, 63).toFixed(0).padStart(3)}`);
  }
}

// ── main ────────────────────────────────────────────────────────────
const { opts, errors } = parseArgs(process.argv.slice(2));
if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log(USAGE); process.exit(0); }
if (errors.length) {
  console.error(`\nEXPORT REFUSED:\n  - ${errors.join("\n  - ")}\n${USAGE}`);
  process.exit(2);
}
try {
  if (opts.dryRun) await dryRun(opts);
  else if (opts.verify) await verifyMode(opts);
  else await exportMode(opts);
} catch (e) {
  console.error(`\n[export ${stamp()}] EXPORT FAILED: ${e instanceof ExportError ? e.message : e?.stack ?? e}\n`);
  process.exit(1);
}
