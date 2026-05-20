# Morning digest — last updated 2026-05-20 UTC (Cycle 65)

## New since yesterday

- **[/dream/6-compose](/dream/6-compose)** — Compose `demoable` (Cycle 65)
  The oldest queued prototype (61 cycles in the queue since Cycle 4). Describe a mood or
  scene in plain language → ACE-Step generates 30 seconds of music. Five Ghost scene
  presets: Forest Dawn (ceremonial drums, reverbed piano, 70 BPM), Stone Chamber (single
  piano chord, long stone reverb, 50 BPM), Underground Pool (water drip rhythm, 40 BPM),
  Cosmic Ascension (orchestral strings, 80 BPM), Tiny Planet (music box bells, 55 BPM).
  The tags textarea is always visible — you can see exactly what's sent to the model.
  Best first try: click **Forest Dawn** → click **▶ Compose** → wait ~30s.
  ⚠ Endpoint `fal-ai/ace-step` is a best-guess. Paste any error text for a fix next cycle.
  $0.006/track · FAL_KEY in use.

- **[/dream/53-ghost-sfx](/dream/53-ghost-sfx)** — Ghost SFX `demoable` (Cycle 64)
  Six Ghost scenes × three AI-generated naturalistic sounds each, placed in 3D via HRTF.
  Best demo: Forest Dawn with headphones (birds above at +60°, stream hard-left, piano front).
  ⚠ ElevenLabs endpoint still unconfirmed — paste any error text for a fix.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- Cycle 61 research identified `claude-shader` (needs `ANTHROPIC_API_KEY`) and `ghost-xr`
  (needs A-Frame CDN dep ~1MB) as the highest-priority items waiting on Karel's answers.
- Next cycle (#66) **must** be research — 4 build cycles without research (62, 63, 64, 65),
  past the 3–4 cycle cadence.

## Open questions for Karel

- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader` (Claude generates
  audio-reactive GLSL shaders from text descriptions, runs live in browser). ~$0.001/gen.
- **`GEMINI_API_KEY`?** → Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`,
  `piano-to-ghost` (4 queued prototypes, very different capabilities).
- **A-Frame CDN dep (~1MB) OK?** → Enables `ghost-xr` (stand *inside* Ghost scene spatial
  audio world via WebXR, head-tracked on Quest/Vision Pro).
- **`6-compose` working?** Did Forest Dawn generate a 30s track? Or red error text?
  (ACE-Step endpoint is a best-guess from naming conventions — paste error text if so.)
- **`53-ghost-sfx` working?** Same question for the ElevenLabs SFX endpoint.
