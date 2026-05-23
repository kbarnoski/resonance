# Morning digest — last updated 2026-05-23 UTC (Cycle 140)

## New since yesterday

- **[/dream/118-kids-mirror-melody](/dream/118-kids-mirror-melody)** — Mirror Melody (kids) · *Cycle 140* · `demoable`
  Draw on either half of the screen. A **mirror path instantly appears** on the other side, same Y position. Both sides play the same pentatonic note simultaneously — one panned left, one panned right. Draw high on the canvas = high note; draw low = low note. Rose trails on the left, cyan on the right.
  Multi-touch: two fingers create two independent mirror pairs. Parent + child can draw on opposite sides at the same time, creating a live two-voice duet.
  Zero permissions · Zero API · Zero deps · 2.26 kB.
  **Why open this**: put headphones on and draw a slow diagonal arc. The "left hand / right hand" stereo effect is immediately striking. Then tap the Start button and hand to a 4yo — they'll figure it out in 5 seconds.

- **[/dream/117-data-cosm](/dream/117-data-cosm)** — DATA-COSM · *Cycle 139* · `demoable`
  Ryoji Ikeda aesthetic. Synthetic particle physics events scroll as a monospace matrix on pure black. Characters scatter then snap back. 38Hz sub-bass drone. Auto-cycles through QUANTUM (8 events/s) → BIOLOGICAL (1/s) → COSMIC (1/10s). COSMIC is the payoff: a single event centered on an empty black screen.
  Tap to activate audio. Zero permissions · Zero API.
  **Why open this**: watch it cycle once (~2 min) from QUANTUM to COSMIC. The shift in what "information" feels like across time scales is the whole point.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

From Cycle 137 sweep (still fresh):
- **Memo Akten — The Thinking Ocean** (Whitney Artport 2026) — WebGPU Navier-Stokes fluid with a generative real-time poem that shifts as you navigate. Text IS as dynamic as the water. Direct inspiration for `poem-fluid` (next adult cycle, Cycle 141).
- **Ryoji Ikeda data-cosm [n°1]** (180 Studios London, Oct 2025–Feb 2026) — realized as `117-data-cosm` above.
- **MusicRFM** (ICLR 2026) — RFM probes steer MusicGen activations for real-time chord/scale control. Inspires `arc-steer`.

## Open questions for Karel

1. **`body-conductor` CDN dep** — MediaPipe PoseLandmarker ~8MB, CDN-loaded. OK to proceed?
2. **`arc-steer` spend** — 6 × ACE-Step 30s calls ≈ $0.036/run. OK to proceed?
3. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`. Any update?
4. **Veo 3 Ghost animate budget** — ~$0.75/clip (Veo 3 Fast). Waiting for OK.
