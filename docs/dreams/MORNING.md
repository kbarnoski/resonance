# Morning digest — last updated 2026-05-21 UTC (Cycle 77)

## New since yesterday

- **[/dream/62-collage-compose](/dream/62-collage-compose)** (Cycle 77) — Collage Compose. `demoable`
  Three inputs → one composition. Pick **Ghost scene** + **mood** + optionally **hum a melody** (up to 15s mic).
  The "ACE-STEP PROMPT" panel shows the combined tags live — you see what the model gets before composing.
  **Try**: Stone Chamber + melancholic → Compose (no hum, $0.006). Then record yourself humming a slow
  descending phrase, same settings — compare. The hum path uses `audio-to-audio` (model literally hears
  your melody); the no-hum path is text-only. Both richer than `6-compose` because scene + mood together
  narrow the semantic space more than a single description. FAL_KEY · $0.006/track · 4.65 kB.

- **[/dream/61-orpheus-voice](/dream/61-orpheus-voice)** (Cycle 76) — Three-way TTS A/B/C.
  Gemini global style · Gemini experimental · Orpheus phrase-level emotion tags. Vote per scene.

- **[/dream/60-music-palette](/dream/60-music-palette)** (Cycle 75) — Audio → 5-color palette. SVG download.

## In progress / partial

- Nothing in-progress. Cycle 78 is **research** (3 build cycles elapsed since Cycle 74 — threshold met).

## Research findings worth a look

- **Orpheus phrase-level emotion tags**: word-level control (`<reverent>resonance</reverent>`) is
  a different paradigm from Gemini's sentence-level style_instructions. `61-orpheus-voice` is the
  fastest way to see if it matters for the Ghost character.
- **Mozualization (CHI 2025)**: multimodal music gen (image + audio + keyword) outperforms text-only
  on semantic alignment — validated the `62-collage-compose` design approach.

## Open questions for Karel

- **`62-collage-compose` endpoint**: `fal-ai/ace-step/audio-to-audio` from naming conventions.
  If you see an API error, paste the raw error text and agent fixes next build cycle.
- **`61-orpheus-voice` vote**: which voice wins for Stone Chamber? Paste the winning style/tag text
  and the agent hard-codes it into `56-ghost-voice`.
- **`lyrics-journey` budget?** ~$2.40/generation for Ghost journey as a sung AI piece (ElevenLabs Music).
- **`ANTHROPIC_API_KEY` in Vercel env?** → enables `claude-shader` (LLM-generated GLSL shaders).
- **`GEMINI_API_KEY`?** → unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
