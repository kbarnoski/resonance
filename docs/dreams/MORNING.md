# Morning digest — last updated 2026-05-23 UTC (Cycle 142)

## New since yesterday

- **[/dream/120-kids-rain-drum](/dream/120-kids-rain-drum)** — Rain Drum (kids) · *Cycle 142* · `demoable`
  Four weather clouds hang at the top of the screen. Each drops notes from the sky — its own pitch (C3, E3, G3, A3), its own physics, its own sound character. **Rain**: fast blue teardrops, quick plunk. **Snow**: slow crystalline flakes, soft sustained sine tone. **Leaves**: tumbling coloured ellipses, warm middle-decay tone. **Tap any cloud to cycle its weather.** The four pitches are always consonant (C-major pentatonic), so any combination of weathers sounds musical.
  Zero permissions · Zero API · Zero deps · 2.78 kB.
  **Why open this**: Hand this to a 4yo and say nothing. They'll tap the clouds and watch the rain change. Rain + snow + leaves + rain in parallel sounds like a gentle ambient ensemble that the child is composing by choosing weathers.

- **[/dream/119-poem-fluid](/dream/119-poem-fluid)** — Poem Fluid · *Cycle 141* · `demoable`
  WebGL Navier-Stokes fluid + Markov chain text overlay. Still water reveals the poem. Stir to fragment it.
  Zero API · Zero deps · 6.5 kB.

- **[/dream/118-kids-mirror-melody](/dream/118-kids-mirror-melody)** — Mirror Melody (kids) · *Cycle 140* · `demoable`
  Draw on either half of a split canvas — mirror path appears on the opposite side, panned to the other ear.
  Zero permissions · Zero API · Zero deps · 2.26 kB.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

From Cycle 137 sweep (still fresh):
- **Ryoji Ikeda data-cosm [n°1]** (180 Studios London) — realized as `117-data-cosm`.
- **MusicRFM** (ICLR 2026) — RFM probes steer MusicGen activations for real-time chord/scale control. Inspires `arc-steer`. Needs spend approval.

## Open questions for Karel

1. **`arc-steer` spend** — 6 × ACE-Step 30s calls ≈ $0.036/run. Ready to build once you say go.
2. **`body-conductor` CDN dep** — MediaPipe PoseLandmarker ~8MB CDN load. OK to proceed?
3. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`. Any update?
4. **Veo 3 Ghost animate budget** — ~$0.75/clip (Veo 3 Fast). Waiting for OK.
