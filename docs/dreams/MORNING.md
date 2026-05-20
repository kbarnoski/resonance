# Morning digest — last updated 2026-05-20 UTC (Cycle 58)

## New since yesterday

- **[/dream/49-anemone-av](/dream/49-anemone-av)** — Anemone AV `demoable`
  A bioluminescent sea anemone that dances to audio — the most visually organic
  thing in the sandbox. 14 tentacles, 4 FK-chained segments each. Sub-bass sways
  the whole trunk; treble pulses the glowing violet tip beads; percussive hits
  flash all tips simultaneously.
  **Open this**: click Demo mode — no mic needed. Watch the tentacle ring ripple.
  Then Start mic and play something with a strong bass line — the trunk sway
  doubles. Hit a loud percussive note and watch the full-body flash.
  Zero new deps. Build validated, 3.74 kB.

- **[/dream/48-arc-compose](/dream/48-arc-compose)** — Arc Compose `demoable` (Cycle 57)
  Write a journey arc with section tags → MiniMax 2.6 generates a structured 60–90s piece.
  Default arc: Intro (single piano) → Build Up (cello drone) → Chorus (full orchestra) → Outro.
  $0.03/generation, FAL_KEY already in use.
  ⚠ API note: endpoint `fal-ai/minimax/music-01` from naming conventions. Paste raw error
  text if it doesn't work and I'll fix next cycle.

## In progress / partial

- Nothing in-progress. All recent prototypes are `demoable`.

## Research findings worth a look (Cycle 56)

- **`tap-rhythm`** — queued next. Tap/clap → onset detection → circular step sequencer
  → Karplus-Strong drum synthesis. Zero deps, zero API. First prototype where a non-musician
  can create something by just clapping.
- **Flow Music + Lyria 3 Pro (§85)** — Stem Splitter extracts drums/bass/piano from any
  AI track. Enables `stem-spatial`: generate → split → HRTF-position each stem in 3D.
  Needs GEMINI_API_KEY.

## Open questions for Karel

1. **GEMINI_API_KEY** — still the biggest unlock. Enables: `lyria-ghost` (Ghost scene →
   30s ambient score), `binaural-lyria` (brainwave state + matching AI ambient music),
   `piano-to-ghost` (your chords → Ghost image + music simultaneously), `stem-spatial`
   (Lyria 3 Pro → stems → HRTF 3D positioning). Four prototypes from one key.
2. **`arc-compose` API** — if the prototype shows an error at `/dream/48-arc-compose`,
   paste the raw error message here and I'll fix the endpoint next cycle.
3. **`anemone-av` visual depth** — if you want to go deeper: a second inner ring of shorter
   tentacles, GLSL vertex displacement for smoother (non-piecewise) bending, particle
   spawn from tip beads on onset hits. Happy to polish next if this prototype resonates.
