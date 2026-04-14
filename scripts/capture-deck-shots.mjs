// Deck screenshot capture script.
//
// Usage:
//   1. Start the dev server in another terminal: `npm run dev`
//   2. Run this script: `node scripts/capture-deck-shots.mjs`
//   3. A Chromium window opens at /login. Log in manually (Google or email).
//   4. Once you land on an authenticated page (library, room, etc.) the
//      script takes over and captures every route listed below at 1440x900.
//   5. PNGs are saved to public/deck-shots/.
//
// If you need more login time, bump LOGIN_TIMEOUT_MS below.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "deck-shots");
const BASE_URL = "http://localhost:3000";
const LOGIN_TIMEOUT_MS = 180_000; // 3 minutes to log in
const VIEWPORT = { width: 1440, height: 900 };

// Routes to capture. Each: { name, path, wait? (ms settle), scroll? }
const ROUTES = [
  { name: "01-library", path: "/library", settle: 2500 },
  { name: "02-insights", path: "/insights", settle: 2500 },
  { name: "03-room", path: "/room", settle: 4000 },
  { name: "04-installation", path: "/room/installation", settle: 2500 },
  { name: "05-upload", path: "/upload", settle: 1500 },
  { name: "06-collections", path: "/collections", settle: 2000 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  console.log(`\n→ Opening ${BASE_URL}/login ...`);
  console.log(`  You have up to ${LOGIN_TIMEOUT_MS / 1000}s to log in.\n`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

  // Wait for auth — detect by URL leaving /login or /signup
  try {
    await page.waitForURL(
      (url) =>
        !url.pathname.startsWith("/login") &&
        !url.pathname.startsWith("/signup") &&
        !url.pathname.startsWith("/forgot-password") &&
        !url.pathname.startsWith("/update-password"),
      { timeout: LOGIN_TIMEOUT_MS },
    );
  } catch {
    console.error("❌ Login timeout. Exiting.");
    await browser.close();
    process.exit(1);
  }

  console.log(`✓ Logged in. Current URL: ${page.url()}\n`);

  for (const route of ROUTES) {
    const outPath = join(OUT_DIR, `${route.name}.png`);
    console.log(`→ Capturing ${route.path} ...`);
    try {
      await page.goto(`${BASE_URL}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForTimeout(route.settle ?? 1500);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`  ✓ saved ${route.name}.png`);
    } catch (err) {
      console.error(`  ✗ ${route.path} failed: ${err.message}`);
    }
  }

  console.log(`\n✓ Done. Files in ${OUT_DIR}\n`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
