# Morning digest — last updated 2026-05-21 UTC (Cycle 84)

## New since yesterday

- **[/dream/67-structure-viz](/dream/67-structure-viz)** (Cycle 84, `demoable`) — self-similarity matrix.
  Press **▶ Demo** — a 48-second ABA pattern plays (C3 chord → A4 chord → C3 returns). Watch the
  N×N heatmap grow every 1.5s. By bar 22 (≈33s), you see three bright white blocks along the diagonal
  and two bright off-diagonal corners — the A and A′ sections lighting up as similar. The timeline
  strip below shows `A | B | A′`. Mic mode: play any music with repeating material; verse-chorus-verse
  creates a striped checkerboard. The diagonal is always white (each bar = itself).
  **Why this is different**: 66 prior prototypes visualize signal (amplitude, pitch, timbre, color).
  This one visualizes *form* — not what the music sounds like at any moment, but how sections relate
  across the whole session. A pianist who plays an ABA form sees the structure, not just the sound.
  Zero deps · zero API · 3.81 kB.

- **[/dream/66-chatterbox-ghost](/dream/66-chatterbox-ghost)** (Cycle 83, `demoable`) — voice-cloned Ghost.
  Record 5s of your voice → hear all six Ghost scenes in that voice with physical action tags.
  Completes the four-way TTS comparison: Gemini / Orpheus / ElevenLabs V3 / Chatterbox.
  ⚠ API parameters are best-guess; paste any error text.

## In progress / partial

- Nothing in-progress.
- **Next build** (Cycle 85): `wgsl-synth` — WGSL shader editor with pre-wired audio uniforms.
  CodeMirror from CDN (no package.json change). Write WGSL that responds to your piano in real time.
  Different from `claude-shader` (AI-generates the WGSL): this is a manual editor.

## Research findings worth a look

- **Self-similarity matrix (§143)** — built this cycle. Standard MIR technique (Foote 2000), zero ML,
  browser-native. The off-diagonal bright squares are the interesting part: they encode non-adjacent
  structural relationships that no other visualization shows.
- **ImprovNet (§138, arxiv 2502.04522)** — full 32-bar structured improvisation from a seed phrase.
  No API yet. When one appears, `improv-expand` is the most compelling "AI completes your composition"
  prototype in the queue.
- **Pianist Transformer (§139, arxiv 2512.02652)** — human-level expressive MIDI rendering, Apache 2.0.
  HuggingFace Spaces demo exists. A proxy route to Spaces would make `expressive-render` buildable.
- **ShaderVine (§130)** — browser WGSL editor with MCP interface. Inspires `wgsl-synth` (build next cycle).

## Open questions for Karel

- **`GEMINI_API_KEY`?** → `lyria-jam`, `lyria-ghost`, `binaural-lyria` all waiting (free tier).
- **`ANTHROPIC_API_KEY` in Vercel env?** → `claude-shader` (LLM generates audio-reactive GLSL shaders).
- **Chatterbox voice reference**: bundle a ~5s Ghost voice reference as a public asset so
  `66-chatterbox-ghost` works without mic permissions?
- **`lyrics-journey` budget OK?** ~$2.40/generation (Ghost journey as a full sung AI piece).
