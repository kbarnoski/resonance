# Morning digest — last updated 2026-05-20 UTC (Cycle 67)

## New since yesterday

- **[/dream/54-maestro-stems](/dream/54-maestro-stems)** — Maestro Stems `demoable` (Cycle 67)
  Pick a style (Cinematic, Jazz Trio, Ambient, Folk, Electronic). Click **Generate Track + Stems**.
  Beatoven Maestro returns a ~2.5-minute instrumental **plus four separate stems**. Each stem
  plays from its own 3D position: drums overhead, bass below, melody front-right, harmony
  front-left. Per-stem mix sliders and mute. Wear headphones.
  The key difference from `7-spatial` (frequency-band splitting): this splits by **musical role**.
  The drum comes from above because it's the drum — not because of its frequency range.
  ⚠ Endpoint `beatoven/music-generation` is a best-guess. Paste any error text for a fix.
  $0.10/track · FAL_KEY in use.

- **[/dream/6-compose](/dream/6-compose)** — Compose `demoable` (Cycle 65)
  Describe a mood → ACE-Step generates 30s of music. Five Ghost scene presets.
  ⚠ Endpoint `fal-ai/ace-step` still unconfirmed. Paste error text if it fails.

- **[/dream/53-ghost-sfx](/dream/53-ghost-sfx)** — Ghost SFX `demoable` (Cycle 64)
  Six Ghost scenes × three AI-generated naturalistic sounds in 3D via HRTF.
  ⚠ ElevenLabs endpoint still unconfirmed.

## In progress / partial

- Nothing in-progress. Next build cycle: `webgpu-audio-fx` (Three.js TSL GPU audio + visual,
  zero new deps) or `ghost-voice` (Inworld TTS narration for Ghost scenes, FAL_KEY in use).

## Research findings worth a look (Cycle 66)

- **Beatoven Maestro** (§101) — 2.5-min instrumentals + stems. Built this cycle as `54-maestro-stems`.
- **Three.js WebGPU Compute Audio** (§102) — TSL compute shader does GPU pitch-shift + 6-layer
  delay. Zero new deps (`three@0.182` installed). Inspires `webgpu-audio-fx` — GPU audio DSP and
  GPU rendering in the same pipeline. Direct path to `27-gpu-additive`.
- **Inworld TTS-1.5 Max** (§105) — FAL_KEY in use, sub-150ms expressive TTS. Inspires `ghost-voice`:
  Ghost scene narration HRTF front-center + subtitle. Would complete `53-ghost-sfx`.
- **Conducting Gesture** (§106, arxiv 2604.27957) — skeleton tracking → orchestra tempo/dynamics.
  Inspires `conductor` (needs MediaPipe CDN dep, same as `31-gesture-music`).

## Open questions for Karel

- **`54-maestro-stems` working?** Do stems decode? Or red error text? (Beatoven endpoint unconfirmed.)
- **`6-compose` working?** ACE-Step endpoint still unconfirmed — any red error?
- **`53-ghost-sfx` working?** ElevenLabs SFX endpoint unconfirmed.
- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader` (~$0.001/gen, very high impact).
- **`GEMINI_API_KEY`?** → Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`, `piano-to-ghost`.
- **MediaPipe CDN (~8MB) OK?** → Enables `gesture-music` + `conductor`.
