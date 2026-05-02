#!/usr/bin/env node
/**
 * Capture stills for the installation deck from the running dev server.
 *
 * Targets PUBLIC share routes only — no auth needed:
 *   - /path/{token}       (Welcome Home album landing)
 *   - /journey/{token}    (individual journey share pages — render player)
 *
 * Output: PNG files into public/installation-stills/. The HTML deck and
 * README can reference these from a stable path.
 *
 * Caveat: shader visuals need a user gesture to start audio. Without it,
 * we capture the rendered chrome + first-frame shader (often still
 * visually rich) but not mid-journey peaks. For the truly beautiful
 * mid-journey stills, run a journey live at the keyboard and screenshot
 * manually — replace the auto-captured PNG of the same name.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const WELCOME_HOME_PATH = "d2c79111528a46cf";

const OUT_DIR = join(process.cwd(), "public", "installation-stills");
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 1600, height: 1000 };

async function captureRoute(page, path, filename, settleMs = 2000) {
  const url = `${BASE}${path}`;
  console.log(`→ ${url}`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(settleMs);
  const out = join(OUT_DIR, filename);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`  saved ${out}`);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // retina-quality PNG
    colorScheme: "dark",
  });
  const page = await ctx.newPage();

  // 1. Welcome Home album landing — the path tracklist
  await captureRoute(page, `/path/${WELCOME_HOME_PATH}`, "01-welcome-home-path.png", 3000);

  // 2. Discover individual journey share tokens linked from the path,
  //    then capture the first one's share page (which boots the player).
  console.log("→ scraping journey share links from path…");
  const journeyTokens = await page.$$eval("a[href*='/journey/']", (links) =>
    links
      .map((a) => a.getAttribute("href") || "")
      .map((h) => {
        const m = h.match(/\/journey\/([^/?#]+)/);
        return m ? m[1] : null;
      })
      .filter((t) => !!t)
  );
  const unique = [...new Set(journeyTokens)];
  console.log(`  found ${unique.length} journey tokens`);

  // Capture up to 3 distinct journey share landings
  for (let i = 0; i < Math.min(3, unique.length); i++) {
    const token = unique[i];
    const filename = `0${i + 2}-journey-${token.slice(0, 8)}.png`;
    try {
      await captureRoute(page, `/journey/${token}`, filename, 4000);
    } catch (e) {
      console.warn(`  skipped ${token}: ${e.message}`);
    }
  }

  await browser.close();
  console.log("done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
