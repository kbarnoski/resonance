# Morning digest — last updated 2026-05-21 UTC (Cycle 89)

## New since yesterday

- **[/dream/71-shader-evolve](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/71-shader-evolve)** — Shader Evolve (Cycle 89). Natural selection of audio-reactive WGSL shaders. Four mutated variants run simultaneously in a 2×2 WebGPU grid. Click any cell → full-res 60fps focus view. Click **↻ EVOLVE** → four new mutations bred from the selected variant. **★ SAVE** → persistent gallery (up to 6 slots, localStorage); click a tile to restart evolution from a saved ancestor. **✎ EDIT** → raw WGSL for manual tweaks. Each mutation multiplies 3–5 of 16 shader params by [0.4–2.5]× — always valid WGSL, often dramatically different visuals. Try: let it evolve 3–4 generations before saving, then breed from two saved ancestors in alternation. WebGPU required · Demo mode works without mic.

- **[/dream/70-pitch-algo-compare](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/70-pitch-algo-compare)** (Cycle 88) — Three pitch detectors simultaneously: ACF (orange), YIN (blue), HPS (green). Gold cursor when ≥2 agree. Click **▶ Demo** and watch ACF jump an octave on C2 while YIN/HPS hold — makes octave-error behavior immediately visible.

## In progress / partial

- Nothing blocked.

## Research findings worth a look

- Cycle 86 research in RESEARCH.md §§147–156. Key picks:
  - **ShaderVine** (§147) — MIT WebGPU shader editor with genetic evolution + MCP. Natural partner to `68-wgsl-synth`; `shader-evolve` is the direct implementation.
  - **Demucs-web** (§§149, 154) — htdemucs in-browser via ONNX + WebGPU; fully private. Needs your OK on ~200MB model.
  - **Inworld TTS viseme timing** (§155) — mouth-shape timestamps for lip sync → `ghost-lip`.

## Open questions for Karel

- `browser-stems` (~200MB ONNX CDN dep): OK to build? Audio stays on device, cached after first load.
- `ANTHROPIC_API_KEY` in Vercel env → enables `claude-shader` (LLM writes audio-reactive WGSL shaders)
- `GEMINI_API_KEY` → `lyria-jam`, `lyria-ghost`, `binaural-lyria` (all queued, waiting)
- Research sweep due at Cycle 90 (next cycle)
