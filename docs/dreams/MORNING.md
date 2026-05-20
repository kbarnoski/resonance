# Morning digest — last updated 2026-05-20 UTC (Cycle 66)

## New since yesterday

- **Cycle 66 was a research sweep** (no new prototype). 8 new entries in RESEARCH.md (§§101–108).
  3 new prototype ideas added to IDEAS.md. Highlights below.

- **[/dream/6-compose](/dream/6-compose)** — Compose `demoable` (Cycle 65)
  Describe a mood → ACE-Step generates 30s of music. Five Ghost scene presets.
  ⚠ Endpoint `fal-ai/ace-step` is a best-guess. Paste any error text for a fix.
  $0.006/track · FAL_KEY in use.

- **[/dream/53-ghost-sfx](/dream/53-ghost-sfx)** — Ghost SFX `demoable` (Cycle 64)
  Six Ghost scenes × three AI-generated naturalistic sounds in 3D via HRTF.
  Best: Forest Dawn with headphones. ⚠ ElevenLabs endpoint unconfirmed.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **Beatoven Maestro on fal.ai** (§101) — NEW. `beatoven/music-generation`, $0.10/req, 2.5-min
  instrumentals + **individual stems** (drums/bass/melody/other). FAL_KEY in use. Next prototype:
  `maestro-stems` — generate a full track, decode the stems, HRTF-place each one in 3D. The band
  plays around you. More natural spatial separation than `7-spatial` (role-based, not frequency-based).

- **Three.js WebGPU Compute Audio** (§102) — Three.js r171+ ships a `webgpu_compute_audio` example:
  TSL compute shader does GPU pitch-shift + 6-layer delay on an audio buffer; `AnalyserNode` output
  feeds a visual texture. Zero new deps. Inspires `webgpu-audio-fx` — GPU audio DSP + GPU visuals in
  one pipeline. Direct path to `27-gpu-additive` without raw WGSL.

- **Inworld TTS-1.5 Max on fal.ai** (§105) — Expressive TTS with voice cloning, FAL_KEY in use.
  Inspires `ghost-voice`: Ghost narrative lines spoken by a custom voice, placed HRTF front-center
  in the scene, with subtitle overlay. Would complete `53-ghost-sfx` with a narrated Ghost character.

- **Art2Mus** (§103, arxiv 2602.17599) — Direct artwork→music without text intermediary.
  Ghost scene image directly conditions a music LDM. No API yet, but validates `lyria-ghost` direction.

- **Conducting Gesture** (§106, arxiv 2604.27957) — Skeleton tracking → real-time orchestra
  tempo/dynamics control at a museum. Inspires `conductor` (needs MediaPipe CDN dep same as
  `31-gesture-music`). Live performance relevance: conduct BPM and gain from across the room.

## Open questions for Karel

- **`6-compose` working?** Did Forest Dawn generate a 30s track, or red error text?
  (ACE-Step endpoint is a best-guess from naming conventions — paste error text if so.)
- **`53-ghost-sfx` working?** Same question for the ElevenLabs SFX endpoint.
- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader` (~$0.001/gen, very high impact).
- **`GEMINI_API_KEY`?** → Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`, `piano-to-ghost`.
- **MediaPipe CDN (~8MB) OK?** → Enables `gesture-music` + new `conductor` prototype.
- **Beatoven Maestro stems interesting?** → Agent builds `maestro-stems` next cycle if yes.
