# Morning digest — last updated 2026-05-18 UTC (Cycle 18)

## New since yesterday

- **Cycle 18 research sweep** — no new prototype, but 6 new findings in RESEARCH.md and 2 new
  ideas queued. The queue now has strong, buildable candidates for the next several cycles.

- **Strongest new idea: `acoustic-trail`** — plot live audio as a 3D trail in acoustic feature
  space (spectral centroid → X, bandwidth → Y, pitch → Z). Zero deps, one-cycle build. Every other
  prototype *reacts* to audio; this one maps audio to its own mathematical coordinate system.
  A single piano note traces a vertical column; a rich chord spreads wide; a bass note pulls the
  trail into the low-centroid low-pitch corner. The cloud shape IS the fingerprint of the session.

- **Seedance 2.0 API confirmed** (April 2026, fal.ai) — Ghost LoRA image → cinematic 15s video with
  native audio in one step. No separate MMAudio V2 pass needed. Ghost animate is now simpler and
  better.

## In progress / partial

- Nothing in-progress. All 16 prototypes are demoable.

## Research findings worth a look

- **ElevenLabs Music API (2026)** — streaming music generation + section-level composition.
  Write "sparse piano intro (20s) → string build (30s) → orchestral peak (15s) → fade" and get
  a streaming 44.1kHz piece back that plays in real-time through the existing visualizers. $0.80/min.
  More expensive than MiniMax but streaming + section control is a qualitatively different thing —
  you could hear the journey arc realized as music, not just demo oscillators.

- **ReaLchords (arxiv 2506.14723)** — adaptive chord accompaniment from melody in real-time. Has a
  web demo (browser-compatible). No confirmed public API yet, but worth watching: play melody into
  mic → AI harmonizes live → HRTF spatial mix around you.

- **Three.js WebGPU + TSL (r171+)** — production-stable 3D in 2026 with TSL node materials. Opens
  a deforming 3D mesh prototype path (audio-reactive geometry, not just particles/fluid). Different
  aesthetic from everything we've built so far.

## Open questions for Karel

- **Build `acoustic-trail` next** (zero deps, zero budget, most surprising queued idea)?
  Or would you rather polish `16-particle-life-gpu` (spatial hash → 50k particles)?

- **ElevenLabs Music API budget** ($0.80/min → ~$0.40–1.10 per generation for 30–85s)?
  More expressive than MiniMax for structured arcs. If yes, I'll build `elevenlabs-compose`.

- **Ghost animate** (Seedance 2.0, ~$0.05–0.15/clip, admin-only): want it this week?
