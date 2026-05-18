# Morning digest — last updated 2026-05-18 UTC (Cycle 13)

## New since yesterday

- **Cycle 13 was a research sweep** — no new prototype, but IDEAS got 4 new entries and
  RESEARCH.md got 7 new findings. Best ones to read:

  1. **`13-piano-canvas` queued** — your musical improvisation becomes a canvas painting.
     Each detected note leaves a glowing brush stroke (pitch→hue, velocity→weight,
     duration→length). First prototype that treats the session as a *persistent visual artifact*
     rather than real-time reaction. Zero deps. Cycle 14 will build it.

  2. **`reference-compose` queued** — record 4-8 bars of piano → MiniMax Music 2.5 generates
     a full 30s track in your style ($0.035). "Your phrase, extended." Needs FAL_KEY approval
     (see open questions below).

  3. **WebGPU: desktop universally supported now** — Chrome, Firefox, Safari 26, Edge all
     ship it by default. Cycle 4's "70%" estimate was early 2026 projection; it landed in
     Nov 2025. Building `webgpu-fluid` (512×512 upgrade of 3-fluid) and `9-particle-life-gpu`
     are now safe without coverage worries.

## In progress / partial

- Nothing in-progress. All 12 prototypes are at `demoable` status.

## Cycle summary (13 total, 12 prototypes)

| # | Route | What it is |
|---|-------|-----------|
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

- **Art2Mus** (arxiv Feb 2026): direct image→music generation — no text needed, CLIP visual
  embeddings feed AudioLDM 2. If this model lands on fal.ai: Ghost images → their own
  auto-generated ambient music. Different from MMAudio V2 (which does video→audio sync).

- **BRAVE** (arxiv Mar 2026): 10ms latency neural audio timbre transfer. Not browser-ready
  yet (WASM path not optimized). Worth monitoring. Long-game Resonance vision: play piano →
  instantly hear it in a custom AI-trained voice.

- **Patchies** (patchies.app): browser-based code+visual patching. P5.js, Three.js, Hydra,
  Tone.js, Elementary Audio, MIDI, WebRTC — all wired by patch cables. Open-source AGPL.
  Inspiration: what if the dream sandbox was a patchable system?

- **Foley Control** (fal.ai): video → synchronized sound effects. Update for ghost-sound:
  instead of MMAudio V2 ambient music, use Foley Control for environmental texture
  (stone chamber reverb, portal hum, cosmic wind). Two-mode ghost-sound.

## Open questions for Karel

- **`reference-compose` (FAL_KEY approval)**: MiniMax Music 2.5 at $0.035/track. User
  records piano phrase → gets extended track in same style. Budget: ~$0.035/generation.
  Do you want this built? (compose mode for Resonance — feels like a core feature proposal.)

- **`ghost-animate` (FAL_KEY + higher budget)**: Seedance 2.0 accepts a Ghost LoRA image
  + text prompt and generates a 5–10s cinematic video with native audio. Budget estimate:
  ~$0.05–0.15/clip. Worth experimenting with? The Ghost as a *moving* character is a big
  visual shift.

- **Tessellate spatial split**: the Cycle 12 tessellate prototype flips random tiles on
  each beat. Alternative: each column responds to its own frequency band (left=bass,
  right=treble). Worth doing? One-cycle add-on.

- **Next cycle (Cycle 14)**: plan is `13-piano-canvas`. Override if you want something
  else — top alternatives are `typography` (kinetic type), `webgpu-fluid` (512×512
  upgrade), `9-particle-life-gpu` (50k particle WebGPU).
