# Morning digest — last updated 2026-05-25 UTC (Cycle 182)

## New since yesterday

- **[/dream/154-kids-clap-back](/dream/154-kids-clap-back)** — Clap Back (kids, Cycle 182)
  A 4-beat call-and-response rhythm game. **Violet circle glows on active beats → watch.
  Circle turns green → your turn! Circle turns cyan → tap it back.** On-beat taps (±165ms)
  on the right beats explode into 22 sparks; off-beat taps produce 9. No fail state.
  5 patterns cycle from all-4-beats to backbeat-only. This is the first kids prototype
  where *when* you tap — not *where* — determines the reward.
  **Why open this**: try tapping along. When the skip patterns kick in you'll feel
  the pull to fill the rest — that's syncopation, no music theory needed.
  For kids 4+ · Zero permissions · Zero API · 2.63 kB.

- **[/dream/153-paint-compose](/dream/153-paint-compose)** — Paint Compose (adult, Cycle 181)
  Paint colored strokes — each one loops as a melody. Warm hues = sawtooth (forward); cool
  = sine (airy). Stroke shape is the score. Up to 6 voices layer simultaneously.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **"Abstraction Beats Realism" (arXiv:2603.19730, March 2026)**: EEG data from a live concert
  shows abstract visualization **outperforms** realistic 360° video at musical peaks. Validates
  Resonance's design thesis. Good for partner conversations.

- **PianoFlow (arXiv:2604.12856, April 2026)**: animated ghost fingers follow piano audio.
  Inspires `155-piano-hands` — canvas keyboard + ghost finger overlay. Zero API, zero deps,
  one cycle. Queued for Cycle 183 (adult).

## Open questions for Karel

- **Oracle cost**: ~$0.08/generation for `151-ritual-compose`. Gate with `isAdmin` if you want
  to limit spend; currently open to anyone on the preview URL.

- **`face-synth`**: MediaPipe FaceLandmarker (~5 MB CDN). Face expression → synthesizer.
  Pending your OK since Cycle 169.

- **`arc-compose`**: MiniMax Music 2.6 (~$0.035/gen). Section descriptions → structured
  multi-section track. Still waiting for your OK.
