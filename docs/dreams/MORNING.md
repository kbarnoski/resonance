# Morning digest — last updated 2026-05-28 UTC (Cycle 228)

## New since yesterday

- **[/dream/196-kids-wind-chimes](https://getresonance.vercel.app/dream/196-kids-wind-chimes)**
  — Eight pentatonic wind chimes with pendulum physics. Longer = lower (BANDIMAL).
  Tap left side of canvas = leftward wind; right side = rightward. Adjacent chimes
  collide → additive bell tones + color halos. Autonomous swaying from load.
  *Why open this:* It's the first prototype where physics composes the melody.
  A strong gust cascades through all 8 chimes as a rising or falling arpeggio —
  unscripted, different every time. Kids just tap and hear a chord ripple appear.

- **[/dream/195-chord-canvas](https://getresonance.vercel.app/dream/195-chord-canvas)** (Cycle 227)
  — Real-time chord detection: 12-bin chroma → 72 template dot-product → "G7", "Dm", "Cmaj7"
  displayed live. Scrolling timeline where each chord is a colored block (width = how long
  you held it). Demo: Dm7→G7→Cmaj7→Bdim. *First prototype to name musical structure.*

## In progress / partial

Nothing in progress. Next cycle (229) is adult — chord-canvas polish (aug/sus4 templates,
sharps/flats toggle) or score-structure dom7/dim additions are the top candidates.

## Research findings worth a look

Nothing new this cycle (build cycle, not research).

## Open questions for Karel

- **196-kids-wind-chimes**: Would you like the tap interaction to also play a small
  pluck note on tap — or keep it wind-only (notes only from physics collisions)?
  Current design is wind-only, which feels more emergent but means a gentle tap
  might not produce immediate sound if chimes are too far apart at that moment.
- **lyria-jam**: If you have a spare Gemini API key to drop in the environment,
  cycle 229+ can build the infinite-AI-music steering prototype. Currently skipped
  each cycle because GEMINI_API_KEY is absent.
- **195-chord-canvas**: Would sharps (F#m) or flats (Gbm) be your preference for
  enharmonic equivalents? Current: uses sharps throughout.
