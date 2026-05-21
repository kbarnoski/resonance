# Morning digest — last updated 2026-05-21 UTC (Cycle 95)

## New since yesterday

- **Cycle 95 — research sweep** (no new prototype to open, but queue is now much richer)
  Five new seeds in IDEAS.md, five dated entries in RESEARCH.md. Highlights:

  - **`87-piano-transcript`** (one cycle, zero API) — YIN pitch + onset detection → your playing
    crystallizes into a live piano-roll score in real time. "Watch your improvisation become
    notation." Directly uses YOUR playing as input, per your direction. Building Cycle 97.

  - **`84-wave-fluid`** (two cycles, WebGPU) — MLS-MPM physics fluid. 100k particles. Bass energy
    = wave height. Onset = localized splash. Screen-space fluid rendering. Inspired by Houdini's
    GPU fluid solver and `matsuoka-601/webgpu-ocean`. Probably the most visually spectacular
    thing in the queue if it works.

  - **`86-sound-to-video`** (one cycle, FAL_KEY) — record 10s of piano → FLUX.2 image → LTX-2.3
    video clip ($0.25–0.35/generation). THIS is "AI image inside AV" exactly as you described.

  - **`88-marpi-void`** (one cycle, zero API) — audio-reactive organic organism in a dark void.
    Reproduces on onsets. Inspired by Marpi Studio "New Nature" at ARTECHOUSE 2026.

## In progress / partial

- `72-paths-visualizer` — still waiting on your Welcome Home album recording IDs.
- **Cycle 96 (next fire)**: kids cycle — `kids-tilt-rain` (tilt device → colored drops fall).
- **Cycle 97**: `87-piano-transcript` (top priority per your "use real music" direction).

## Research findings worth a look

- **LTX-2.3** (Jan 2026, fal.ai, Apache 2.0) — $0.04/s fast video generation. Cheapest video
  option. Enables `86-sound-to-video` — 10s piano → 6s video for ~$0.25.
- **FLUX.2 Flash** (`fal-ai/flux-2/flash`, $0.005/MP) — better than Schnell ($0.003/MP) for +67%
  cost. Should be default for all new AV+image prototypes going forward.
- **Seedance 2.0** (April 2026) — accepts audio as direct input alongside image + text. Might mean
  `86-sound-to-video` can skip FLUX entirely: audio → Seedance → video in one call.
- **Marpi "New Nature"** at ARTECHOUSE 2026 — living in NYC? It's running May–Nov.
- **Refik Anadol Latent City** at BRUSK, Bruges — May–Nov 2026.

## Open questions for Karel

- **[IMPORTANT]** Welcome Home album recording IDs accessible without auth → `72-paths-visualizer`.
  3–5 IDs → your real piano music as a visualizer source.
- **Votes**: still `{}`. Any prototype you love → tap ❤ → biases future picks.
- `ANTHROPIC_API_KEY` in Vercel env → `claude-shader`, `llm-pattern` (both queued and waiting).
- `GEMINI_API_KEY` → `lyria-jam`, `lyria-ghost`, `binaural-lyria`.
- `browser-stems` (~200MB ONNX CDN dep OK? Cached after first load.)
