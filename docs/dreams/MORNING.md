# Morning digest — last updated 2026-05-21 UTC (Cycle 72)

## New since yesterday

- **[/dream/58-music-to-ghost](/dream/58-music-to-ghost)** (Cycle 72) — Play for 8 seconds.
  The Ghost appears in the scene that matches your music's emotional character.
  Major chord + loud → Cosmic Ascension (golden particle streams, infinite space).
  Minor chord + soft → Stone Chamber (single candle, moonlit arched window).
  Four quadrants: energetic-bright, energetic-dark, calm-bright, calm-dark.
  Click **▶ Demo** for an immediate result (C major chord → calm-bright → Forest Dawn, usually).
  Ghost LoRA · fal-ai/flux-lora · ~$0.02/image · 4.5 kB.
  ⚠ Endpoint `fal-ai/flux-lora` from prod codebase — paste any error text for a fix next cycle.

- **[/dream/57-sound-to-image](/dream/57-sound-to-image)** (Cycle 71) — First prototype that generates
  a *semantic scene image* from audio fingerprint. 10s listen → Flux Schnell → photorealistic scene.
  Different from 58: maps to generic environments (sea cave, nebula, forest) not Ghost LoRA scenes.
  FAL_KEY in use · ~$0.02/image.

## In progress / partial

- Nothing in-progress. Next queued item: **`gemini-voice-lab`** — A/B comparison UI for Gemini TTS
  style_instructions on Ghost scene lines. Useful for Karel to find the Ghost's voice character.
  Zero new deps, FAL_KEY in use. One cycle.

## Research findings worth a look

- **Ghost LoRA scene mapping** — the 4-quadrant classification (energetic/calm × major/minor) maps
  cleanly to 4 of the 5 Ghost narrative scenes. The missing fifth scene (Tiny Planet) would need a
  very-low-energy + very-high-tonal-clarity bucket. Could add a 5th quadrant if the 4-way feels too coarse.

- **`57-sound-to-image` vs `58-music-to-ghost`** — two prototypes, two semantic layers. One says
  "this music sounds like a sea cave." The other says "this music puts the Ghost in the Stone Chamber."
  Interesting to run the same 8 seconds through both and see what they agree or disagree on.

## Open questions for Karel

- **`58-music-to-ghost` demo result** — does the scene feel right for C major / calm energy?
  Should be Forest Dawn. If it lands in Stone Chamber, the energy threshold (0.35) may need tuning.

- **`56-ghost-voice` voice** — Charon too neutral? Try: "Zephyr" (bright female),
  "Aoede" (warm melodic), "Puck" (younger). One-line change in `route.ts`.

- **`54-maestro-stems` / `6-compose` / `53-ghost-sfx`** — any API errors still showing?

- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader` (LLM-generated GLSL shaders).

- **`GEMINI_API_KEY`?** → Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
