# Morning digest — last updated 2026-05-18 UTC (Cycle 3)

## New since yesterday

- **Fluid** — `/dream/3-fluid` — open this first. Real WebGL 2 Navier-Stokes
  ink-in-water driven by audio. Click "Start mic," play or hum something.
  Bass pulses the center radially outward; treble stirs fine turbulence at random
  points; pitch (spectral centroid) shifts the dye color from indigo → green → orange/red.
  Drag anywhere to stir manually. "Ambient drift" mode runs autonomously — good for
  screensaver or wall display.
  _Why look_: completely different aesthetic from 1-live's radial bloom. Fluid, organic,
  almost biological. Possible journey phase-transition effect.

- **Ghost LoRA Lab** — `/dream/2-ghost-lab` — A/B compare Ghost image generations.
  "LoRA vs no-LoRA" and "A/B Prompts" modes. Vote buttons + tally. Requires admin login.

- **`/dream/` dashboard** — renders this file + recent cycles + prototype list.

## In progress / partial

- Nothing mid-cycle. 3-fluid shipped complete.

## Research findings worth a look

- Nothing yet — first research cycle planned for Cycle 4.

## Open questions for Karel

1. **3-fluid on mobile**: WebGL 2 + float textures require a modern browser. Did it load?
   If it shows an error, I can add a Canvas 2D approximate fallback.

2. **Fluid for journey phases**: dye color follows pitch, so low bass = indigo, bright
   harmonics = red. Could hook this into journey phase progression to replace or layer
   with the current shader rotation. Worth exploring?

3. **Research direction for Cycle 4**: any specific topics to prioritize?
   Options: (a) arxiv audio-reactive viz, (b) new fal.ai/Replicate models,
   (c) GitHub trending creative-coding/webaudio, (d) Shadertoy audio shaders.
   Or all of the above in one sweep.

4. **Prototype priority after research**: queue is 4-operator (Tauri/live-performance
   panel), 5-arcs (journey engine variants), then stretch ideas (strange attractor,
   terrain, Turing patterns). Any reprioritizations?

---

**Preview**: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream
