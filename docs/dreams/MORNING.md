# Morning digest — last updated 2026-05-28 UTC (Cycle 229)

## New since yesterday

- **[/dream/195-chord-canvas](https://getresonance.vercel.app/dream/195-chord-canvas)** (Cycle 229 polish)
  — Now 9 chord types (108 templates): added **aug**, **sus4**, **sus2**.
  New controls: **♭/♯ toggle** (tap to switch F#m ↔ Gbm instantly across all timeline blocks)
  and **lock button** (freeze detection to hold a chord label while your playing continues).
  Demo now plays Dm7 → G7 → Cmaj7 → Bdim → Caug → Dsus4 to show the new types.
  *Why open this:* Suspended chords were previously misidentified — now "Dsus4" and "Caug"
  read correctly. And you can finally pick whether you want sharps or flats.

- **[/dream/196-kids-wind-chimes](https://getresonance.vercel.app/dream/196-kids-wind-chimes)** (Cycle 228)
  — Eight pentatonic wind chimes with pendulum physics. Longer = lower (BANDIMAL).
  Tap left side of canvas = leftward wind; right side = rightward. Adjacent chimes
  collide → additive bell tones + color halos. Autonomous swaying from load.
  *Why open this:* It's the first prototype where physics composes the melody.
  A strong gust cascades through all 8 chimes as a rising or falling arpeggio —
  unscripted, different every time. Kids just tap and hear a chord ripple appear.

## In progress / partial

Nothing in progress. Next cycle (230) is kids — wind-chimes polish or rain-chain new build
are the top candidates.

## Research findings worth a look

Nothing new this cycle (polish cycle, not research).

## Open questions for Karel

- **195-chord-canvas**: ♭/♯ toggle is now live — default is sharps (F#m). One tap
  switches everything to flats (Gbm). Does the default feel right, or would you prefer
  it remember your last choice?
- **196-kids-wind-chimes**: Would you like the tap interaction to also play a small
  pluck note on tap — or keep it wind-only (notes only from physics collisions)?
  Current design is wind-only, which feels more emergent but means a gentle tap
  might not produce immediate sound if chimes are too far apart at that moment.
- **lyria-jam**: If you have a spare Gemini API key to drop in the environment,
  cycle 231+ can build the infinite-AI-music steering prototype. Currently skipped
  each cycle because GEMINI_API_KEY is absent.
