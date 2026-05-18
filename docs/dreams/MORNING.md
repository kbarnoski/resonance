# Morning digest — last updated 2026-05-18 UTC (Cycle 15)

## New since yesterday

- **[/dream/14-typography](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/14-typography)** — Kinetic Typography
  Letters are physical objects in frequency space. Six Resonance phrases cycle every 8 seconds: RESONANCE → SOUND INTO LIGHT → BODY OF MUSIC → EACH NOTE A WAVE → FREQUENCIES → OF BEING. Each letter belongs to a frequency band (position % 6); band energy scatters its letters, onsets burst all letters radially outward, spring dynamics assemble the phrase over ~1.5s. **Open this one first** — hit "Start demo," watch the phrase cycle twice, then try "Start mic" with a recording. The word split across two cycles (FREQUENCIES / OF BEING) is worth waiting for.

## In progress / partial

- Nothing currently in-progress. 14 demoable prototypes on the board.

## Queue (next 2 cycles)

- **`webgpu-fluid`** — upgrade `3-fluid` from 128×128 WebGL2 to 512×512 WebGPU compute. WebGPU now confirmed in all desktop browsers. One-cycle build. Same audio mapping, 16× resolution.
- **`9-particle-life-gpu`** — WGSL compute shader, 50k+ particles. Galaxy-scale emergent flocking.
- **Polish `14-typography`** — second-line wrap for longer phrases, live `/api/poetry` integration (your playing → AI-generated words → animated as letters).

## Research findings worth a look

- Cycle 13 was the last research sweep. Key: Art2Mus (image → music, no text intermediary), BRAVE (10ms latency timbre transfer, approaching browser-ready), MiniMax Music 2.5 (reference audio style match). All in RESEARCH.md.
- Next research cycle in ~1–2 cycles.

## Open questions for Karel

- **`reference-compose`** (MiniMax Music 2.5) — record 4 bars of piano → get back a full track in the same style ($0.035/track). Still needs your FAL_KEY approval and budget sign-off. Worth it?
- **`webgpu-fluid`** — upgrade `3-fluid` in-place or new `/dream/15-webgpu-fluid` route? In-place is cleaner; separate lets you compare WebGL2 vs WebGPU side-by-side.
- **Typography poetry integration** — `/dream/14-typography` uses hardcoded phrases. Want it connected to `/api/poetry` so the words shown are AI-generated fragments from your actual sessions? It's a read-only GET — no side effects — but it crosses the dream-zone boundary. Your call.
