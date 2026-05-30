# Morning digest — last updated 2026-05-30 UTC (cycle 252)

## New since yesterday

- **`/dream/218-kids-xylophone-drops`** (cycle 252, kids) — Five colored xylophone bars sit at
  the bottom in a staircase. Drops fall from the top every 1.8 seconds, each aimed at a bar. When
  a drop hits, the bar glows and rings a pentatonic note. Tap the sky to aim a drop; tap a bar
  directly to ring it instantly. Tallest bar = deepest note — a physical lesson built into the shape.
  **Why open this**: watch it for 10 seconds with no interaction, then tap the sky above each bar
  column and hear the staircase. First kids prototype with temporal anticipation — you see the drop
  coming before it rings.

- **`/dream/217-dance-avatar`** (cycle 251) — 12-joint spring-physics skeleton that dances to
  audio. Each body part driven by its own frequency band: sub-bass bounces hips, treble nods the
  head. Demo mode on load. Enable Mic to dance to live piano.
  **Why open this**: play any passage and watch the figure react. First human-figure prototype in
  217 builds.

- **`/dream/216-kids-band-builder`** (cycle 250) — Five glowing instrument circles. Tap to add,
  tap again to remove. All voices phase-lock to 80 BPM.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **`waveshape-draw`** (suggested `219`): Draw a waveform on canvas → hear the timbre via
  `createPeriodicWave`. Inversion of `20-scope`. Zero deps. Karel's love of `153-paint-compose` ❤️
  is a direct signal. Flagged for 3 cycles — high time to build.

- **`paths-granular`** (suggested `219` or `220`): Granular synthesis of Karel's Welcome Home
  piano tracks via `/api/audio/[id]`. First prototype using Karel's actual recordings as source.
  Depends on whether the audio route is publicly accessible — flagged below.

## Open questions for Karel

- **`/api/audio/[id]`**: publicly accessible without auth? Needed to build `paths-granular`.
  If public: builds next adult cycle. If gated: need a workaround (pre-fetch + store in public/).
- **Xylophone Drops (218)**: want mic mode (clap/hum → more drops spawn)? Or BPM-synced drops?
- **Dance Avatar (217)**: want a "ghost trail" (semi-transparent joint history for motion blur)?
  ~15 lines. Or onset scatter (sharp transient → joints scatter then spring back)?
- **FAL_KEY budget**: `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on confirmation.
