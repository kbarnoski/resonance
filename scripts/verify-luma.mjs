#!/usr/bin/env node
// verify-luma.mjs — headed on-screen luma check for a journey (black
// floor + mean), the visible counterpart of scripts/vet-shaders.mjs
// (Karel 2026-10-04: cosmos post defaults "wash blacks on screen").
// Samples full-page screenshots while the journey plays.
// Usage: VERIFY_BASE=http://localhost:3001 node scripts/verify-luma.mjs <journeyId> [settleSecs] [samples]
import { chromium } from "playwright";
import sharp from "sharp";
const JID = process.argv[2];
const SETTLE = Number(process.argv[3] ?? 30) * 1000;
const N = Number(process.argv[4] ?? 20);
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: false, args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1440,900"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/room/installation?loop=1&start=${JID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const btn = page.locator("button[aria-label='Begin']");
  if (await btn.count()) await btn.first().click().catch(() => {});
  await page.waitForTimeout(SETTLE);
  const out = [];
  for (let i = 0; i < N; i++) {
    const png = await page.screenshot();
    const { data } = await sharp(png).resize(360, 225).greyscale().raw().toBuffer({ resolveWithObject: true });
    const v = Array.from(data).sort((a, b) => a - b);
    out.push({ mean: v.reduce((a, b) => a + b, 0) / v.length, p5: v[Math.floor(v.length * 0.05)], p50: v[Math.floor(v.length * 0.5)] });
    await page.waitForTimeout(2000);
  }
  const avg = (k) => out.reduce((a, o) => a + o[k], 0) / out.length;
  const worstP5 = Math.max(...out.map((o) => o.p5));
  const pass = avg("p5") <= 15 && avg("mean") <= 70;
  console.log(`${pass ? "PASS" : "FAIL"} ${JID}: mean ${avg("mean").toFixed(1)} · black floor p5 ${avg("p5").toFixed(1)} (worst ${worstP5}) · median ${avg("p50").toFixed(1)} over ${N} frames`);
  process.exitCode = pass ? 0 : 1;
} finally { await browser.close(); }
