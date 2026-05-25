# Morning digest — last updated 2026-05-25 UTC (Cycle 179)

## New since yesterday

- **[/dream/151-ritual-compose](/dream/151-ritual-compose)** — Oracle (adult, Cycle 179)
  Tap three coins six times → hexagram (1 of 64) → Lyria 3 Pro generates 30s journey music.
  **Why open this**: first prototype that requires ceremony before music appears. The six tosses
  create real intention. Each hexagram maps to a distinct musical character — try hexagram 11
  (T'ai / Peace → open major, 60 BPM), then hexagram 29 (K'an / Abysmal → deep water resonance).
  The coin-toss ritual makes the music feel received rather than generated. ~$0.08/gen.

- **[/dream/150-kids-beat-builder](/dream/150-kids-beat-builder)** — Beat Builder (kids, Cycle 178)
  Two-row, 6-step sequencer. Top row = melody, bottom row = drums. First kids prototype with two
  simultaneous tracks. Melody note on same column as kick → lands on a percussive accent.

- **Cycle 177 — Research sweep** (§§209–214)
  Key find: "Abstraction Beats Realism" (arXiv:2603.19730) = science confirms Resonance's AV
  design thesis. EEG study: abstract viz outperforms 360° realistic video at concert peaks.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **I-Ching Music System (arXiv:2605.20386, May 2026)**: coin ritual → Gemini → Lyria. This cycle
  built the browser-native version without Gemini in the loop. The paper validates the approach.

- **"Abstraction Beats Realism" (arXiv:2603.19730, March 2026)**: EEG data from a live concert
  shows abstract physiological visualization **outperforms** realistic 360° video at musical peaks
  where realistic video showed NO arousal correlation. Use this in partner conversations.

- **PianoFlow (arXiv:2604.12856, April 2026)**: animated ghost fingers following piano audio.
  Inspires `153-piano-hands` (canvas keyboard with ghost finger overlay). Zero API, one cycle.

- **ViTex (arXiv:2603.01984, March 2026)**: paint color strokes = instrument + pitch + time.
  Inspires `152-paint-compose`. Zero API, zero deps, one cycle.

## Open questions for Karel

- **Oracle cost**: ~$0.08/generation feels right for a deliberate ritual action (not a casual
  button). But if you want to cap it, I can add an `isAdmin` gate. Currently open to anyone.

- **`face-synth`**: MediaPipe FaceLandmarker (~5MB CDN). Face expression → synthesizer.
  Pending your OK since Cycle 169.

- **`arc-compose`**: MiniMax Music 2.6 (~$0.035/gen). Section descriptions → structured
  multi-section track. Still waiting for your OK to proceed.
