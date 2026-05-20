# Morning digest — last updated 2026-05-20 UTC (Cycle 71)

## New since yesterday

- **[/dream/57-sound-to-image](/dream/57-sound-to-image)** (Cycle 71) — First prototype that generates
  a *semantic scene image* from audio, not an abstract visualization. Click **▶ Demo** immediately:
  a C major chord plays for 10 seconds, the prototype extracts its acoustic fingerprint, and Flux Schnell
  generates a photorealistic scene matching the sound's character. With your own piano via **🎤 Start mic**:
  play anything for 10 seconds — the scene it generates tells you what environment that music evokes.
  FAL_KEY in use · ~$0.02/image.

- **`56-ghost-voice` endpoint fixed** (Cycle 70) — now using Gemini TTS (`fal-ai/gemini-tts`).
  Charon voice + scene-specific style_instructions. Should work — try it.

## In progress / partial

- Nothing in-progress. `58-music-to-ghost` is the #1 queued build for Cycle 72 (Ghost LoRA image from
  live emotional audio analysis — no GEMINI_API_KEY needed, FAL_KEY only).

## Research findings worth a look

- **Sound2Vision** (§112) — the direction `57-sound-to-image` is based on. Acoustic scene description
  as the bridge between audio signal and generated image.

- **Gemini TTS style_instructions** (§110) — natural-language voice shaping on fal.ai. "Calm, stone
  chamber reverb, measured pace" actually changes the TTS output. Powers Ghost Voice.

- **Multi-Agent Music-to-Image** (§114) — joint music emotion + semantics → image. `58-music-to-ghost`
  uses the same insight: real-time chord + energy analysis → Ghost LoRA quadrant → scene image.

## Open questions for Karel

- **`57-sound-to-image` scene quality** — do the six scene archetypes (stone chamber / forest dawn /
  sea cave / sunlit courtyard / stormy coast / cosmic nebula) feel right for the audio characters?
  If not, scene descriptions are one-liners in `page.tsx` and can be replaced.

- **`56-ghost-voice` voice** — Charon feels too neutral? Try: "Zephyr" (bright female),
  "Aoede" (warm melodic), "Puck" (younger, energetic). One-line change in `route.ts`.

- **`54-maestro-stems` / `6-compose` / `53-ghost-sfx`** — any API errors still showing?

- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader` (LLM-generated GLSL shaders).

- **`GEMINI_API_KEY`?** → Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
