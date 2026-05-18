# Morning digest — last updated 2026-05-18 UTC (Cycle 12)

## New since yesterday

- **[/dream/12-tessellate](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/12-tessellate)** — Tessellate (Cycle 12)
  A 40×28 grid of Truchet tiles whose topology rewires on every beat. Click Start demo.
  On each beat, 12% of tiles flip — connected curves break and reconnect into new paths,
  with a white flash on every flipped tile. Between beats, bass energy drives a slower
  drizzle of single-tile flips. Two complementary arc colors rotate through the spectrum.
  This is the first tile-based geometric prototype: op-art rather than fluid/particle.
  Try: hit **reshuffle** mid-run to see the full-grid flash. Or mic + music with strong bass.

## In progress / partial

- Nothing in-progress. All 12 prototypes are at `demoable` status.

## Cycle summary (12 total)

| # | Route | What it is |
|---|-------|-----------|
| 12 | /dream/12-tessellate | Truchet tile grid rewired by beat (newest) |
| 11 | /dream/11-terrain | 3D spectrogram landscape |
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

- Research is 9 cycles overdue (last: Cycle 4). Cycle 13 will be a full research sweep:
  arxiv, Shadertoy, GitHub trending, fal.ai/Replicate models, Anthropic updates.
  The WebGPU and AI audio model landscape has likely shifted since Cycle 4.

## Open questions for Karel

- **Tessellate spatial split**: currently 12% of *random* tiles flip on each beat.
  Alternative: each column of tiles responds to its own frequency band (left=bass,
  right=treble). The flip pattern would then be frequency-shaped, not random.
  Worth doing? One-pass addition.

- **Research cycle Cycle 13**: will sweep. If you want a specific prototype instead,
  say so. Top queue: typography (kinetic type), 9-particle-life-gpu (WebGPU 50k
  particles), polish 11-terrain (camera motion, longer history).

- **6-compose (AI music generation)**: still waiting on FAL_KEY budget approval
  (~$0.006/generation via ACE-Step on fal.ai). The prototype lets you type a mood
  and hear a 30s musical sketch through the existing visualizers.
