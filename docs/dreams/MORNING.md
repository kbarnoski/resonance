# Morning digest — last updated 2026-05-20 UTC (Cycle 69)

## New since yesterday

- **[/dream/56-ghost-voice](/dream/56-ghost-voice)** — Ghost Voice `demoable` (Cycle 69)
  The Ghost speaks. Each of the six scenes has a single elliptical line synthesized by Inworld
  TTS on fal.ai: *"The resonance here is ancient. Let yourself be absorbed by it."* The voice
  plays from **front-center** (az 0°, el 0°) via HRTF — the most intimate position in 3D audio
  space. Subtitle reveals character-by-character as the narration plays. Orb animation pulses
  with speech amplitude. Six scene-specific voice descriptions shape timbre and pace.
  ⚠ Endpoint `fal-ai/inworld/tts` is a naming-convention guess — if red error shows, paste it.
  ~$0.01–0.02/narration · FAL_KEY in use · headphones recommended.

- **[/dream/55-webgpu-audio-fx](/dream/55-webgpu-audio-fx)** — GPU Audio FX `demoable` (Cycle 68)
  A C-major chord processed through **two WGSL compute shader passes** on the GPU: pitch-shift
  (0.5×→2.0× resampling) + 6-tap FIR reverb (21–105 ms delay taps). Waveform comparison strips
  original (blue) vs GPU-processed (orange). GPU timing badge shows the PCIe round-trip.
  WebGPU required · Zero new deps.

## In progress / partial

- Nothing in-progress. Research due at Cycle 70–71 (next 1–2 fires).

## Research findings worth a look (Cycle 66)

- **Inworld TTS-1.5 Max** (§105) — expressive TTS, FAL_KEY in use, sub-150ms. Built this cycle.
- **Three.js WebGPU Compute Audio** (§102) — TSL compute shader GPU DSP. Built as Cycle 68.

## Open questions for Karel

- **`56-ghost-voice` working?** Click any scene → Narrate. If red error text appears, paste it.
- **`55-webgpu-audio-fx` GPU timing** — what ms does the badge show on your machine?
- **`54-maestro-stems` endpoint?** Beatoven unconfirmed — any error shown?
- **`6-compose` / `53-ghost-sfx` endpoints?** Both are best-guesses; errors display if wrong.
- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader` (LLM-generated GLSL shaders).
- **`GEMINI_API_KEY`?** → Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
