#!/usr/bin/env node
/**
 * Probe what actually happens when /room/installation?loop=1 loads in a
 * real browser. Captures network calls, console messages, and a still
 * after the gate has been clicked. Helps diagnose why imagery isn't
 * streaming when the user reports "no AI images."
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "https://getresonance.vercel.app";
const URL = `${BASE}/room/installation?loop=1`;

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  const aiCalls = [];
  page.on("response", (res) => {
    const u = res.url();
    if (u.includes("/api/ai-image/") || u.includes("fal.run") || u.includes("fal.ai")) {
      aiCalls.push(`${res.status()} ${u}`);
    }
  });
  page.on("console", (msg) => {
    const t = msg.type();
    const txt = msg.text();
    if (t === "error" || t === "warning" || /ai|image|fal|journey|prompt/i.test(txt)) {
      console.log(`[console:${t}] ${txt.slice(0, 220)}`);
    }
  });
  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

  console.log(`→ ${URL}`);
  // No auth — middleware will likely redirect us. We follow whatever happens.
  const resp = await page.goto(URL, { waitUntil: "networkidle", timeout: 30_000 });
  console.log(`status=${resp?.status()} url=${page.url()}`);

  await page.waitForTimeout(2000);

  // Click the gate (anywhere on the page).
  await page.click("body", { position: { x: 800, y: 500 } }).catch(() => {});

  // Let it run for 25s — long enough for the intro to advance into the
  // first journey and for AI image generation to fire.
  await page.waitForTimeout(25_000);

  console.log(`\n--- AI/network calls captured (${aiCalls.length}) ---`);
  aiCalls.forEach((c) => console.log(c));

  await page.screenshot({ path: "/tmp/installation-probe.png" });
  console.log("screenshot → /tmp/installation-probe.png");

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
