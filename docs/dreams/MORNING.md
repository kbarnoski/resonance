# Morning digest — last updated 2026-05-21 UTC (Cycle 90)

## New since yesterday

- **Cycle 90 was a research sweep** (no new prototype). 9 new entries in RESEARCH.md (§§157–165).
  Top picks for next builds (numbers shifted to 78-81 after your new direction added 72-77):
  - **`78-node-synth`** (zero deps) — visual Web Audio routing graph. Drag-and-connect oscillators, filters, gains, delays. Web Audio IS a node graph — this makes it visible. Patch a signal chain in 30s.
  - **`79-fm-explorer`** (zero deps) — 2-operator FM synthesis (Yamaha DX7 palette: electric piano, bell, metallic). Real-time sideband spectrum. 71 prototypes, none have done FM synthesis.
  - **`80-room-acoustic`** (zero deps) — draw a 2D room, hear its reverb. Image-source method + `ConvolverNode`. Design acoustic spaces for your Ghost scenes.

- **Karel's new direction landed** — agent has read it and updated its queue. Key changes absorbed:
  - No more standalone voice-gen prototypes (6 exist; enough). `xai-ghost` deferred.
  - Image gen INSIDE AV experiments = yes. Use your real piano music as audio source.
  - Spread themes across your published journeys (not just Ghost). Agent will read `journeys.ts`.
  - Research cycles: deep-dive into TouchDesigner / Houdini patterns + WebGPU browser equivalents.
  - Vote-aware bias: agent fetches the public votes API on every cycle orient step.
  - Your seeded ideas `72-paths-visualizer` through `77-projection-mapping-sandbox` are now in the queue.

- **[/dream/71-shader-evolve](/dream/71-shader-evolve)** (Cycle 89) — Shader Evolve. Natural selection of audio-reactive WGSL shaders. 2×2 WebGPU grid; click to select, **↻ EVOLVE** to breed, **★ SAVE** to gallery.

- **[/dream/70-pitch-algo-compare](/dream/70-pitch-algo-compare)** (Cycle 88) — Three pitch detectors simultaneously: ACF (orange), YIN (blue), HPS (green). Gold cursor when ≥2 agree.

## In progress / partial

- Nothing blocked or in progress.

## Research findings worth a look

- **CassetteAI (§157)** — `cassetteai/music-generator`, $0.02/min, 30s in ~2s (10× faster than ACE-Step). Candidate backend for `6-compose` speed upgrade.
- **AI vs Human music paradox (§160)** — listeners prefer AI music but rate human music as more emotionally effective. Actual emotional response: no significant difference. Frame AI music as character-authored ("the journey's score"), not "AI-generated."
- **FM synthesis gap (§161)** — 3 Web Audio nodes = the Yamaha DX7. 71 prototypes, none have done FM synthesis.
- **TouchDesigner / Houdini deep-research target** — next research cycle should pick ONE thread (Bileam Tschepe TOP feedback, Junichiro Horikawa VEX particles, Memo Akten learning-to-see, etc.) and go deep with 3-5 browser-equivalent prototype seeds.

## Open questions for Karel

- `browser-stems` (~200MB ONNX CDN dep): OK to build? Audio stays on device, cached after first load.
- `ANTHROPIC_API_KEY` in Vercel env → enables `claude-shader` and `llm-pattern` (describe music in English, Claude generates the pattern)
- `GEMINI_API_KEY` → `lyria-jam`, `lyria-ghost`, `binaural-lyria` (queued and waiting)
- CassetteAI speed upgrade for `6-compose`: worth testing? (Drop generation wait from ~30s to ~2s)
