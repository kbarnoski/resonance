#!/usr/bin/env node
/**
 * Capture a ~75-second journey reel for the installation deck.
 *
 * Drives a public /journey/{token} share page in headed Chromium with the
 * autoplay policy bypassed so the journey actually starts. Records the
 * viewport as WebM, then converts to MP4 via ffmpeg if available.
 *
 * Caveat: WebM video recorded by Playwright is SILENT. Curators will read
 * captions or watch on mute. For a music+visual reel, screen-record the
 * browser yourself via QuickTime / Cmd+Shift+5 with system audio capture.
 * This script is the automated baseline.
 */

import { chromium } from "playwright";
import { mkdirSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL || "http://localhost:3000";
// Welcome Home opening track — known to have rich early visuals.
const TOKEN = process.env.JOURNEY_TOKEN || "a2196bcfb6434bc3";

// Recording duration. Journey openings are intentionally slow; 75 s puts us
// well into the Threshold→Expansion handoff where imagery starts surfacing.
const DURATION_MS = 75_000;
const VIEWPORT = { width: 1600, height: 1000 };

const OUT_DIR = join(process.cwd(), "public", "installation-stills");
mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  });
  const page = await ctx.newPage();

  const url = `${BASE}/journey/${TOKEN}?autoplay=1`;
  console.log(`→ ${url}`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

  // Click the page to satisfy any residual gesture requirements (some
  // engines defer audio resume even with the autoplay flag set).
  await page.waitForTimeout(800);
  try { await page.click("body", { position: { x: 800, y: 500 }, timeout: 2000 }); } catch {}
  // Try clicking the play button if it's visible.
  try { await page.click("button[aria-label*='lay' i]", { timeout: 1500 }); } catch {}
  try { await page.click("svg + svg, button:has-text('Tap')", { timeout: 1500 }); } catch {}

  console.log(`→ recording ${DURATION_MS / 1000}s of journey playback…`);
  await page.waitForTimeout(DURATION_MS);

  await ctx.close();
  await browser.close();

  // Playwright names the video with a random suffix; rename to a stable path.
  const fs = await import("node:fs/promises");
  const files = await fs.readdir(OUT_DIR);
  const webm = files.filter((f) => f.endsWith(".webm")).sort().pop();
  if (!webm) {
    console.error("no webm produced");
    process.exit(1);
  }
  const webmFinal = join(OUT_DIR, "journey-reel.webm");
  renameSync(join(OUT_DIR, webm), webmFinal);
  console.log(`saved ${webmFinal}`);

  // Convert to MP4 if ffmpeg is available — easier to embed in slides.
  try {
    execSync("which ffmpeg", { stdio: "ignore" });
    const mp4Final = join(OUT_DIR, "journey-reel.mp4");
    console.log("→ converting to mp4…");
    execSync(
      `ffmpeg -y -i "${webmFinal}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${mp4Final}"`,
      { stdio: "inherit" }
    );
    if (existsSync(mp4Final)) console.log(`saved ${mp4Final}`);
  } catch {
    console.log("ffmpeg not found — keeping webm only");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
