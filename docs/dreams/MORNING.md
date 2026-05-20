# Morning digest — last updated 2026-05-20 UTC (Cycle 64)

## New since yesterday

- **[/dream/53-ghost-sfx](/dream/53-ghost-sfx)** — Ghost SFX `demoable` (Cycle 64)
  Six Ghost scenes (Stone Chamber → Cosmic Ascension) each with three AI-generated
  naturalistic sounds placed in 3D space via Web Audio HRTF PannerNode. Click a scene
  → sounds generate concurrently from ElevenLabs on fal.ai → loop spatially around you.
  Canvas: top-down sphere view with glowing scene-colored source dots and elevation hints.
  **Wear headphones.** Best demo: Forest Dawn (birds above at +60°, stream hard-left,
  piano front) or Cosmic Ascension (vast drone all around, shimmer rising at +30°
  elevation, sub pulse from below at −50°).
  ⚠ Endpoint `fal-ai/elevenlabs/sound-generation` is a naming-convention best-guess.
  If sources show red errors, paste text here → agent fixes next cycle.
  ~$0.05–0.15/scene · FAL_KEY already in use.

- **[/dream/52-concept-steer](/dream/52-concept-steer)** — Concept Steer `demoable` (Cycle 63)
  Six-axis hexagonal radar chart synthesizer: Brightness, Density, Regularity,
  Complexity, Energy, Mode — the same vocabulary sparse autoencoders find inside music AI
  models. Drag any handle; the synthesizer follows. Four presets: Classical Fugue, Dark
  Ambient, Jazz Improv, Drone. Mode axis is especially interesting: major → minor →
  diminished as a continuous parameter independent of brightness/density.

## In progress / partial

- Nothing in-progress. Both recent cycles completed full demoable prototypes.

## Research findings worth a look

- **Cycle 61 research** found `claude-shader` and `ghost-xr` as next high-priority builds —
  both waiting on Karel answers below.
- **Interpretable Concepts in Music Models (RESEARCH.md §94)** — the Brightness/Density/
  Regularity/Complexity/Energy/Mode axes used in `52-concept-steer` come from sparse
  autoencoder research on transformer music models. Same vocabulary, browser-synthesized.

## Open questions for Karel

- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader`: Claude generates an
  audio-reactive GLSL fragment shader from a text description, it compiles and runs in
  the browser. ~$0.001/generation at Haiku pricing. One cycle to build once confirmed.
- **`GEMINI_API_KEY` still pending?** → Unlocks `lyria-ghost`, `binaural-lyria`,
  `30-lyria-jam`, `piano-to-ghost` (4 queued prototypes).
- **A-Frame CDN dep (~1MB) OK?** → Enables `ghost-xr` (stand *inside* the Ghost scene
  spatial audio world via WebXR, head-tracked on Quest/Vision Pro).
- **`ghost-sfx` endpoint** — works? Or red errors in the source status cards?
  Paste any error text and the agent fixes endpoint/params next cycle.
