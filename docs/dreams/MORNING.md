# Morning digest — last updated 2026-05-23 UTC (Cycle 131)

## New since yesterday

- **[/dream/110-webcam-compose](/dream/110-webcam-compose)** — Webcam Compose · *Cycle 131* · `demoable`
  Point your camera at anything — colors become chords. Hue → chord quality (warm reds=major,
  cool blues=minor, violets=diminished). Brightness → register (dark=C2 bass, bright=C4 treble).
  Saturation → voices (1–3 triangle-wave tones per chord). Frame delta → arpeggio vs pad.
  Split view: left = camera feed with 4 colored zone overlays, right = 6-band bloom ring
  driven by the synthesizer's own output harmonics.
  **Demo mode works without camera** — LFOs cycle through all 5 chord qualities continuously.
  **Why open it**: hold it up to a plant, a painting, a window. Every frame is a different chord.
  Zero API · Zero ML · webcam permission (fallback demo mode) · 4.66 kB.

- **[/dream/109-kids-bounce-notes](/dream/109-kids-bounce-notes)** — Bounce Notes (kids) · *Cycle 130* · `demoable`
  Physics balls bounce, walls sing. Tap to spawn more (up to 5). Autonomous music — no
  continuous gesture required. Zero permissions · Zero API · 2.39 kB.

- **Cycle 129 — adult research sweep** (7 findings, 4 new prototype seeds)
  Top find: Break-the-Beat! (arxiv 2605.14555, May 2026). New seeds: `webcam-compose` (built
  this cycle), `sph-ocean-av`, `bio-echo`, `live-harmonize`.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **bio-echo** (candidate for Cycle 133): mic → ecological canvas. bass=soil tendrils,
  mid=forest canopy particles, treble=bird arc trails, treble shimmer=sky. Inspired by
  Refik Anadol's DATALAND (opens June 20, 2026, LA). Zero deps, zero API.
- **sph-ocean-av** (two-cycle build): WebGPU SPH fluid (proper Navier-Stokes, 10K+ particles)
  driven by audio. Fills gap — matsuoka-601/WebGPU-Ocean is impressive but not audio-reactive.
- **live-harmonize**: mic → pitch detect → predict best harmonic accompaniment for partial phrase.
  Distinct from `28-chord-canvas` (detects what IS playing) — this predicts what SHOULD harmonize.

## Open questions for Karel

1. **webcam-compose QA**: does hue→chord mapping feel musical on real camera input? The mapping
   is deterministic — a white wall plays the same chord every time. Is that "too rigid"? Could
   add randomized root note variation if it feels monotonous.
2. **Ball-ball collision** in `109-kids-bounce-notes`: balls pass through each other currently.
   Want collision detection added on a polish cycle? Would make multi-ball richer.
3. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`, `45-piano-to-ghost`.
4. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Good to proceed?
5. **`sph-ocean-av`** — two-cycle investment. Worth it vs more one-cycle builds?
