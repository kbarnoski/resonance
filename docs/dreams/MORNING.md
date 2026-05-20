# Morning digest — last updated 2026-05-20 UTC (Cycle 57)

## New since yesterday

- **[/dream/48-arc-compose](/dream/48-arc-compose)** — Arc Compose `demoable`
  Write a journey arc with section tags → MiniMax Music 2.6 generates a structured 60–90s piece.
  **Open this**: the default arc is a four-section cinematic piece (Intro → Build Up → Chorus → Outro).
  Click Compose, wait 20–40s, hear what your arc sounds like as real AI-generated music. $0.03/generation.
  This is the `18-elevenlabs-compose` idea (38 cycles queued) finally buildable at 37× lower cost.
  ⚠ API note: endpoint from fal.ai naming conventions — if it errors, paste the message here.

## In progress / partial

- Nothing in-progress. All recent prototypes are demoable or polished.

## Research findings worth a look (Cycle 56)

- **Flow Music + Lyria 3 Pro (§85)**: Google's AI music studio now has a Stem Splitter — extract
  drums/bass/piano from any AI-generated track. Enables `stem-spatial`: generate a track → split →
  HRTF-position each stem around you in 3D. Needs GEMINI_API_KEY (same key as lyria-ghost).
- **MiniMax 2.6 (§86)**: 14+ structural section tags at $0.03/generation. Built this cycle as
  `arc-compose`. Next: `stem-spatial` uses MiniMax to generate the track being split.
- **`anemone-av` (§92)**: Bioluminescent organic 3D form dancing to audio. Three.js TSL.
  All deps already installed (three@0.182, R3F, drei, postprocessing). Zero new packages.
  Most visually distinctive prototype idea in the queue.
- **`tap-rhythm` (§89)**: Tap/clap → onset detection → circular step sequencer → 
  Karplus-Strong drum synthesis. Zero deps, zero API. First prototype where rhythm is the input.

## Open questions for Karel

1. **GEMINI_API_KEY** — still the single most impactful pending thing. Unlocks `lyria-ghost`
   (Ghost scene → 30s ambient score), `binaural-lyria` (brainwave state + matching AI ambient),
   `piano-to-ghost` (your chords → Ghost image + music simultaneously), and `stem-spatial`
   (Lyria 3 Pro stem splitting). Four prototypes from one key.
2. **`arc-compose` API** — if the prototype shows an error, paste the raw error message.
   The endpoint `fal-ai/minimax/music-01` is from fal.ai naming conventions; if it's wrong
   I'll fix it next cycle.
3. **`anemone-av` or `tap-rhythm` next?** Both are zero-dep, one-cycle builds. Anemone is
   the highest visual impact; tap-rhythm is the highest live-performance accessibility.
   Happy to build whichever you'd find more surprising at a venue.
