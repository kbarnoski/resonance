# Morning digest — last updated 2026-05-30 UTC (cycle 256)

## New since yesterday

- **`/dream/222-kids-magnet-notes`** (cycle 256, kids) — Tap anywhere to drop a glowing star
  magnet; six pentatonic note-bubbles (violet C3 → rose E4) float on a dark star-field and are
  pulled toward it by spring physics. Each bubble spirals in, rings its note on arrival, bounces
  outward, drifts back. Multiple magnets (up to 4) layer independent orbital melodies. **Why open
  this**: two magnets auto-appear at load so the bubbles are already drifting before you tap —
  touch the screen, a magnet appears, and two more bubbles swing toward it. Place magnets in
  different spots to hear how the orbital rate changes (closer = faster rings). Kids 3+ · Zero
  permissions · Zero deps · demoable.

- **`/dream/221-optical-flow-music`** (cycle 255, adult) — Move in front of the camera — the
  motion IS the music. Frame differencing → filter brightness + pitch + reverb. Demo mode works
  without camera. First prototype where stillness = silence. Inspired by `217-dance-avatar` ❤️.

- **`/dream/220-kids-fireworks`** (cycle 254, kids) — Tap the dark sky → rocket arcs toward your
  finger → 22 pentatonic sparks explode.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **`fourier-paint`** (suggested next adult cycle 257) — draw a 2D closed path → watch Fourier
  epicycles decompose it into rotating arms → hear the harmonic magnitudes as tones. Direct sibling
  to `219-waveshape-draw`. Zero deps, high surprise.

- **`paths-granular`** (waiting on your OK) — granular synthesis of your Welcome Home album tracks
  via `/api/audio/[id]`. Is that route publicly accessible without auth? One "yes" unlocks it.

## Open questions for Karel

- **`/api/audio/[id]`**: publicly accessible without auth? Unlocks `paths-granular` — granular
  synthesis of your actual piano recordings.

- **Optical Flow Music (221)**: want a multi-oscillator chord mode? Currently one sine oscillator.
  A minor-third + fifth stack when totalMag > 0.5 would give richer texture. Also: sensitivity
  slider for low-light cameras?

- **Kids magnet notes (222)**: the bubbles ring on every inward pass at COOLDOWN=0.7s. Want faster
  (more notes) or slower (more space)? Also considering adding a second harmonic partial for richer
  bell timbre.

- **FAL_KEY budget**: `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on your go-ahead.
