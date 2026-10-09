#!/usr/bin/env node
/**
 * SET-LIST PROBE (2026-10-08, named set lists). Drives the real loop page
 * headless and checks the list-aware transport end to end:
 *   - ?start=<set> opens that list;
 *   - a journey jump resolves inside the playing list (Snowflake/Ghost live
 *     in both the main loop and Rise Above);
 *   - the last journey of a list's last set wraps to THAT list's first set;
 *   - set-jumps walk the playing list's set starts (and wrap);
 *   - an album hands back to the list that was playing.
 * Seeks the audio to its last seconds to cross journey/set boundaries fast.
 *
 *   node scripts/journey-review/probe-setlists.mjs [--base http://localhost:3102]
 *
 * Kiosk-shared routes are answered locally (never touches the kiosk's logs).
 */
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const arg = (k, d = null) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const BASE = arg("--base", "http://localhost:3102");
const LAUNCH_ARGS = ["--autoplay-policy=no-user-gesture-required", "--mute-audio", "--use-angle=metal", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];

function inPage() {
  const rv = (window.__probe = { audios: [] });
  const oc = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...r) { const el = oc.call(this, tag, ...r); if (String(tag).toLowerCase() === "audio") rv.audios.push(el); return el; };
  const A = window.Audio;
  window.Audio = function (...a) { const el = new A(...a); rv.audios.push(el); return el; };
  window.Audio.prototype = A.prototype;
  window.__probeSeekEnd = (lead) => { const a = rv.audios.filter((x) => x.duration > 20 && !x.paused); if (!a.length) return null; a[0].currentTime = a[0].duration - lead; return a[0].duration; };
}

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`); if (!ok) failures++; };

async function session(query, body) {
  const browser = await chromium.launch({ headless: true, channel: "chrome", args: LAUNCH_ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const log = [];
  await page.route("**/api/pack/remote**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ commands: [] }) }));
  await page.route("**/api/review/glitch-log**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/installation/heartbeat**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/api/pack/log**", (r) => { try { const j = r.request().postDataJSON(); log.push(String(j?.message ?? j?.event ?? JSON.stringify(j))); } catch { /* */ } return r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  page.on("console", (m) => { const t = m.text(); if (t.includes("[installation]")) log.push(t); });
  await page.addInitScript(inPage);
  await page.goto(`${BASE}/room/installation?loop=1&kiosk=1&${query}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const journey = () => page.evaluate(() => {
    const a = window.__probe.audios.filter((x) => x.duration > 20 && !x.paused);
    return a.length ? (window.__resonanceKioskStatus?.journey ?? null) : null;
  });
  const playing = async (secs = 90) => { for (let k = 0; k < secs; k++) { await page.waitForTimeout(1000); const ok = await page.evaluate(() => window.__probe.audios.some((x) => x.duration > 20 && !x.paused && x.currentTime > 1)); if (ok) return true; } return false; };
  const cycles = () => log.filter((l) => l.includes("cycle-start")).map((l) => l.match(/cycle-start (\S+)/)?.[1]);
  const jumps = () => log.filter((l) => l.includes("operator jump"));
  const ctx = { page, log, playing, cycles, jumps, journey, emit: (type, detail) => page.evaluate(([t, d]) => window.dispatchEvent(new CustomEvent(t, { detail: d })), [type, detail]) };
  try { await body(ctx); } finally { await browser.close(); }
}

const lastJump = (c) => c.jumps().at(-1) ?? "";
const waitFor = async (c, pred, secs = 60) => { for (let k = 0; k < secs; k++) { if (pred()) return true; await c.page.waitForTimeout(1000); } return pred(); };

console.log("1. Rise Above: open, jump inside the list, wrap at its end");
await session("start=tramokyo-rise", async (c) => {
  check(await c.playing(), "Rise Above starts playing");
  check(c.cycles()[0] === "tramokyo-rise", `first cycle is tramokyo-rise (${c.cycles()[0]})`);
  await c.emit("installation-operator-jump-journey", "ghost");
  await c.page.waitForTimeout(1500);
  check(/tramokyo-rise · journey 2/.test(lastJump(c)), `jump:ghost stays in Rise Above (${lastJump(c)})`);
  await c.emit("installation-operator-jump-journey", "85124aed-c3b4-42e2-870a-b14bc5425b72");
  await c.page.waitForTimeout(1500);
  check(/tramokyo-rise · journey 12/.test(lastJump(c)), `jump:Night Wind 9 lands on Rise Above's finale (${lastJump(c)})`);
  check(await c.playing(), "finale playing");
  const n0 = c.cycles().length;
  await c.page.evaluate(() => window.__probeSeekEnd(4));
  check(await waitFor(c, () => c.cycles().length > n0, 90), "the list's end starts a new cycle");
  check(c.cycles().at(-1) === "tramokyo-rise", `Rise Above wraps to itself (${c.cycles().at(-1)})`);
});

console.log("2. Main loop: wrap at the end of March Light, set-jumps");
await session("start=46216435-4340-4ad4-9033-101e66fb29e7", async (c) => {
  check(await c.playing(), "Love Again (end of the main loop) playing");
  const n0 = c.cycles().length;
  await c.page.evaluate(() => window.__probeSeekEnd(4));
  check(await waitFor(c, () => c.cycles().length > n0, 90), "the loop's end starts a new cycle");
  check(c.cycles().at(-1) === "tramokyo-mix", `main wraps to the Snowflake EP set (${c.cycles().at(-1)})`);
  check(await c.playing(), "Snowflake playing after the wrap");
  await c.emit("installation-operator-set", 1);
  await c.page.waitForTimeout(1500);
  check(/tramokyo-mix-kin · journey 1/.test(lastJump(c)), `set +1 from the EP → the Kinetic Lab (${lastJump(c)})`);
  await c.emit("installation-operator-set", -1);
  await c.page.waitForTimeout(1500);
  check(/tramokyo-mix · journey 1/.test(lastJump(c)), `set -1 → back to the EP (${lastJump(c)})`);
  await c.emit("installation-operator-set", -1);
  await c.page.waitForTimeout(1500);
  check(/tramokyo-mix-4 · journey 1/.test(lastJump(c)), `set -1 from the EP wraps to March Light (${lastJump(c)})`);
});

console.log("3. Album hands back to the playing list");
await session("start=tramokyo-rise", async (c) => {
  check(await c.playing(), "Rise Above playing");
  await c.emit("installation-operator-program", "snowflake-ep");
  check(await waitFor(c, () => c.cycles().includes("snowflake-ep"), 30), "album program starts");
  check(await c.playing(), "album playing");
  await c.emit("installation-operator-jump-journey", "ghost");
  await c.page.waitForTimeout(1500);
  check(/snowflake-ep · journey 3/.test(lastJump(c)), `jump:ghost from the album stays in the album (${lastJump(c)})`);
  check(await c.playing(), "Ghost playing");
  const n0 = c.cycles().length;
  await c.page.evaluate(() => window.__probeSeekEnd(4));
  check(await waitFor(c, () => c.cycles().length > n0, 120), "album end starts a new cycle");
  check(c.cycles().at(-1) === "tramokyo-rise", `album hands back to Rise Above (${c.cycles().at(-1)})`);
});

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
