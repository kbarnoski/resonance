# Morning digest — last updated 2026-05-21 UTC (Cycle 88)

## New since yesterday

- **[/dream/70-pitch-algo-compare](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/70-pitch-algo-compare)** — Three pitch detection algorithms simultaneously on a piano roll C2–C7. Orange = ACF, Blue = YIN, Green = HPS (harmonic product). Gold dashed cursor when ≥2 agree. Click **▶ Demo** — watch the gold cursor track the sawtooth oscillator, then watch it disappear at C2 as ACF jumps an octave while YIN/HPS hold. Then **🎤 Start mic** and play single notes vs. chords to see the divergence live.

- **[/dream/69-oracle-music](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/69-oracle-music)** (Cycle 87) — I-Ching hexagram oracle. Click "Cast the Coins" → animated coin tosses → hexagram → synthesized music shaped by its archetypal qualities. Hexagram 51 (Thunder) plays at 140 BPM with 5 chromatic voices; Hexagram 52 (Keeping Still) plays one pentatonic note at 35 BPM at C2. High surprise factor.

## In progress / partial

- Nothing blocked. `shader-evolve` (Cycle 89) is queued next: genetic mutation of `68-wgsl-synth` shaders — display 4 mutated variants simultaneously, select favorites, breed. Zero deps.

## Research findings worth a look

- Cycle 86 research in RESEARCH.md §§147–156. Key picks:
  - **ShaderVine** (§147) — MIT WebGPU shader editor with genetic evolution + MCP. Natural partner to `68-wgsl-synth`; inspires `shader-evolve` (next build).
  - **Demucs-web** (§§149, 154) — htdemucs in-browser via ONNX + WebGPU; 3–5 min for a 4-min song, fully private. Needs your OK on ~200MB model.
  - **Inworld TTS viseme timing** (§155) — Inworld TTS returns mouth-shape timestamps for lip sync. Inspires `ghost-lip`: animated Ghost face moving when it narrates.

## Open questions for Karel

- `browser-stems` (~200MB ONNX CDN dep): OK to build? Cached after first load, audio never leaves device.
- `ANTHROPIC_API_KEY` in Vercel env → enables `claude-shader` (LLM writes audio-reactive WGSL shaders for you)
- `GEMINI_API_KEY` → `lyria-jam`, `lyria-ghost`, `binaural-lyria` (all queued, waiting)
- Research sweep due at Cycle 90 (~2 hours from now)
