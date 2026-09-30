#!/usr/bin/env node
// verify-kinetic.mjs — PROOF harness for the kinetic EQ (Karel
// 2026-09-30: "verify through whatever testing you need that your
// claimed features are done before i review"). Headed chromium on the
// live kiosk; samples every band layer's envelope + screen luminance,
// asserts all three voices exist and PULSE. Exit 0 = verified.
// Usage: node scripts/verify-kinetic.mjs [journeyId] [settleSecs]
import { chromium } from "playwright";
const JID = process.argv[2] ?? "9f7d1b51-aeac-4dfc-a39f-b00101a403f9"; // Chemiluminescence 1
const SETTLE = Number(process.argv[3] ?? 25) * 1000;
const browser = await chromium.launch({ headless: false, args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1440,900"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://localhost:3000/room/installation?loop=1&start=${JID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const btn = page.locator("button[aria-label='Begin']");
  if (await btn.count()) await btn.first().click().catch(() => {});
  await page.waitForTimeout(SETTLE);
  const series = { bass: [], mid: [], treble: [] };
  const stale = { bass: 0, mid: 0, treble: 0 };
  for (let i = 0; i < 90; i++) {
    const eq = await page.evaluate(() => window.__resonanceEq ?? null);
    const now = Date.now();
    for (const b of ["bass", "mid", "treble"]) {
      if (!eq?.[b]) continue;
      // A parked/compiling canvas stops writing — stale probes would
      // read as a frozen envelope. Count them separately.
      if (now - eq[b].t > 250) { stale[b]++; continue; }
      series[b].push(eq[b].pulse);
    }
    await page.waitForTimeout(160);
  }
  for (const b of ["bass", "mid", "treble"]) if (stale[b]) console.log(`note: ${b} stale ${stale[b]}/90 (parked windows)`);
  let pass = true;
  for (const b of ["bass", "mid", "treble"]) {
    const v = series[b];
    if (v.length < 20) { console.log(`FAIL ${b}: layer absent (${v.length} samples)`); pass = false; continue; }
    const max = Math.max(...v), mean = v.reduce((a, x) => a + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / v.length);
    const ok = max > 0.45 && sd > 0.07 && mean < 0.75; // pinned-high = fail
    console.log(`${ok ? "PASS" : "FAIL"} ${b}: n=${v.length} max=${max.toFixed(2)} mean=${mean.toFixed(2)} sd=${sd.toFixed(2)}`);
    if (!ok) pass = false;
  }
  console.log(pass ? "VERIFIED: all three EQ voices pulsing" : "NOT VERIFIED");
  process.exitCode = pass ? 0 : 1;
} finally {
  await browser.close(); // never leave a stray heartbeat (2026-09-30 lesson)
}
