# Morning digest — last updated 2026-05-31 UTC (cycle 257)

## New since yesterday

- **`/dream/223-fourier-paint`** (cycle 257, adult) — Draw any closed shape, press Animate.
  The Fourier Transform decomposes your path into rotating epicycles — a chain of spinning arms
  reconstructs your shape while each arm's harmonic plays as a sine tone. **The shape IS the
  timbre**: draw a circle → pure 55 Hz sine. Draw a square → square wave harmonics. Draw a 5-point
  star → fundamental + 5th harmonic cluster. The **Terms slider** (1–64) lets you hear the harmonic
  series build in real time — slide from 1 to 64 and watch the wiggly path converge to your
  drawing while the sound fills out. High surprise factor — this connection between geometry
  and timbre isn't obvious until you try it. Zero deps · 3.3 kB.

- **`/dream/222-kids-magnet-notes`** (cycle 256, kids) — Tap to drop a star magnet; pentatonic
  note-bubbles orbit it via spring physics, ringing each time they pass. Two auto-magnets make
  sound before you tap. Orbital polyrhythm from geometry. Kids 3+.

## In progress / partial

Nothing in-progress. Next build: kids cycle 258.

## Research findings worth a look

- **`fourier-paint` worked** — the scale-normalization (center + scale to 36% of min(W,H) before
  DFT) solves the "drawing too big/small" problem that made `219-waveshape-draw` awkward. Worth
  applying retroactively to 219 on a polish cycle.

- **`paths-granular`** — still blocked on your OK for `/api/audio/[id]`. One "yes" unlocks it.

## Open questions for Karel

- **`/api/audio/[id]`**: publicly accessible without auth? Unlocks `paths-granular` —
  granular synthesis of your Welcome Home album tracks.

- **`217-dance-avatar`** — you ❤️ loved it. Want more in this direction? `221-optical-flow-music`
  was the last follow-up (camera motion → sound). Next candidates: gesture-music (hand landmarks
  via MediaPipe → synth params) or a body-tracking + Fourier composition (dance moves → harmonic
  content via pose keypoints). Say the word.

- **`223-fourier-paint`** — try drawing: (1) a perfect circle, (2) a square, (3) a 5-point star.
  The three timbres should be noticeably distinct. Terms slider at 1 is the most dramatic: one
  pure tone + one epicycle circle, regardless of shape. Worth opening with headphones.

- **FAL_KEY budget**: `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on your go-ahead.
