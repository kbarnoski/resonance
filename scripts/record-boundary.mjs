#!/usr/bin/env node
/**
 * Usage: node scripts/record-boundary.mjs <outDir>   (HEADLESS=1 for
 * software GL — logic checks only; headed = real Metal GPU = truth).
 * Then extract frames with ffmpeg-static at 15fps and diff them (see
 * docs/glitch-events.jsonl for the same run's flight-recorder session).
 *
 * Boundary flight test (Karel 2026-09-28: "run the damn journey
 * transition yourself and record it"). Headless chromium on the live
 * kiosk build, tier forced high (full composition: parallax + clones),
 * play Snowflake long enough for real layers to establish, seek to
 * 25s before the end, record video through the boundary into
 * Realized. Frames get diffed afterward; big single-frame deltas =
 * the glitch, seen with my own eyes instead of Karel's.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "boundary-rec";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: process.env.HEADLESS === "1",
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--force-color-profile=srgb",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
// The engine creates its element via `new Audio()` — never in the DOM.
// Capture every audio element at construction so we can drive playback.
await page.addInitScript(() => {
  window.__audios = [];
  const OrigAudio = window.Audio;
  window.Audio = function (...a) { const el = new OrigAudio(...a); window.__audios.push(el); return el; };
  window.Audio.prototype = OrigAudio.prototype;
  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...r) {
    const el = origCreate.call(this, tag, ...r);
    if (String(tag).toLowerCase() === "audio") window.__audios.push(el);
    return el;
  };
});
const t0 = Date.now();
const marks = [];
const mark = (name, extra = "") => {
  const t = (Date.now() - t0) / 1000;
  marks.push({ t, name, extra });
  console.log(`[${t.toFixed(1)}s] ${name} ${extra}`);
};
page.on("console", (m) => {
  const txt = m.text();
  if (/error|Error/.test(txt) && !/favicon|404/.test(txt)) console.log("PAGE:", txt.slice(0, 160));
});

await page.goto("http://localhost:3000/room/installation?loop=1&start=first-snow&tier=high", { waitUntil: "domcontentloaded" });
mark("loaded");

try {
  await page.waitForFunction(() => {
    const a = (window.__audios || []).find((x) => x.duration > 60) ?? null;
    return a && a.duration > 60 && a.currentTime > 1;
  }, undefined, { timeout: 90000 });
} catch (e) {
  await page.screenshot({ path: `${OUT}/stuck.png` });
  const st = await page.evaluate(() => {
    const a = (window.__audios || []).find((x) => x.duration > 60) ?? null;
    return a ? `audio ct=${a.currentTime} dur=${a.duration} paused=${a.paused} src=${(a.currentSrc||"").slice(-40)}` : "NO AUDIO ELEMENT";
  });
  console.log("STUCK:", st);
  throw e;
}
mark("audio-playing");

// Let the composition establish with real layers/clones/parallax.
await page.waitForTimeout(40000);
mark("established");

// Jump to 25s before the boundary.
const dur = await page.evaluate(() => {
  const a = (window.__audios || []).find((x) => x.duration > 60) ?? null;
  a.currentTime = Math.max(0, a.duration - 45);
  return a.duration;
});
mark("seeked", `duration=${dur.toFixed(1)}s -> t-25`);

// Poll currentTime so video time maps to track time.
const poller = setInterval(async () => {
  try {
    const ct = await page.evaluate(() => {
      const a = (window.__audios || []).find((x) => x.duration > 60) ?? null;
      return a ? `${a.currentTime.toFixed(1)}/${a.duration.toFixed(1)}` : "-";
    });
    mark("t", ct);
  } catch { /* page closing */ }
}, 2000);

// Ride through the boundary + 20s of Realized (title card ~8.5s).
await page.screenshot({ path: `${OUT}/mid.png` });
await page.waitForTimeout(78000);
clearInterval(poller);
mark("done");

writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 1));
const video = page.video();
await ctx.close();
const path = await video.path();
console.log("VIDEO:", path);
await browser.close();
