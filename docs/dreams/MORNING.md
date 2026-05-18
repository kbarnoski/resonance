# Morning digest — last updated 2026-05-18 UTC (Cycle 9)

## New since yesterday

- **[/dream/9-reaction-diffusion](/dream/9-reaction-diffusion)** — Gray-Scott
  Reaction Diffusion. Open this one first — click **Start demo** (no permissions).

  Two virtual chemicals interact on a 256×256 GPU grid. A substrate is consumed by
  an activator that diffuses more slowly. From nothing but diffusion rates, Turing
  instabilities produce: coral branching, fingerprint whorls, dividing spots, maze
  walls — depending on which preset you pick.

  **Audio integration**: bass raises the feed rate (more activation energy → denser
  patterns). Treble raises the kill rate (structure erodes faster). Percussive onsets
  inject new seed blobs mid-sim. **Click anywhere on the canvas** to inject manually
  and watch a colony grow from scratch.

  Best demo: start on **Coral**, let it stabilize (~10s), then click several spots
  on the canvas and watch coral branches grow and merge. Switch to **Mitosis** and
  watch spots divide like cells.

## In progress / partial

- **9-particle-life-gpu** — WebGPU upgrade of particle-life (50k+ particles, WGSL
  compute shader, galaxy-scale). Queued next.
- **7-spatial polish** — reset button + elevation/azimuth readout per band.

## Research findings worth a look

See RESEARCH.md (Cycle 4) — still current:
- **ACE-Step** music gen on fal.ai — text → 30s music (needs FAL_KEY)
- **Strange attractor + FM synthesis** — Lorenz attractor driving FM modulation.
  Beautiful audio-visual loop. Single-cycle build.

## Open questions for Karel

- **6-compose**: FAL_KEY + budget approval for ACE-Step AI music gen
  (~$0.006/call)? One-cycle build once you approve.
- **9-reaction-diffusion preset tuning**: the 6 presets are from the GS literature.
  Do any feel wrong? I can adjust f/k values or add new patterns (e.g. "worms",
  "labyrinth", "solitons"). Easy to tune.
- **8-particle-life matrix editor**: want per-cell sliders to sculpt behavior
  manually, or is random reshuffle the right UX?

---

**All prototypes live**:
- `/dream/1-live` — mic visualizer (demoable)
- `/dream/2-ghost-lab` — Ghost LoRA A/B lab (demoable, admin)
- `/dream/3-fluid` — Navier-Stokes fluid sim (demoable)
- `/dream/4-operator` — Venue operator panel (demoable)
- `/dream/5-arcs` — Journey arc engine v2 (demoable)
- `/dream/7-spatial` — HRTF spatial audio (demoable)
- `/dream/8-particle-life` — Particle life, emergent flocking (demoable)
- `/dream/9-reaction-diffusion` — Gray-Scott RD, Turing patterns (demoable) ← new

**Preview**: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream
