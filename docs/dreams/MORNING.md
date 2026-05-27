# Morning digest — last updated 2026-05-27 UTC (Cycle 214)

## New since yesterday

- **[/dream/182-kids-crystal-song](https://getresonance.vercel.app/dream/182-kids-crystal-song)** — Crystal Song (kids 3+, Cycle 214)
  Six glowing crystals in a dark cave. Tap to ring; **hold** to sustain a glass-bell note.
  Taller crystal = lower pitch. Hold four or more at once → the whole cave pulses with a
  resonance flash. Crystals shimmer slowly before first touch — the cave is already alive.
  **New kids dimensions**: sustained tones (hold = longer note) and glass bell timbre (additive
  partials, different from every prior kids synth). No start button — first tap creates audio.

- **Research sweep (Cycle 213)** — 7 new findings, 3 new prototype specs seeded.
  Key: ritual-generate (I-Ching → Lyria), camera-compose (webcam → ambient), piano-motion (animate your recordings).

- **[/dream/181-kids-texture-drum](https://getresonance.vercel.app/dream/181-kids-texture-drum)** — Texture Drum (Cycle 212)
  Five materials: Wood · Metal · Water · Earth · Glass, each with a distinct synth timbre.

## In progress / partial

Nothing currently in-progress.

## Research findings worth a look

Three prototype seeds from Cycle 213 are particularly strong:

**`ritual-generate`** (§228, ICMC 2026) — I-Ching coin-casting → hexagram → Lyria 3 Pro
ambient piece. Six virtual coin throws before any music plays. Needs GEMINI_API_KEY.
Most surprising interaction paradigm in the queue.

**`piano-motion`** (§229, PianoFlow, arxiv Apr 2026) — load a Welcome Home track via
`/api/audio/[id]`, extract notes, animate cartoon piano hands. Zero deps. First prototype
about the ACT of playing rather than the sound.

**`camera-compose`** (§231, LUMIA, NeurIPS 2025) — webcam snapshot → Gemini vision →
Lyria 3 Pro ambient. "Take a photo. Hear its music." Needs GEMINI_API_KEY.

**Lyria 3 Pro** now live on fal.ai (`fal-ai/lyria3/pro`) — upgrades all queued Lyria specs.

## Open questions for Karel

- **GEMINI_API_KEY**: `ritual-generate` and `camera-compose` both need it. Both are one-cycle
  builds once available. Confirm + I'll queue the next one.

- **Crystal Song polish direction**: README has four options — (1) stalactites from ceiling,
  (2) crystal growth during long play, (3) mic-reactive shimmer, (4) resonance arpeggio on
  4-crystal chord. Which direction appeals most?

- **`piano-motion` track IDs**: can use your Welcome Home album via `/api/audio/[id]`. Which
  tracks should appear in the picker, or should I start with a hardcoded Bach fallback?
