# Morning digest — last updated 2026-08-22T~12:45Z (cycle 1191)

> **The first body: your hands conduct his music.** Your 2026-08-21 verdict was blunt — "a body, not a mouse, and a first you've never shipped." So this cycle I shipped the first piece the lab drives with your actual hands: a webcam reads them as a conductor's baton over one of your real takes, and — the key idea from a museum conducting-recognition paper — **conducting is control of TIME**, so raising a hand pushes your recording forward, faster and brighter, in real time.

## New since yesterday
- **[15760-conduct](https://getresonance.vercel.app/dream/15760-conduct) — you don't press play, you conduct.** MediaPipe hand-tracking reads your two hands as a baton over one of your real takes (default *Bath*). **Raise your conducting hand → time moves forward faster and brighter** (it drives the actual playbackRate); **lower it → the phrase draws out.** **Spread your hands wide → big and spacious; bring them together → quiet, close, dry.** **Open palm → bright; closed fist → muffled and intimate.** The visual is a ~20,000-grain cloud of your own waveform running on a **WebGPU compute shader** that your hands physically **push and sweep** — not a field you watch, a sound you sculpt. **Why open it:** it's the first *body*, the never-run subsystem you said the lab needs to beat `pulse`, and the "WebGPU-compute you push" piece your verdict asked for — in one ship. **Allow the camera + use headphones.** No camera → a pointer fallback (X=spread, Y=height, click=fist) carries it; no WebGPU → the grains render on a Canvas2D twin, audio unchanged.

## In progress / partial
- Nothing half-built. This was a **DEEP ×3 race** on one concept across three surfaces; I shipped the WebGPU arm and banked two fully-built, compliance-clean arms (IDEAS §1191):
  - **`15776-conduct`** — the same conducting, drawn as an **inline-SVG living score**: your take's notes as a warm constellation, two glowing hand-cursors bending the line, the time-scale stretching with your baton. The safe, readable companion.
  - **`15792-conduct`** — the same conducting, as a **three.js aurora-ribbon** you sculpt from outside (a held object, not a room). Held back only because three.js is over-used in the recent window.

## Research findings worth a look
- The dive (RESEARCH §1191): **arXiv:2604.27957 — "Real-Time Control of a Virtual Orchestra by Recognition of Conducting Gestures"** (April 2026, museum-deployed) — a conductor-gesture skeleton drives a recorded orchestra's *tempo*. The reframe that shaped this build: **conducting is control of TIME, not loudness.** Honest caveat: ~4 months old, not a <30-day ship, but current-year and exactly on point.

## Open questions for Karel
- **Try `15760-conduct` at a real machine with a webcam:** does conducting the *time-base* feel musical, or laggy? Does pushing the grain-cloud read as sculpting your sound? And — the standing ask — this is a genuine never-run subsystem (hands + WebGPU compute); **does it clear the `pulse` ceiling for you?**
- Honest note: MediaPipe *hands* aren't strictly a lab-first (two old pieces, `568-conductor-hands` / `8520-airconductor`, used them) — but neither used your real catalog or a compute engine. The genuine first here is the hands-pushed WebGPU-compute granular engine.
- Standing: the AI music→image→video lane still needs your go-ahead on a small per-prototype image-gen budget, or a "drop it."
