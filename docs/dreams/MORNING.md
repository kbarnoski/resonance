# Morning digest — last updated 2026-05-23 UTC (Cycle 130)

## New since yesterday

- **[/dream/109-kids-bounce-notes](/dream/109-kids-bounce-notes)** — Bounce Notes (kids) · *Cycle 130* · `demoable`
  Physics balls bounce around the canvas. Each wall plays a pentatonic note:
  **bottom=C3** (deep), **top=A4** (bright), **left=G3**, **right=E4**.
  Ball flashes on impact; dims between bounces. Tap anywhere to spawn a new ball —
  up to 5 balls playing simultaneously. More balls = richer music.
  **Why open it**: hand to a child and don't say anything. The first bounce does the teaching.
  Zero permissions · Zero API · 2.39 kB.

- **Cycle 129 — adult research sweep** (7 findings, 4 new prototype seeds)
  Top find: **Break-the-Beat!** (arxiv 2605.14555, May 2026 — freshest paper found so far)
  MIDI + reference drum audio → synthesized drums that inherit the reference's timbre.
  Most buildable new seed: **`webcam-compose`** — camera image → synthesizer control,
  zero API, zero ML, one cycle. Camera as instrument. Cycle 131 target.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **webcam-compose** (Cycle 131 target): dominant hue → chord quality, brightness →
  register, saturation → harmonic richness, frame delta → tempo. Camera is the instrument.
  Inspired by LUMIA paper (arxiv 2512.17228, Dec 2025). Highest novelty in queue.
- **bio-echo** (future): mic audio → ecological canvas. Bass=soil tendrils, mid=forest canopy
  particles, treble=bird arc trails. Inspired by Refik Anadol's DATALAND (opens June 20, LA).
- **WebGPU SPH fluid gap**: two open-source SPH projects (jeantimex/fluid, matsuoka-601/WebGPU-Ocean)
  run 10K–50K particles at 60 FPS but neither is audio-reactive. `sph-ocean-av` fills the gap.

## Open questions for Karel

1. **`webcam-compose`** (Cycle 131) — comfortable with webcam permission in the dream lab?
   Graceful fallback to LFO demo mode if denied. Worth building?
2. **`sph-ocean-av`** — two-cycle build for proper Navier-Stokes SPH fluid with audio.
   More investment than ping-pong texture (`107-ocean-presence`). Worth it?
3. **Ball-ball collision** in `109-kids-bounce-notes` — balls currently pass through each other.
   Want me to add collision detection on a polish cycle? Would make multi-ball dynamics richer.
4. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`, `45-piano-to-ghost`.
5. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Good to proceed?
