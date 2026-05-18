# Morning digest — last updated 2026-05-18 UTC (Cycle 16)

## New since yesterday

- **[/dream/15-webgpu-fluid](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/15-webgpu-fluid)** — WebGPU Fluid (512×512)
  Same Navier-Stokes ink-in-water as `/dream/3-fluid`, but at 512×512 — 16× the pixel count. Ported
  to WebGPU render pipelines with `rgba16float` textures: no `EXT_color_buffer_float` dance, no Safari
  compatibility issues. **Open this alongside 3-fluid and compare** — the vortex structures are visibly
  sharper and the dye trails finer. Hit "Ambient drift" for instant visuals, then "Start mic" with piano.
  Requires Chrome / Edge / Firefox / Safari 26+. Falls back to a clear error message on older browsers.

## Previously new (Cycle 15)

- **[/dream/14-typography](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/14-typography)** — Kinetic Typography.
  Six Resonance phrases as physical letter-objects in frequency space. The FREQUENCIES / OF BEING
  split across two phrase cycles is worth waiting for.

## In progress / partial

- Nothing in-progress. 15 demoable prototypes on the board.

## Queue (next 2 cycles)

- **`9-particle-life-gpu`** — WGSL compute shader, 50k+ particles. Galaxy-scale emergent flocking.
- **Polish `14-typography`** — second-line wrap, live `/api/poetry` integration.
- **Research** — 3 cycles since last sweep (Cycle 13). Due next cycle.

## Research findings worth a look

- Cycle 13 was the last sweep. Key findings: Art2Mus (image → music), BRAVE (10ms latency timbre
  transfer), MiniMax Music 2.5 (reference audio style match). All in RESEARCH.md.

## Open questions for Karel

- **`reference-compose`** (MiniMax Music 2.5) — record 4 bars of piano → full track in same style ($0.035/track). Needs your FAL_KEY approval.
- **WebGPU fluid answered**: went with `/dream/15-webgpu-fluid` as a new route so you can compare side-by-side with `3-fluid`.
- **Typography poetry**: connect `/dream/14-typography` to `/api/poetry` (read-only GET, crosses dream boundary)? Your call.
