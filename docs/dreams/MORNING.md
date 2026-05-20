# Morning digest — last updated 2026-05-20 UTC (Cycle 70)

## New since yesterday

- **`56-ghost-voice` endpoint fixed** (Cycle 70) — was broken (`fal-ai/inworld/tts`), now uses
  **Gemini TTS** (`fal-ai/gemini-tts`). Key reason for the switch: Gemini TTS has a
  `style_instructions` field that accepts natural-language voice direction — exactly what the
  scene descriptions need ("calm, androgynous, stone chamber reverb, ancient and measured").
  Inworld TTS only takes named voice presets. Voice: Charon. Should work now — give it a try.

- **Research sweep** (Cycle 70) — 8 findings in RESEARCH.md §§109–116. Three new prototype
  ideas queued. Highlights below.

## In progress / partial

- Nothing in-progress. `57-sound-to-image` is the #1 queued build for Cycle 71.

## Research findings worth a look (Cycle 70)

- **Gemini TTS style_instructions** (§110) — natural-language voice direction on fal.ai. FAL_KEY
  in use. Now powering Ghost Voice. Useful for any future narration/spoken prototype.

- **Sound2Vision** (§112, arxiv 2412.06209) — audio → semantic generated image. The idea:
  10s of mic input → describe the acoustic scene in text → Flux image on fal.ai. "What does
  your music look like?" First prototype that generates an *interpreted visual scene* from audio
  (not a real-time abstract visualizer). Queued as `57-sound-to-image`. One cycle, FAL_KEY in use.

- **Music-to-Ghost** (§114 via arxiv 2512.23320) — detect chord quality + energy from mic →
  map to emotion quadrant → generate matching Ghost LoRA image. Admin-only, FAL_KEY in use.
  "A 5-second listen tells the story." Queued as `58-music-to-ghost`. One cycle.

- **Live Music Models** (§111, arxiv 2508.04651, Google DeepMind) — confirms Magenta RealTime
  (open-weights) and Lyria RealTime (API) are production-quality real-time steering models.
  `30-lyria-jam` needs your GEMINI_API_KEY when ready.

## Open questions for Karel

- **`56-ghost-voice` voice quality** — Charon is "calm, professional male." If it's too neutral,
  try "Zephyr" (bright female) or "Aoede" (warm melodic). One-line change in `route.ts`.
- **`54-maestro-stems` / `6-compose` / `53-ghost-sfx`** — three prototypes with best-guess endpoints.
  Any errors still showing?
- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader` (LLM-generated GLSL shaders).
- **`GEMINI_API_KEY`?** → Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
