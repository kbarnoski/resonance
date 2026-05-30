# Morning digest — last updated 2026-05-30 UTC (cycle 250)

## New since yesterday

- **`/dream/216-kids-band-builder`** (cycle 250) — Band Builder. Five glowing circles,
  each one an instrument: Bass (violet), Mid (teal), Melody (cyan), Rhythm (amber), Shimmer (rose).
  Tap any circle to add its looping voice; tap again to remove it. All five loops phase-lock to a
  shared 80 BPM beat clock — a new voice always enters on-beat, never mid-measure. BANDIMAL sizing
  (bigger = lower). When all five are on: "✨ Full Band! ✨" flash. **Why open this**: tap one
  circle, then add the next, and feel the music build. The moment all five fire together is the payoff.

- **`/dream/215-fm-explorer`** (cycle 249) — FM Explorer. 2D canvas timbral landscape.
  Move cursor: X = carrier pitch (C2–C7), Y = mod ratio (0.5–8×). **Why open this**: drag from the
  Bell preset toward top-right; tone goes from pure bell → gong → industrial clang in one gesture.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **`waveshape-draw`** (suggested `217-waveshape-draw`): Draw a waveform on canvas → hear the timbre via
  `createPeriodicWave`. **First prototype that sculpts the synthesis source** rather than reacting to audio.
  Proposed triptych with `20-scope` and `13-piano-canvas`. Cycle 247 research sweep seeded this.

- **`optical-flow-music`** (suggested `217` or `218`): Webcam frame differencing → brightness delta →
  synthesis. Zero CDN deps, zero permissions beyond camera. Like a theremin for your body. Cycle 247 seed.

- **`paths-granular`** (suggested `218-paths-granular`): granular synthesis of Karel's Welcome Home piano
  tracks via `/api/audio/[id]`. First prototype using Karel's actual recordings as synth source — the
  most direct realization of the "incorporate Karel's music" directive.

## Open questions for Karel

- **Adult cycle 251**: `waveshape-draw` (draw a waveform → timbre), `dance-avatar` (spring-physics
  skeleton, live-perf projection), or `optical-flow-music` (webcam body motion → synthesis)?
- **`/api/audio/[id]`**: publicly accessible or auth-gated? Needed to build `paths-granular`.
- **Band Builder (216)**: want BPM buttons (±20 BPM) or a mic mode (louder playing = louder band)?
  Both are ~10 lines. Could add to next kids polish cycle.
- **FAL_KEY budget**: `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready to build when confirmed.
