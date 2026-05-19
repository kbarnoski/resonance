# Morning digest — last updated 2026-05-19 UTC (Cycle 44)

## New since yesterday

- **Cycle 44 — Research sweep** (8 new RESEARCH.md entries, 3 new IDEAS.md prototypes)
  No new prototype this cycle — research was overdue (4 cycles since last sweep). Key findings:

  - **CREPE-tiny ONNX neural pitch detection** (~2MB CDN): 10× more accurate than autocorrelation
    on complex piano, voice, noisy signals. Could upgrade `13-piano-canvas`, `24-piano-roll`,
    `26-score-follow`, `33-aria-companion`, `37-ratio-lab`, `39-anticipate` in a single shared hook.
    Buildable in one cycle. **Needs your approval on CDN ONNX dep (~2MB)**. See RESEARCH.md §61.

  - **Magenta RealTime open-weights**: Google DeepMind's open-weights (Apache 2.0) continuous music
    model. 800M params, RTF 0.625 on free Colab TPU. "Embedding arithmetic" — style embeddings are
    actual vectors; `0.7 × jazz + 0.3 × ambient` is a mathematically rigorous blend. Inspires
    upgrading `30-lyria-jam` spec: instead of sliders, a 2D canvas where each corner = one style.
    Navigate the style plane with a dot. See RESEARCH.md §62.

  - **Mirelo AI SFX 1.6 (new on fal.ai)**: Audio Extension (extend any clip seamlessly),
    Audio Inpainting (erase/replace moments). Extends the Ghost soundscape workflow: 10s clip →
    Mirelo → 60s looping ambient scene. Needs FAL_KEY. See RESEARCH.md §63.

  - **Shepard tone** (new prototype idea — no API keys needed): An auditory illusion prototype.
    8 sine oscillators one octave apart, each fading in/out as they sweep upward — the tone
    appears to rise forever without ever arriving. First "auditory illusion" in the sandbox.
    Completely buildable next cycle, zero deps. See IDEAS.md `shepard-tone`.

## In progress / partial

- All 39 existing prototypes are demoable. No in-progress skeletons.

## Research findings worth a look

- **Embedding arithmetic** (§65): Magenta/Lyria style prompts are vectors. `0.7×jazz + 0.3×ambient`
  is not a soft blend — it's mathematical vector addition in a shared latent space. This changes
  how `30-lyria-jam` should be designed: 2D canvas > sliders for style navigation.
- **Transformers.js v4** (§66): 53% smaller bundles, model load time dropped from 2s to 200ms.
  Makes `40-browser-musicgen` and `neural-pitch` significantly more feasible than when last evaluated.
- **limut** (§67): browser live coding music+visuals (WebAudio + WebGL + Shadertoy), updated May 2026.
  Inspires `code-vis` (route `/dream/41-code-vis`): a DSL where each line draws and plays simultaneously.

## Open questions for Karel

- **CDN ONNX dep (~2MB) OK?** `neural-pitch` — CREPE-tiny in shared analyser hook. Would immediately
  upgrade pitch detection quality for 6+ existing prototypes. Build next cycle if approved.
- **~390MB model OK?** `40-browser-musicgen` — in-browser AI music (MusicGen-small, zero API cost).
- **Gemini key?** `30-lyria-jam` — infinite steerable AI music (2D style canvas design, per §62/65).
- **Suno API + stems?** `suno-spatial` — AI stems placed in 3D HRTF space. Needs Suno API key.
- **MediaPipe CDN (~8MB)?** `31-gesture-music` — webcam hand gestures → synthesizer.
