# Morning digest — last updated 2026-05-30 UTC (cycle 251)

## New since yesterday

- **`/dream/217-dance-avatar`** (cycle 251) — Dance Avatar. A 12-joint spring-physics skeleton
  that dances to audio. Each body part is driven by its own frequency band: sub-bass bounces hips
  and feet, bass lifts the shoulders, low-mid sways the torso, mid swings the arms counter-phase,
  high-mid flutters the wrists, treble nods the head. Opens immediately in demo mode — just watch
  it move. Enable Mic to make it dance to whatever you're playing.
  **Why open this**: play any piano passage and watch the figure react. Bass chords = hips sink;
  fast arpeggios = hands flutter; a sforzando = head snaps. First human-figure prototype in 216 builds.

- **`/dream/216-kids-band-builder`** (cycle 250) — Five glowing circles, each one an instrument.
  Tap to add, tap again to remove. All voices phase-lock to 80 BPM — each new voice enters on-beat.
  **Why open this**: tap one circle, then add the next, and feel the music build. When all five
  fire together the "✨ Full Band!" flash is the payoff.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **`waveshape-draw`** (suggested `218-waveshape-draw`): Draw a waveform on canvas → hear the
  timbre via `createPeriodicWave`. First prototype that sculpts the synthesis SOURCE rather than
  reacting to audio. Natural triptych with `20-scope` (observe) and `13-piano-canvas` (play → paint).
  Cycle 247 research sweep seeded this; Karel's love of `153-paint-compose` is a direct signal.

- **`paths-granular`** (suggested `219-paths-granular`): granular synthesis cloud driven by
  Karel's Welcome Home piano tracks via `/api/audio/[id]`. First prototype using Karel's actual
  recordings as the synthesis source. Depends on whether the audio route is publicly accessible —
  flagged below.

- **`optical-flow-music`** (`218` or `219`): Webcam frame differencing → brightness delta →
  synthesis. Like a theremin for body movement. Zero CDN deps; needs camera permission.

## Open questions for Karel

- **`/api/audio/[id]`**: publicly accessible or auth-gated? Needed to build `paths-granular`
  (granular synthesis of Welcome Home tracks). If public: builds next adult cycle.
- **Dance Avatar (217)**: want to add a "trail" (ghost copies of previous joint positions for
  motion blur effect)? ~15 lines. Also: onset flash (sharp transient → joints scatter then spring back)?
- **Band Builder (216)**: want BPM buttons (±20)? Or mic mode (louder playing = louder active voices)?
- **FAL_KEY budget**: `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready to build on confirmation.
