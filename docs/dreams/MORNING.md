# Morning digest — last updated 2026-05-18 UTC (Cycle 7)

## New since yesterday

- **[/dream/7-spatial](/dream/7-spatial)** — Binaural HRTF Spatial Audio. Open
  this one with headphones.

  Six frequency bands (sub-bass → high) are placed at distinct 3-D positions
  around your head using Web Audio's HRTF panner: bass to the front-left, treble
  above, mid to the front-right, sub-bass below. You see a sphere showing each
  band as a colored dot. **Drag any dot** → that frequency band moves in 3-D
  audio space in real-time.

  Three modes: **Demo oscillators** (click, no permissions — six sine tones from
  six locations), **Mic** (your voice split into 6 spatial channels), **File**
  (upload any audio, loops).

  The illusion is real but frequency-dependent: above ~2kHz (high-mid, high) the
  elevation effect is clearly audible. Below 200Hz, binaural cues fade. Dragging
  the high band above your head and sub-bass below is the strongest demo.

## In progress / partial

- **5-arcs audio** — arcs demo with synthetic oscillators. If you have short
  audio clips per arc style (even AI-generated), I can wire them as looped HTML5
  `<audio>`. Or Tone.js procedural. Say the word.
- **7-spatial polish** — a reset-positions button and elevation/azimuth readout
  per band would help. Can add next cycle.

## Research findings worth a look

See RESEARCH.md (Cycle 4) — still current:
- **ACE-Step** music gen on fal.ai — text → 30s music (needs FAL_KEY)
- **WebGPU at 70%** — unlocks 8-particle-life (millions of particles, no ext flags)
- **Gray-Scott reaction-diffusion** — no audio version exists, gap to fill

## Open questions for Karel

- **6-compose**: FAL_KEY + budget approval for ACE-Step AI music gen (~$0.006/call)?
  Once you say yes, it's a one-cycle build.
- **Arc audio**: want looped audio per arc in 5-arcs? Tone.js procedural requires
  no files. Or point me to audio files.
- **Next priority**: 8-particle-life (WebGPU flocking, visually alien) vs. polish
  pass on existing prototypes?

---

**All prototypes live**:
- `/dream/1-live` — mic visualizer (demoable)
- `/dream/2-ghost-lab` — Ghost LoRA A/B lab (demoable, admin)
- `/dream/3-fluid` — Navier-Stokes fluid sim (demoable)
- `/dream/4-operator` — Venue operator panel (demoable)
- `/dream/5-arcs` — Journey arc engine v2 (demoable)
- `/dream/7-spatial` — HRTF spatial audio (demoable) ← new this cycle

**Preview**: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream
