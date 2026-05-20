# Morning digest — last updated 2026-05-20 UTC (Cycle 61)

## New since yesterday

- **Cycle 61 — Research sweep** (no new prototype)
  8 new entries in RESEARCH.md (§§93–100). 4 new prototype ideas queued in IDEAS.md.
  Build pipeline for next 2–3 cycles is clear.

- **[/dream/](/dream/)** — Dashboard `demoable` (Cycle 60)
  Full MORNING.md renders at the top of the preview URL. No more GitHub visit needed.
  3-cycle activity stream + full prototype grid. Phone-first layout.

## In progress / partial

- Nothing in-progress. All recent prototypes are `demoable`.
- **Next build**: `diatonic-harmony` — zero deps, one cycle. Play a melody;
  chord-correct diatonic harmonies float alongside (key detected automatically).

## Research findings worth a look

- **`claude-shader` (§93, arxiv 2512.08951)** — AI Co-Artist paper proves LLMs can generate
  compilable GLSL shaders from text descriptions. Prototype: describe a visualization in words →
  Claude API generates a GLSL fragment shader → runs on fullscreen quad with Web Audio FFT uniforms
  (`uBass`, `uMid`, `uTreble`, `uOnset`). Self-referential: Claude generates the shader that
  reacts to your music. **Needs `ANTHROPIC_API_KEY` in Vercel env — is it available?**

- **`concept-steer` (§94, arxiv 2505.18186, May 2026)** — Sparse autoencoders reveal music AI
  models organize internally around: **Brightness**, **Density**, **Regularity**, **Complexity**,
  **Energy**, **Mode**. Prototype: 6-axis hexagonal radar chart where each axis is one of these
  named concepts, driving a real-time synthesizer. Music-theory vocabulary as the primary UI.
  Zero deps, one cycle.

- **`diatonic-harmony` (§96, arxiv 2506.18143)** — AI Harmonizer paper shows 4-part diatonic
  harmony from solo melody is achievable. Browser version: mic → key detection (chroma template
  match, same as `28-chord-canvas`) → diatonic third + fifth voices as sine OscillatorNodes.
  3-track piano roll visualization. First prototype that generates real harmonic content from
  live input (different from `23-pitch-harmonize` which just shifts a copy). Zero deps, one cycle.
  **Building next cycle.**

- **ElevenLabs SFX on fal.ai (§95)** — Text → short high-fidelity sound effects. FAL_KEY in
  use. Prototype: `ghost-sfx` — 6 Ghost preset scenes, each with 3–4 generated ambient clips
  through HRTF PannerNodes. More immersive than `29-scene-spatial`'s oscillator synthesis.

- **Token-Based Audio Inpainting (§97, arxiv 2507.08333, Feb 2026)** — Discrete diffusion
  for semantically coherent audio continuation. Could upgrade `43-stable-extend`. No fal.ai
  endpoint confirmed yet — monitoring.

- **iPlug3 2026 (§100)** — WebGPU + SDL3 + MCP agent workflows for native audio plugins
  with WASM browser output. Cleanest path to "Resonance as an installation."

## Open questions for Karel

1. **`ANTHROPIC_API_KEY` in Vercel env?** → enables `claude-shader` (LLM-generated GLSL
   shaders reacting to your music live). Most surprising prototype in the queue.
2. **`GEMINI_API_KEY`** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`,
   `piano-to-ghost`, `stem-spatial`.
3. **`arc-compose` API** — if `/dream/48-arc-compose` shows an error, paste the raw message
   and the agent fixes the endpoint next cycle.
4. **Tap Rhythm feedback** — amplitude thresholds tunable; let the agent know if kick/snare/hat
   classification feels off on your setup.
