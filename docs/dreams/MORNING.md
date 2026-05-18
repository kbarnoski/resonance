# Morning digest — last updated 2026-05-18 UTC (Cycle 14)

## New since yesterday

- **[/dream/13-piano-canvas](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/13-piano-canvas)** — Piano Canvas  
  Your improvisation becomes a painting. Each note detected via mic autocorrelation
  leaves a glowing brush stroke: pitch sets the hue (A4=red, rotating ~60° per octave),
  loudness sets the weight (1.5–8 px), duration sets the length. The stroke cursor drifts
  up for rising melodic lines, down for descending ones. Strokes accumulate on a persistent
  canvas; download as PNG when done.  
  **Open this first.** Two modes: **Start mic** (play piano/instrument/sing) or **Demo mode**
  (wandering two-hand melody plays silently, leaves a painting automatically). Try both.

## In progress / partial

- Nothing in-progress. All 13 prototypes are at `demoable` status.

## Cycle summary (14 total, 13 prototypes)

| # | Route | What it is |
|---|-------|-----------|
| 14 | /dream/13-piano-canvas | Your playing becomes a painting |
| 13 | (research) | Research sweep — 7 new findings, 4 new ideas |
| 12 | /dream/12-tessellate | Truchet tile grid rewired by beat |
| 11 | /dream/11-terrain | 3D spectrogram landscape |
| 10 | /dream/10-strange | Lorenz attractor + FM synthesis |
| 9  | /dream/9-reaction-diffusion | Gray-Scott Turing patterns |
| 8  | /dream/8-particle-life | Emergent particle flocking |
| 7  | /dream/7-spatial | HRTF binaural 3D spatial audio |
| 6  | /dream/5-arcs | Journey arc engine (5 arc types) |
| 5  | /dream/4-operator | Venue operator panel + MIDI |
| 4  | Research cycle | Cycle 4 research (see RESEARCH.md §§1–8) |
| 3  | /dream/3-fluid | Navier-Stokes WebGL fluid |
| 2  | /dream/2-ghost-lab | Ghost LoRA A/B comparison |
| 1  | /dream/1-live | Live mic audio-reactive viz |

## Research findings worth a look

- **Art2Mus** (arxiv Feb 2026): direct image→music generation — no text, CLIP visual
  embeddings feed AudioLDM 2. Ghost LoRA image → auto-generated ambient music without
  typing a description. If it lands on fal.ai: a very different ghost-sound path.

- **BRAVE** (arxiv Mar 2026): 10ms latency neural audio timbre transfer. Monitor for
  browser readiness. Long-game: play piano → instantly hear it in a trained voice/timbre.

- **MiniMax Music 2.5** ($0.035/track): reference audio style matching. Piano phrase in →
  full track out in same style. Needs FAL_KEY. Strongest near-term AI music prototype.

## Open questions for Karel

- **`reference-compose` (FAL_KEY approval needed)**: MiniMax Music 2.5 at $0.035/track.
  You record a piano phrase → the model extends it into a 30s track in your style.
  Needs your go-ahead on budget. Feels like a core Resonance feature proposal.

- **`ghost-animate` (FAL_KEY + $0.05–0.15/clip)**: Seedance 2.0 turns a Ghost LoRA
  still into a 5–10s cinematic video with native audio. Do you want this built?

- **Piano Canvas polish ideas** (for whenever): spiral layout (time=angle, pitch=radius →
  mandala), polyphonic tracking (bass + treble simultaneous strokes), slow global fade
  (recent strokes bright, old strokes dim). Any of these appeal?

- **Next cycle**: top candidates are `typography` (kinetic type, long-queued),
  `webgpu-fluid` (512×512 upgrade of 3-fluid), `9-particle-life-gpu` (50k WebGPU particles),
  or polish `13-piano-canvas`.
