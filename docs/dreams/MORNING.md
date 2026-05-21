# Morning digest — last updated 2026-05-21 UTC (Cycle 74)

## New since yesterday

- **Cycle 74 — research sweep** (no new prototype built).
  10 new RESEARCH.md entries (§§117–126), 4 new IDEAS queued.
  Most actionable: **`music-palette`** is ready to build next cycle — zero deps, zero API.

- **[/dream/59-gemini-voice-lab](/dream/59-gemini-voice-lab)** (Cycle 73) — Ghost Voice Lab.
  A/B Gemini TTS style director. Pick a scene, tweak style_instructions, compare two variants,
  vote. Votes accumulate in localStorage. Try the B variants — especially Cosmic Ascension
  ("zero affect, infinite distance").

## In progress / partial

- Nothing in-progress. Cycle 75 is a build cycle.
- **`music-palette`** queued first: live audio → arousal/valence → 5-color HSL palette + SVG download.
  Zero deps, zero API. Surprise value: makes the emotion→color connection explicit and beautiful.

## Research findings worth a look

- **Orpheus TTS phrase-level tags** (§117) — `<reverent>`, `<whispers>`, `<fearful>` per word.
  "The <reverent>resonance</reverent> here is ancient. Let yourself be <whispers>absorbed</whispers>."
  $0.001/line, FAL_KEY in use. Completely different control vocabulary from Gemini's global style.
  `orpheus-voice` prototype would add it as a 3rd track to `59-gemini-voice-lab`.

- **Ghost sings its own journey** (§118, ElevenLabs Music) — `fal-ai/elevenlabs/music` confirmed
  to accept per-section lyrics. `lyrics-journey` prototype: 6-scene Ghost journey as a
  2.5–3-minute AI song with the Ghost narrative as literal sung lyrics. ~$2.40/generation.
  Most unexpected thing in this sweep: the Ghost could actually sing.

- **Music2Palette** (§120, ACM MM 2025) — researchers independently arrived at the same
  insight as the Cycle 0 `1-live` band→color mapping: audio emotion → color is a real
  cross-modal alignment. The `music-palette` prototype makes this connection downloadable.

- **Three.js r184 + WebGPU Baseline** (§123) — WebGPU is now universal (all browsers, Jan 2026).
  r184 eliminates GC jank in long sessions. `49-anemone-av` and `21-three-mesh-av` can both
  switch to WebGPURenderer in one line. Free polish.

## Open questions for Karel

- **`lyrics-journey` budget?** ~$2.40/generation for a 3-min Ghost journey song. Worth it for a demo?

- **`59-gemini-voice-lab` vote results** — which style direction won for Stone Chamber and
  Cosmic Ascension? Paste the winning style_instructions and the agent will hard-code it into
  `56-ghost-voice` next cycle.

- **`ANTHROPIC_API_KEY` in Vercel env?** → enables `claude-shader` (LLM-generated GLSL shaders).

- **`GEMINI_API_KEY`?** → unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
