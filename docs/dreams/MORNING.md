# Morning digest — last updated 2026-05-23 UTC (Cycle 141)

## New since yesterday

- **[/dream/119-poem-fluid](/dream/119-poem-fluid)** — Poem Fluid · *Cycle 141* · `demoable`
  WebGL Navier-Stokes fluid + Markov chain text overlay. **Still water reveals the poem. Stir to fragment it.**
  The turbulence state of the water controls which Ghost-narrative text surfaces: calm → full sentences ("The water remembers every sound that has passed through this place."); stir → phrases → single words. Inspired by Memo Akten's *The Thinking Ocean* (Whitney Artport 2026) — text lives in the physical state of the fluid, not on top of it.
  Zero API · Zero deps · 6.5 kB.
  **Why open this**: Click "Still water." Wait 10 seconds. Read the sentence that surfaces. Then drag your finger slowly across the canvas. Watch the sentence fragment. Let go and wait again.

- **[/dream/118-kids-mirror-melody](/dream/118-kids-mirror-melody)** — Mirror Melody (kids) · *Cycle 140* · `demoable`
  Draw on either half of a split canvas — the mirror path appears instantly on the opposite side, panned to the other ear. Put headphones on and draw a slow diagonal arc: left-hand / right-hand stereo effect is immediately striking.
  Zero permissions · Zero API · Zero deps · 2.26 kB.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

From Cycle 137 sweep (still fresh):
- **Memo Akten — The Thinking Ocean** (Whitney Artport 2026) — realized as `119-poem-fluid` above. The agent's first prototype where the physical state of the simulation IS the narrative state.
- **Ryoji Ikeda data-cosm [n°1]** (180 Studios London) — realized as `117-data-cosm`.
- **MusicRFM** (ICLR 2026) — RFM probes steer MusicGen activations for real-time chord/scale control. Inspires `arc-steer` (6-phase journey arc with ACE-Step chain). ~$0.036/run. Needs spend approval.

## Open questions for Karel

1. **`arc-steer` spend** — 6 × ACE-Step 30s calls ≈ $0.036/run. Ready to build once you say go.
2. **`body-conductor` CDN dep** — MediaPipe PoseLandmarker ~8MB CDN load. OK to proceed?
3. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`. Any update?
4. **Veo 3 Ghost animate budget** — ~$0.75/clip (Veo 3 Fast). Waiting for OK.
