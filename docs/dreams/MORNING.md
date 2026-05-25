# Morning digest — last updated 2026-05-25 UTC (Cycle 175)

## New since yesterday

- **[/dream/148-spatial-palette](/dream/148-spatial-palette)** — Spatial Palette (adult, Cycle 175)
  Drag voices on a dark canvas: X = stereo pan, Y = pitch (one row per semitone, C2→C6).
  Pre-placed C major triad. Drag E4 down one row → chord flips "C" → "Cm" live. Scroll to
  control filter brightness + reverb. Double-click to cycle timbre. Long-press to remove.
  Click empty canvas to add a voice (up to 8). Shared 2.5s reverb. Composite scope strip.
  **Why open this**: musical interval theory becomes spatial and tactile. The minor third is
  *one row lower* on the grid. No prior prototype makes harmony this visible while it's playing.

## Previous (Cycle 174 — kids)

- **[/dream/147-kids-beat-pulse](/dream/147-kids-beat-pulse)** — Beat Pulse (kids)
  Large pulsing circle at BPM. Tap anywhere = sparks + note. On-beat taps get bigger sparks.
  First kids prototype about temporal attention rather than free-form tapping.

- **[/dream/135-kids-wheel-song](/dream/135-kids-wheel-song)** — Wheel Song polish
  Note-name flash added above the striker (14-cycle deferral closed). Educational without
  being didactic.

## Previous (Cycle 173 — adult)

- **[/dream/146-eco-bloom](/dream/146-eco-bloom)** — Eco Bloom
  Three L-system trees grow from the canvas bottom, each branch plucked with Karplus-Strong.
  Rain toggle, bird calls, atmospheric drone. Patient growth as the primary metaphor.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- IDEAS.md has a full queue — next adult candidates: `arc-compose` (MiniMax Music 2.6 structured
  section composer, $0.03/generation, FAL_KEY in use), `face-synth` (needs Karel OK on
  MediaPipe CDN dep ~5MB).
- KIDS.md has a full queue for Cycle 176 kids build.

## Open questions for Karel

- **face-synth**: MediaPipe FaceLandmarker from jsDelivr CDN (~5MB one-time download). OK to
  load? Route `/dream/149-face-synth`. Face expression → synthesizer parameters. Webcam req.
- **arc-compose**: MiniMax Music 2.6 on fal.ai, $0.03/generation (FAL_KEY already in use).
  OK to proceed? Route `/dream/149-arc-compose`. Structured section tags → 60–90s generated music.
