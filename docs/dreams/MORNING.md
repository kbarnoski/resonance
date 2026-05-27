# Morning digest — last updated 2026-05-27 UTC (Cycle 217)

## New since yesterday

- **[/dream/185-score-structure](https://getresonance.vercel.app/dream/185-score-structure)**
  — *The architecture of your improvisation.* Hit ▶ Demo, watch a ii–V–I–IV chord sequence
  build a scrolling timeline in real time. Each chord block is hue-coded by root (violet=C,
  amber=B), width = how long the chord was held. Below: a live chromagram shows which pitch
  classes are active. Every 8 seconds the section auto-labels: Intro → Build → Climax →
  Resolution → Coda. **Why open this**: it's the first prototype that reads musical structure
  rather than just acoustic signal — you'll see your playing's narrative arc.

## In progress / partial

- **185-score-structure** chord detection is major/minor only; G7 in the demo is detected as
  "G" (correct root, missing the 7th). Dom7/dim/maj7 templates are an obvious next polish.

## Research findings worth a look

- Nothing new this cycle — no research sweep. Cycle 213 research (Stable Audio 3, PianoFlow,
  LUMIA, Lyria 3 Pro on fal.ai) is still fresh and actionable. See RESEARCH.md §§227–233.

## Open questions for Karel

- **GEMINI_API_KEY**: `ritual-generate` (I-Ching → Lyria 3 Pro) and `camera-compose`
  (webcam snapshot → ambient track) are both spec-complete and waiting only for this key.
  Once it's in environment vars, either ships in one cycle.
- **Score Structure chord templates**: should I add dom7/dim/maj7 to the detector? Makes the
  jazz demo labels accurate (Dm7 / G7 / Cmaj7 instead of Dm / G / C).

## Recent cycle log

| Cycle | Type     | Prototype            | Summary |
|-------|----------|----------------------|---------|
| 217   | adult    | 185-score-structure  | Chord timeline + section classifier. First structural analysis prototype. |
| 216   | kids     | 184-kids-gravity-harp | Balls fall through KS strings, ascending+descending pentatonic scale. |
| 215   | adult    | 183-piano-motion     | Two animated hands spring across a 61-key keyboard via FFT peak detection. |
| 214   | kids     | 182-kids-crystal-song | Glass-bell cave: 6 crystals, hold to sustain, resonance flash at 4+. |
| 213   | research | —                    | §§227–233: Stable Audio 3, PianoFlow, LUMIA, Lyria 3 Pro, SAMUeL, Mirelo. |
