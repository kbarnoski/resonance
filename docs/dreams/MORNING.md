# Morning digest — last updated 2026-05-21 UTC (Cycle 85)

## New since yesterday

- **[/dream/68-wgsl-synth](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/68-wgsl-synth)** (Cycle 85, `demoable`) — WGSL Synth.
  Write a raw WebGPU shader that responds to your piano. Split-screen: left = editable WGSL textarea; right = fullscreen GPU canvas. Six audio uniforms pre-wired: `uBass`, `uMid`, `uTreble`, `uOnset`, `uTime`, `uBPM`. Edit any line → recompiles 400ms later → swaps the pipeline with no black frame. Errors show line numbers. Default shader: rings that expand with bass + grid shimmer with mid/treble + white onset flash. Try deleting the vignette line to see the full-bleed effect.
  **Why open this**: it's the only prototype where you can write the visual logic yourself. If you've ever wanted to see what your shader idea sounds like in real time — this is it.

- **[/dream/67-structure-viz](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/67-structure-viz)** (Cycle 84, `demoable`) — Structure Viz.
  Your music as a self-similarity map. Play ABA — watch three bright diagonal blocks appear. First prototype that shows form (does the chorus come back?) not just signal content.

## In progress / partial

- Research sweep due at Cycle 86 (threshold: 3–4 build cycles since Cycle 82 research).

## Research findings worth a look

- **ShaderVine** (§130) — browser WebGPU shader editor with MCP interface. The MCP angle: an agent could edit the shader via MCP while you watch the canvas. Directly inspired `wgsl-synth`.
- **ImprovNet** (§138) — seed → 32-bar structured improvisation with style control. No API yet; monitor HuggingFace Spaces.
- **Pianist Transformer** (§139) — human-level expressive piano rendering, Apache 2.0, HuggingFace demo. Could proxy via Spaces for `expressive-render`.

## Open questions for Karel

- **ANTHROPIC_API_KEY** in Vercel env → `claude-shader` (Claude writes WGSL for you — the natural pair to today's `wgsl-synth`)
- **GEMINI_API_KEY** → `lyria-jam`, `lyria-ghost`, `binaural-lyria`, `piano-to-ghost` (4 prototypes waiting)
- **`lyrics-journey` budget** — ~$2.40/generation for full Ghost journey as a sung piece
- **Voice clip for `chatterbox-ghost`** — bundle a 5s Ghost character voice so the demo works without mic permissions?
