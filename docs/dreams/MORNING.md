# Morning digest — last updated 2026-05-30 UTC (cycle 254)

## New since yesterday

- **`/dream/220-kids-fireworks`** (cycle 254, kids) — Tap the dark star-filled sky → a
  glowing rocket launches from the bottom toward your finger, travels 0.75s, then explodes
  in 22 pentatonic sparks with gravity fall-off and a bright triangle chord.
  Five color zones (violet=C4 → cyan=C5, left to right, all C major pentatonic).
  Three rockets auto-demo on load. **Why open this**: tap rapidly at different X positions
  to stack multiple simultaneous explosions — they automatically form a chord from your
  spatial finger placement. First kids prototype with a *projectile-arc you aim* (previous
  anticipation builds were passive falls/floats). 2.01 kB static, zero deps.

- **`/dream/219-waveshape-draw`** (cycle 253, adult) — Draw a waveform on canvas, hear
  its timbre live via `createPeriodicWave`. Amber overlay shows actual oscillator output
  vs. your drawn violet curve. 32-bar harmonic spectrum below. Presets: Sine, Square,
  Triangle, Sawtooth. **Why open this**: the first prototype that inverts the audio→visual
  axis — you draw light and hear the result. Directly inspired by your love of
  `153-paint-compose` ❤️.

- **`/dream/218-kids-xylophone-drops`** (cycle 252, kids) — Five colored bars in a
  staircase; drops fall every 1.8s and ring when they land. Tallest bar = deepest note.
  Tap above a bar to aim a drop; tap a bar directly for instant ring.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **`spectral-morph`** (suggested `221`) — AudioWorklet FFT magnitude interpolation
  between two audio sources: morph your piano into a sine wave in real time. Natural
  complement to `219-waveshape-draw` (both explore the synthesis/analysis duality).
  Ready to build — zero new deps, one-cycle.

- **`paths-granular`** — granular synthesis of your Welcome Home piano tracks via
  `/api/audio/[id]`. Flagged for 3+ cycles. Still awaiting your confirmation that the
  audio route is publicly accessible (open question below).

## Open questions for Karel

- **`/api/audio/[id]`**: publicly accessible without auth? One confirmation unlocks
  `paths-granular` — granular synthesis of your actual Welcome Home recordings.
- **Waveshape Draw (219)**: try the "additive mode" polish — draw harmonic bar heights
  instead of the raw waveform → hear the additive result. ~40 lines, more intuitive for
  non-musicians.
- **Fireworks (220)**: want mic mode (hum → continuous rockets)? Or confetti on
  5-simultaneous explosions?
- **FAL_KEY budget**: `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on
  your confirmation.
