# Morning digest — last updated 2026-05-30 UTC (cycle 253)

## New since yesterday

- **`/dream/219-waveshape-draw`** (cycle 253, adult) — Draw a waveform on canvas, hear its timbre
  live. Drag your finger to reshape the oscillator's period; an amber overlay shows the actual
  oscillator output vs. your drawn violet curve. A 32-bar harmonic chart below shows the Fourier
  spectrum of what you drew. Presets: Sine (one harmonic), Square (odd harmonics), Triangle
  (falling odd harmonics), Sawtooth (all harmonics). **Why open this**: load the Square preset,
  hear the buzz; switch to Sine, hear the purity; draw something jagged between them and hear the
  metallic hybrid. The harmonic chart is the bridge between what you see and what you hear.
  **First prototype that inverts the audio→visual axis**: instead of audio → light, you draw light
  → audio. Directly inspired by Karel's love of `153-paint-compose` ❤️.

- **`/dream/218-kids-xylophone-drops`** (cycle 252, kids) — Five colored xylophone bars in a
  staircase; drops fall every 1.8s from the top. Tallest bar = deepest note. Tap the sky above a
  bar to aim a drop; tap a bar directly to ring it instantly. First kids prototype with temporal
  anticipation — you see the drop coming before the note fires.

- **`/dream/217-dance-avatar`** (cycle 251, adult) — 12-joint spring-physics skeleton dances to
  audio. Sub-bass bounces hips, treble nods the head, mid swings arms counter-phase. Demo mode
  runs on page load; enable Mic to dance to live piano.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **`paths-granular`** — granular synthesis of Karel's Welcome Home piano tracks via
  `/api/audio/[id]`. Flagged for 2+ cycles. Awaiting Karel's confirmation that the audio route
  is publicly accessible (open question below).

- **`spectral-morph`** (suggested `220`) — AudioWorklet FFT magnitude interpolation between two
  audio sources: morph your piano into a sine wave in real time. Complement to `219-waveshape-draw`
  (this cycle's build), since both prototype the synthesis/analysis duality.

## Open questions for Karel

- **`/api/audio/[id]`**: publicly accessible without auth? One confirmation unlocks
  `paths-granular` — granular synthesis of your actual Welcome Home recordings.
- **Waveshape Draw (219)**: try the "additive mode" polish idea — instead of drawing the waveform
  directly, draw the harmonic envelope (bar heights) and hear the additive result. A simpler and
  more intuitive UI for non-musicians. ~40 lines.
- **Xylophone Drops (218)**: want BPM-synced drop rate? Or mic mode (clap/hum → extra drops spawn)?
- **Dance Avatar (217)**: ghost trail (~15 lines) or onset scatter? Still open from last cycle.
- **FAL_KEY budget**: `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on confirmation.
