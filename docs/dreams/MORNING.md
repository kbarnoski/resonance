# Morning digest — last updated 2026-05-30 UTC (cycle 255)

## New since yesterday

- **`/dream/221-optical-flow-music`** (cycle 255, adult) — Move in front of the camera —
  the motion IS the music. Webcam frame differencing over a 20×15 grid yields three musical
  signals: motion speed → filter brightness + arpeggiation rate; rightward flow → higher pitch
  (C major pentatonic); downward flow → deeper reverb. Arrow overlay shows each cell's vector,
  colored by direction. **Why open this**: try demo mode first (no camera needed — three glowing
  blobs bounce and make music automatically), then switch to camera and dance. Fast motion = rapid
  bright arpeggios; stillness = silence. First prototype where moving your body is the instrument,
  not your hands. Directly inspired by your love of `217-dance-avatar` ❤️. Zero deps · demoable.

- **`/dream/220-kids-fireworks`** (cycle 254, kids) — Tap the dark sky → glowing rocket arcs
  toward your finger → explodes into 22 pentatonic sparks. Five color zones (violet=C4 → cyan=C5).
  Three auto-demo rockets on load.

- **`/dream/219-waveshape-draw`** (cycle 253, adult) — Draw a waveform on canvas, hear the timbre
  live via `createPeriodicWave`. Harmonic spectrum shows which partials you drew. Inspired by your
  love of `153-paint-compose` ❤️.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **`paths-granular`** (suggested `222`) — granular synthesis of your Welcome Home album tracks
  via `/api/audio/[id]`. Still awaiting confirmation: is that route publicly accessible without auth?
  One yes unlocks it. Demo fallback is ready (synthetic audio if route returns 401).

- **`fourier-paint`** (suggested `222`, alternative) — draw a 2D closed path on canvas → watch
  it decomposed into Fourier epicycles (rotating arm orbits) → hear the harmonic magnitudes as tones.
  Direct companion to `219-waveshape-draw`. Zero deps, high surprise. Can build regardless of audio
  route question.

## Open questions for Karel

- **`/api/audio/[id]`**: is it publicly accessible (no auth required) for at least one of your
  Welcome Home tracks? One confirmation unlocks `paths-granular` — granular synthesis of your
  actual piano recordings. A "no" means we'll build `fourier-paint` next adult cycle instead.

- **Optical Flow Music (221)**: want a multi-oscillator chord mode? Currently one sine oscillator.
  A minor-third + fifth stack (3 oscillators) when totalMag > 0.5 would give richer texture.
  Also: want a sensitivity slider for low-light cameras?

- **FAL_KEY budget**: `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) and `sound-to-video`
  (~$0.25–0.35/generation, your piano recording → FLUX.2 image → LTX-2.3 video) are both ready
  on your confirmation.
