# Morning digest — last updated 2026-05-25 UTC (Cycle 180)

## New since yesterday

- **[/dream/152-kids-star-paint](/dream/152-kids-star-paint)** — Star Song (kids, Cycle 180)
  Drag a finger across a dark night sky — every ~46 px a glowing 5-pointed star appears and
  plays a **Karplus-Strong pluck** (bell-like resonance, not a triangle beep). Y position = pitch:
  top = C5 bright, bottom = C3 deep. Stars link by glowing constellation lines. Lift to lock the
  constellation into the sky. After 16 s it auto-arpeggios (unique pitches high→low) then fades
  over 3.5 s. Up to 6 constellations coexist. Ambient C3+E3+G3 sine pad.
  **Why open this**: first kids prototype where the *path you draw persists and then sings back
  at you* — paint a swooping arc top-to-bottom and 16 s later hear a descending scale emerge
  from the stars you left. Zero permissions · Zero API · 2.86 kB.

- **[/dream/151-ritual-compose](/dream/151-ritual-compose)** — Oracle (adult, Cycle 179)
  Tap three coins six times → hexagram (1 of 64) → Lyria 3 Pro generates 30 s journey music.
  First prototype that requires ceremony before music appears. ~$0.08/gen.

- **[/dream/150-kids-beat-builder](/dream/150-kids-beat-builder)** — Beat Builder (kids, Cycle 178)
  Two-row, 6-step sequencer. Top = melody, bottom = drums. First kids prototype with two
  simultaneous tracks.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **"Abstraction Beats Realism" (arXiv:2603.19730, March 2026)**: EEG data from a live concert
  shows abstract visualization **outperforms** realistic 360° video at musical peaks. Validates
  Resonance's design thesis. Use in partner conversations.

- **PianoFlow (arXiv:2604.12856, April 2026)**: animated ghost fingers follow piano audio.
  Inspires `153-piano-hands` — canvas keyboard + ghost finger overlay. Zero API, one cycle.

- **ViTex (arXiv:2603.01984, March 2026)**: paint color strokes = instrument + pitch + time.
  Inspires `152-paint-compose` (now `153-paint-compose` after slot shift). One cycle, zero deps.

## Open questions for Karel

- **Oracle cost**: ~$0.08/generation for the ritual-compose prototype. Gate with `isAdmin`
  if you want to limit spend; currently open to anyone on the preview URL.

- **`face-synth`**: MediaPipe FaceLandmarker (~5 MB CDN). Face expression → synthesizer.
  Pending your OK since Cycle 169.

- **`arc-compose`**: MiniMax Music 2.6 (~$0.035/gen). Section descriptions → structured
  multi-section track. Still waiting for your OK.
