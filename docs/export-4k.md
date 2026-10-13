# Offline 4K export

Frame-perfect renders of a journey (the whole track or a time range) at
3840×2160 / 60 fps with the real audio muxed in. Use them for promo videos,
trailers and the portfolio. This is **not** a screen capture. The page runs
on a virtual clock and each frame is stepped, settled and grabbed in turn,
so a slow frame just takes longer to render. Nothing drops or stutters.

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
# the lab server must be running on :3100 (never the kiosk on :3000 — refused)
node scripts/export-journey.mjs --journey=ghost --from=0 --to=60        # 60 s, 4K60 H.264 + AAC
node scripts/export-journey.mjs --journey=ghost --codec=prores          # whole track, ProRes 422 HQ + 24-bit PCM
node scripts/export-journey.mjs --journey=ghost --verify                # determinism check (3 s rendered twice)
node scripts/export-journey.mjs --dry-run --journey=ghost --audio=<file.m4a>   # no browser: plan + analyser math
node scripts/export-journey.mjs --help
```

The output goes to `exports/<journey>-<from>-<to>-<res>-<fps>fps.mp4` (this
folder is gitignored). A sidecar `.export.json` records the URL, GPU, track,
first-frame time, warnings and timing.

## Options worth knowing

| option | default | |
|---|---|---|
| `--from` / `--to` | `0` / end | Range in **track time** (seconds). Frames sit on the 1/fps grid of the track. |
| `--set` | `tramokyo-mix` | The `?start=<id>@<set>` program. `--set=none` uses the bare id. |
| `--warm` | `simulate` | `simulate` plays from the track start and captures from `--from`, so every frame is identical to a full-track render. `seek` jumps to `--from − --preroll` (default 3 s), which is faster but particle and crossfade state can differ. |
| `--seed` | `1` | Seeds `Math.random` and `crypto` randomness. The same seed gives the same take; change it for a different one. |
| `--codec` | `h264` | `h264`: x264 High, CRF 14, aq-mode 3 (fights banding in the dark), yuv420p bt709, AAC 320k. `prores`: `--prores=hq` (422 HQ, default) or `422`, 10-bit 4:2:2, PCM 24-bit. |
| `--dpr` | `2` | Viewport = res ÷ dpr, so the default is 1920×1080 CSS at 2× and titles and overlays keep their kiosk proportions. |
| `--fade` | `0` | Fades video and audio in and out (trailers). |
| `--headed` | off | Shows the window. Use it if headless reports a software renderer. |
| `--gl` | `metal` | `swiftshader` gives a software render (slow, but it works anywhere). |
| `--capture` | `png` | `jpeg` is faster and lossy. |
| `--params` | | Extra page params, e.g. `--params=cine=1&dust=1` to export a lab variant. |

## How it works

1. **Virtual clock** (`scripts/export/virtual-clock.mjs`). An init script
   installed before any page script replaces `performance.now`, `Date`,
   `setTimeout`/`setInterval` (with the HTML 4 ms nesting clamp),
   `requestAnimationFrame` and `requestIdleCallback`. Time only moves when
   the exporter steps a frame, to exactly `n·1000/fps` ms.
2. **Virtual media** (`virtual-media.mjs`). `<audio>`/`<video>` never play
   natively. `play`/`pause`/`currentTime`/`paused`/`ended` are answered from
   a model that advances by exactly 1/fps per frame and fires the browser's
   events (`timeupdate` every 250 ms, `ended` and so on). Native playback
   events are swallowed; loading events (`canplay` etc.) pass through.
   **Video morph clips** are natively *seeked* to their virtual time on
   every frame, and the exporter waits for `seeked` before the frame is
   drawn.
3. **Analyser = the real track** (`analyser-math.mjs`). The exporter
   downloads the playing track, decodes it with ffmpeg-static at the
   AudioContext's rate, and down-mixes it to mono (0.5·(L+R)). Each
   `AnalyserNode.get*Data` call is then computed from the samples ending at
   the element's virtual time, using Chromium's own pipeline: Blackman
   window, FFT, |X|/N, smoothing, dB, byte. That reproduces the app's
   settings exactly. There is one analyser on the installation path, the
   engine's (fftSize 256, smoothing 0.8, −100/−30 dB), and the stub reads
   whatever is set on the live node. Smoothing advances once per rendered
   frame. Element volume and mute apply; a paused element feeds silence.
4. **CSS transitions/animations.** Every animation in
   `document.getAnimations()` is paused when it first appears, and its
   `currentTime` is set from the virtual clock each frame (`finish()` at
   the end, so `transitionend` fires).
5. **Determinism.** Randomness is seeded. `KHR_parallel_shader_compile` is
   hidden, so shader compiles finish on the frame they start. WebGL2
   fences always read as signalled after `gl.finish()`. Between frames the
   runtime **settles**: it waits in real time, with virtual time frozen,
   until fetches, response bodies, image loads and decodes,
   `createImageBitmap`, worker replies, media readiness, video seeks and
   DOM mutations are all quiet. Async work therefore always lands on the
   same frame.
6. **Network.** These routes are blocked during an export: kiosk remote
   status, the deploy watchdog (`/api/version` would reload the page), the
   glitch logs and heartbeat (they keep the lab's `docs/glitch-events.jsonl`
   clean), and live imagery `/api/ai-image/*`, which is nondeterministic
   and costs money (`--allow-live-imagery` turns it back on).
7. **Capture.** CDP `Page.captureScreenshot` grabs the composited page,
   including WebGL canvases, DOM overlays, titles and CSS filters, at
   3840×2160. Frames are piped into ffmpeg-static and written to a `.nut`
   intermediate (exact 1/60 timestamps, and it survives Ctrl-C). The audio
   is then cut at the first frame's exact track time and muxed in.
8. **App-side (gated by `?export=1`, `src/lib/export/export-mode.ts`).**
   This lifts the realtime performance ceilings only. Shaders render at
   native DPR instead of the 1.5× ceiling, imagery at native 2× instead of
   the 6.5 Mpx budget, and the 45 fps imagery and 30 fps parallax draw caps
   are removed. The composition is untouched, and nothing changes without
   the flag.

## Fails loudly when

- The server isn't answering on `--port`, or `--port=3000` is used.
- The track doesn't start within 180 s of virtual time.
- The page navigates (the loop reloaded or jumped) or crashes.
- The track changes, pauses or seeks inside the range. Any of these would
  desync the audio.
- A frame grab isn't the requested size.

Settle timeouts, video-seek timeouts, media that never loaded and analysed
media with no PCM are printed as WARNING lines and counted in the sidecar.

## Expectations

- **Speed.** Expect roughly 0.3–1 s per 4K frame (render, settle, PNG grab,
  x264 slow). A 3½-minute track at 60 fps is about 12,600 frames, so 1–3
  hours. Pre-roll in `simulate` mode costs render time but no grabs.
  Progress lines show s/frame and the ETA.
- **Disk.** ProRes 422 HQ at 4K60 is about 1.6 GB per minute; H.264 CRF 14
  is about 0.3–0.6 GB per minute.
- **Determinism.** `--verify` renders [from, from+3 s] twice in fresh
  browsers, losslessly (FFV1 RGB), and compares per-frame pixel MD5s
  (ffmpeg `framemd5`). Differing frames get a PSNR. The verdict is
  IDENTICAL, NEAR-IDENTICAL (every differing frame at or above
  `--verify-min-psnr`, default 50 dB) or FAIL. The renders are kept for
  inspection. One known source of residual nondeterminism: when two images
  finish loading in a different order, their callbacks can draw random
  numbers in a different order.
- **Not identical to the live kiosk.** The kiosk renders at 120 Hz with
  the 1.5× shader ceiling and smooths the analyser once per rAF read.
  Exports render at the chosen fps with one smoothing step per frame and
  full resolution. The look is the same, only cleaner.
