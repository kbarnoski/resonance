# Morning digest — last updated 2026-05-21 UTC (Cycle 91)

## New since yesterday

- **[/dream/74-touchdesigner-feedback](/dream/74-touchdesigner-feedback)** (Cycle 91) — **TD Feedback.**
  TouchDesigner's TOP feedback loop, ported to WebGPU. Two ping-pong render textures. Each frame:
  sample the previous frame's texture at a slightly rotated + zoomed UV, shift hue, decay brightness,
  then composite a new audio bloom layer. The texture feeds itself forever — infinite visual evolution.
  Four sliders: rotation speed (−15‰ to +15‰, negative = counterclockwise), zoom (inward pull vs.
  outward push), hue drift, and decay. Audio modulates all four additively: bass → extra rotation,
  mid → extra zoom, treble → extra hue drift, onset → white flash. **↺ RESET** clears to black.
  WebGPU required. Demo mode works without mic permissions. Zero deps · Zero API.
  - **Open it**: hit ▶ DEMO, wait 3–4 seconds for the pattern to build. Try pulling rotation to
    negative while zoomed in for a collapsing black hole effect. Try high decay (99%+) and low rotation
    for long, slow trails.

- **[/dream/71-shader-evolve](/dream/71-shader-evolve)** (Cycle 89) — Shader Evolve. 2×2 WebGPU grid
  of mutated audio-reactive WGSL shaders. Select a cell → ↻ EVOLVE → breed. ★ SAVE to gallery.

- **[/dream/70-pitch-algo-compare](/dream/70-pitch-algo-compare)** (Cycle 88) — Three pitch detectors
  simultaneously: ACF (orange), YIN (blue), HPS (green). Gold consensus cursor when ≥2 agree.

## In progress / partial

- Nothing blocked or in progress.

## Research findings worth a look

- **FM synthesis gap (§161)** — 71+ prototypes, none have done FM synthesis. 3 Web Audio nodes =
  the entire Yamaha DX7 palette (electric piano, bell, metallic, organ). `79-fm-explorer` is next.
- **CassetteAI (§157)** — `cassetteai/music-generator`, $0.02/min, 30s in ~2s (10× faster than
  ACE-Step). Candidate backend for `6-compose` speed upgrade. `81-cassette-speed` compares them.
- **TouchDesigner TOP feedback** confirmed browser-feasible this cycle. Next TD pattern:
  Junichiro Horikawa-style VEX particle flock (`75-houdini-particle-flock`) or
  Bileam Tschepe multi-buffer feedback with N-frame delay.

## Open questions for Karel

- **Votes**: love signal returned `{}` this cycle. Which prototypes are your favorites so far?
- `browser-stems` (~200MB ONNX CDN dep): OK to build? Audio stays on device, cached after first load.
- `ANTHROPIC_API_KEY` in Vercel env → enables `claude-shader` and `llm-pattern`
- `GEMINI_API_KEY` → `lyria-jam`, `lyria-ghost`, `binaural-lyria` (queued and waiting)
- `72-paths-visualizer` uses your actual Welcome Home album tracks via `/api/audio/[id]`.
  Should the prototype be public (no auth) or admin-only?
