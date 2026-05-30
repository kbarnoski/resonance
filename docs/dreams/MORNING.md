# Morning digest — last updated 2026-05-30 UTC (cycle 249)

## New since yesterday

- **`/dream/215-fm-explorer`** (cycle 249) — FM Explorer. A 2D canvas timbral landscape.
  Move the cursor (or drag on touch): X = carrier pitch (C2–C7), Y = mod ratio (0.5–8×).
  FM index slider = modulation depth. Background encodes timbral complexity: **green = harmonic
  (organ-like), amber = bell, violet = metallic**. Waveform scope at bottom. 5 presets: Bell,
  Rhodes, Clangy, Sub, Metallic. Mic mode: RMS → index (louder playing = more metallic edge).
  **Why open this**: drag from the "Bell" preset toward the top-right corner and listen to the
  timbre go from pure bell → gong → industrial clang in one gesture.

- **`/dream/214-kids-dance-avatar`** (cycle 248) — Dance Avatar. Glowing cartoon body.
  Five tap zones: head, hands, feet — each a different bell tone + spring bounce. BANDIMAL sizing.
  Idle breathing animation. Visual-only demo before first touch.

- **Cycle 247 — Research sweep** (5 prototype seeds in IDEAS.md):
  `dance-avatar` (adult spring-physics), `fm-explorer` (built this cycle ✓), `waveshape-draw`,
  `optical-flow-music`, `paths-granular`.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **`waveshape-draw`** (`216-waveshape-draw`): Draw a waveform on canvas → hear the timbre via
  `createPeriodicWave`. **First prototype that sculpts the synthesis source** rather than
  reacting to audio. Natural triptych with `20-scope` and `13-piano-canvas`.

- **`dance-avatar`** (adult, `215-dance-avatar`): 12-joint spring-physics skeleton dances to
  audio — bass → hip sway, treble → arm splay, onset → jump. Live performance: project on stage.

- **`paths-granular`** (`218-paths-granular`): granular synthesis of Karel's Welcome Home piano
  tracks via `/api/audio/[id]`. First prototype using Karel's actual recordings as synth source.

## Open questions for Karel

- **FM Explorer (215)**: want a "Lissajous mode" that shows a Bowditch figure (carrier vs. mod)
  instead of the time-domain scope? Simple integer ratios (2:1, 3:2) produce clean closed curves —
  visually explains why those ratios sound harmonic.
- **Adult cycle 251**: `dance-avatar` (spring-physics skeleton, live-perf), `waveshape-draw`
  (draw waveform → hear timbre), or `optical-flow-music` (webcam frame-diff → synthesis)?
- **`/api/audio/[id]`**: publicly accessible or auth-gated? Needed for `paths-granular` (218).
- **FAL_KEY budget**: `ghost-animate` ($0.05–0.30/clip, HappyHorse-1.0) ready to build when confirmed.
