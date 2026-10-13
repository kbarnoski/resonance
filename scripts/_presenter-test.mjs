// lab end-to-end: song-by-song hold + next. node _presenter-test.mjs
import { chromium } from "playwright";
const B = "http://localhost:3100";
const cmd = (c) => fetch(`${B}/api/pack/remote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: c }) }).then((r) => r.status);
const status = () => fetch(`${B}/api/pack/remote`).then((r) => r.json()).then((j) => j.status);
const browser = await chromium.launch({ headless: false, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const lum = async () => { const b = await page.screenshot({ type: "jpeg", quality: 40 }); let s = 0; for (let i = 0; i < b.length; i += 97) s += b[i]; return Math.round(s / (b.length / 97)); };
const show = async (tag) => { const s = await status(); const p = s?.presenter ?? s?.playback ?? null; console.log(tag, JSON.stringify(p ?? s)?.slice(0, 260), "jpegbytes", (await page.screenshot({ type: "jpeg", quality: 40 })).length); };
await page.goto(`${B}/room/installation?loop=1&kiosk=1&lab=1`);
await page.waitForTimeout(8000);
console.log("cmd", await cmd("playback:manual"), await cmd("set:tramokyo-mix-ep"), await cmd("playnow:first-snow@tramokyo-mix-ep"));
await page.waitForFunction(() => { const a = window.__resonanceAudio; return a && !a.paused && a.currentTime > 2 && a.duration > 30; }, null, { timeout: 120000 });
await show("playing");
await page.evaluate(() => { const a = window.__resonanceAudio; a.currentTime = a.duration - 8; });
for (let i = 0; i < 9; i++) { await page.waitForTimeout(8000); await show(`t+${(i + 1) * 8}s`); }
await page.screenshot({ path: process.env.OUT + "/hold.jpg" });
console.log("next", await cmd("next"));
for (let i = 0; i < 4; i++) { await page.waitForTimeout(6000); await show(`after-next+${(i + 1) * 6}s`); }
await page.screenshot({ path: process.env.OUT + "/after-next.jpg" });
console.log("auto", await cmd("playback:auto"));
await page.waitForTimeout(3000); await show("auto");
await browser.close();
