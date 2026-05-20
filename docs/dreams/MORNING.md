# Morning digest — last updated 2026-05-20 UTC (Cycle 68)

## New since yesterday

- **[/dream/55-webgpu-audio-fx](/dream/55-webgpu-audio-fx)** — GPU Audio FX `demoable` (Cycle 68)
  First prototype where audio **signal samples** are computed on the GPU (not just visualized).
  A C-major chord is synthesized in JS, uploaded to a WebGPU storage buffer, then run through
  two sequential WGSL compute passes: **pitch-shift** (speed resampling — slider 0.5×→2.0×) and
  **6-tap FIR reverb** (delay comb at 21–105 ms — slider 0%→90%). Two waveform strips show
  original (blue) vs GPU-processed (orange). Spectrum plays through the processed audio.
  All 54 prior prototypes analyze or visualize audio. This one modifies the signal samples.
  WebGPU required (same as `15-webgpu-fluid`, `16-particle-life-gpu`). Zero new deps.

- **[/dream/54-maestro-stems](/dream/54-maestro-stems)** — Maestro Stems `demoable` (Cycle 67)
  Five style presets → Beatoven generates a full instrumental track + four stems. Each stem
  placed at a different 3D HRTF position. Drums overhead, bass below, melody front-right.
  ⚠ Endpoint `beatoven/music-generation` is a best-guess. Paste error text for a fix.
  $0.10/track · FAL_KEY in use.

## In progress / partial

- Nothing in-progress. Next build cycle: `ghost-voice` (Inworld TTS Ghost narration, FAL_KEY in
  use, ~$0.01/line) or more GPU audio polish on `55-webgpu-audio-fx` (PSOLA, mic capture).

## Research findings worth a look (Cycle 66)

- **Three.js WebGPU Compute Audio** (§102) — TSL compute shader GPU pitch-shift + delay. Built
  as `55-webgpu-audio-fx` this cycle. Confirms GPU DSP path is viable in a Next.js dream prototype.
- **Inworld TTS-1.5 Max** (§105) — FAL_KEY in use, sub-150ms expressive TTS. Ready to build
  `ghost-voice` — Ghost scene narration HRTF front-center. Completes `53-ghost-sfx`.

## Open questions for Karel

- **`55-webgpu-audio-fx` GPU timing** — what does the "GPU: X ms" badge show on your machine?
  On a discrete GPU (M2/M3 or NVIDIA) expect ~10–30ms. On iGPU expect ~50–100ms.
- **`54-maestro-stems` working?** Beatoven endpoint unconfirmed — any red error text?
- **`6-compose` working?** ACE-Step endpoint unconfirmed.
- **`53-ghost-sfx` working?** ElevenLabs SFX endpoint unconfirmed.
- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader` (LLM-generated audio-reactive shaders).
- **`GEMINI_API_KEY`?** → Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
