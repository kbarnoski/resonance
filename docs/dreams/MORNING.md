# Morning digest — last updated 2026-05-30 UTC (cycle 248)

## New since yesterday

- **`/dream/214-kids-dance-avatar`** (cycle 248) — Dance Avatar. A glowing cartoon character with
  five tap zones: **head** (C4/cyan, small), **left + right hands** (G3/A3, emerald/amber, medium),
  **left + right feet** (C3/E3, violet/teal, largest). Skeleton lines connect them into a recognizable
  body. Tap any part → bell chime + spring-bounce + sparkle burst. Cute face on the head (eyes + smile).
  The body breathes with a slow idle animation before first touch; a visual-only demo cycles through
  body parts to show what's tappable. **Why open this**: tap the feet — low boom; tap the head — high
  chime. BANDIMAL makes anatomy = music theory.

- **Cycle 247 — Research sweep** (no new prototype; 5 prototype seeds added to IDEAS.md):
  `dance-avatar` (adult spring-physics version), `fm-explorer`, `waveshape-draw`, `optical-flow-music`,
  `paths-granular`. **Why open RESEARCH.md**: FM synthesis seed (§241) fills the biggest single
  gap in the sandbox (213 prototypes, zero FM); `waveshape-draw` (§242) inverts every prior prototype's
  direction (sculpt the source, not react to it).

## In progress / partial

Nothing in-progress.

## Research findings worth a look (Cycle 247)

- **`fm-explorer`** (`216-fm-explorer`): 2D canvas — X=carrier pitch, Y=modulator ratio. Mouse sweeps
  hundreds of timbres instantly: metallic, bell, Rhodes, sub. Zero deps, one cycle. Most-missing
  synthesis paradigm in the sandbox.

- **`waveshape-draw`** (`217-waveshape-draw`): Draw a waveform on canvas → hear the timbre via
  `createPeriodicWave`. First prototype that sculpts the synthesis source rather than visualizing audio.

- **`dance-avatar`** (adult, `215-dance-avatar`): 12-joint spring-physics skeleton dances to audio
  (bass → hip sway, treble → arm splay, onset → jump). Zero deps. Live performance: project on stage.

- **`paths-granular`** (`219-paths-granular`): granular synthesis of Karel's Welcome Home tracks via
  `/api/audio/[id]`. First prototype using Karel's actual piano recordings as synthesis source.

- **Seedance 2.0 update**: accepts audio reference input for video-audio coherence — improves the
  `ghost-animate` plan (supply Ghost LoRA ambient SFX as audio reference).

## Open questions for Karel

- **Dance Avatar (214)**: multi-touch chord mode (each simultaneous finger = different body part)?
  Currently one finger at a time. ~20 lines to add.
- **Adult cycle 249**: which of `dance-avatar` (surprise, live-perf), `fm-explorer` (synthesis gap),
  or `waveshape-draw` (paradigm inversion) to build next?
- **Echo Drum (213)**: +1 bonus beat on most-tapped pad (reinforcement) vs. least-tapped pad (surprise)?
- **FAL_KEY budget**: `vocal-bgm` ($0.006/gen) + `arc-compose` ($0.03/gen) ready to build — confirm?
- **`/api/audio/[id]`**: is this endpoint publicly accessible or auth-gated? Needed for `paths-granular`.
