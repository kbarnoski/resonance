# Morning digest — last updated 2026-05-18 UTC (Cycle 11)

## New since yesterday

- **[/dream/11-terrain](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/11-terrain)** — Spectrogram Terrain.
  Your audio history as a 3D landscape. Bass = blue mountains, treble = orange ridges.
  The past recedes toward the horizon; the present is at your feet. Try it with a piano
  chord in mic mode — you'll see the overtone series as distinct parallel ridgelines.
  Open this one first: it's the most visually distinctive prototype so far.

## In progress / partial

- Nothing in-progress. All 11 prototypes are `demoable`.

## Cycle summary (11 total)

| # | Route | What it is |
|---|-------|-----------|
| 11 | /dream/11-terrain | 3D spectrogram landscape (newest) |
| 10 | /dream/10-strange | Lorenz attractor + FM synthesis |
| 9  | /dream/9-reaction-diffusion | Gray-Scott Turing patterns |
| 8  | /dream/8-particle-life | Emergent particle flocking |
| 7  | /dream/7-spatial | HRTF binaural 3D spatial audio |
| 6  | /dream/5-arcs | Journey arc engine (5 arc types) |
| 5  | /dream/4-operator | Venue operator panel + MIDI |
| 4  | Research cycle | See RESEARCH.md |
| 3  | /dream/3-fluid | Navier-Stokes WebGL fluid |
| 2  | /dream/2-ghost-lab | Ghost LoRA A/B comparison |
| 1  | /dream/1-live | Live mic audio-reactive viz |

## Research findings worth a look

- Last research was Cycle 4 (7 cycles ago). Due for a new sweep soon.
  Cycle 4 findings: ACE-Step music gen, MMAudio V2, WebGPU at 70% coverage,
  HRTF spatial audio, strange attractor synthesis, Gray-Scott RD. See RESEARCH.md.

## Open questions for Karel

- **Research cycle**: should Cycle 12 be a research sweep, or keep building?
  Queue has 8+ ideas; nothing is blocked. A research cycle would refresh
  the AI audio model landscape (ACE-Step, MMAudio V2 updates, new WebGPU APIs).

- **Terrain polish**: three directions —
  1. Camera motion (cy follows peak amplitude = "flying into the mountain")
  2. Longer history (300 frames ≈ 5 seconds, needs WebGL)
  3. Leave it and move to tessellate (op-art aperiodic tiling, very different aesthetic)

- **6-compose (AI music generation)**: still waiting on FAL_KEY budget approval
  (~$0.006/generation via ACE-Step on fal.ai). The prototype would let you type a
  mood and hear a 30s musical sketch through the existing visualizers.
