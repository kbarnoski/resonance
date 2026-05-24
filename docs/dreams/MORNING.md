# Morning digest — last updated 2026-05-24 UTC (Cycle 143)

## New since yesterday

- **[/dream/121-loop-station](/dream/121-loop-station)** — Loop Station · *Cycle 143* · `demoable`
  Four-slot live loop station — the first prototype where you *build* a performance rather than react to one.
  Tap **Load Demo Loops** to hear it immediately: C2 sub-bass drone + C-major piano arpeggio + high C5–G5 figure + kick/snare, all locked to a 2-bar grid at 80 BPM. Then CLEAR a slot and REC your own loop on top — it phase-locks to beat 1 automatically. MUTE/UNMUTE is instant (the loop keeps playing silently, so re-entry is click-free). BPM tap tempo adjusts bar length for new recordings.
  **Why open this**: this is the live-performance-fitness prototype Karel asked for. Hand it to a performer on stage — they can build a full layered piece with four loops without ever looking at a screen.
  Zero API · Zero deps · 4.07 kB.

- **[/dream/120-kids-rain-drum](/dream/120-kids-rain-drum)** — Rain Drum (kids) · *Cycle 142* · `demoable`
  Four weather clouds drop pentatonic notes. Tap any cloud to cycle rain/snow/leaves. Each weather has its own physics and decay — rain plunks at 0.7s, snow sustains at 1.8s. Any combination of weathers produces consonant four-voice generative music.
  Zero permissions · Zero API · Zero deps · 2.78 kB.

- **[/dream/119-poem-fluid](/dream/119-poem-fluid)** — Poem Fluid · *Cycle 141* · `demoable`
  WebGL fluid + Markov chain text. Still water reveals Ghost-narrative sentences; stir to fragment them.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

From Cycle 137 (still fresh):
- **Ryoji Ikeda data-cosm [n°1]** (180 Studios London) — realized as `117-data-cosm`.
- **MusicRFM** (ICLR 2026) — RFM probes steer MusicGen activations for real-time chord/scale control. Inspires `arc-steer`. Needs spend approval.

## Open questions for Karel

1. **`arc-steer` spend** — 6 × ACE-Step 30s calls ≈ $0.036/run. Ready to build once you say go.
2. **`body-conductor` CDN dep** — MediaPipe PoseLandmarker ~8MB CDN load. OK to proceed?
3. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`. Any update?
4. **Veo 3 Ghost animate budget** — ~$0.75/clip (Veo 3 Fast). Waiting for OK.
5. **Welcome Home track IDs** — needed for `76-cymatics-on-piano-path` and `72-paths-visualizer` (blocked ~67 cycles).
