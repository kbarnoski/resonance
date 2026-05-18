# Morning digest — last updated 2026-05-18 UTC (Cycle 8)

## New since yesterday

- **[/dream/8-particle-life](/dream/8-particle-life)** — Particle Life.
  Open this one first — click **Start demo** (no permissions needed).

  900 particles, 6 species, a random 6×6 attraction/repulsion matrix.
  The flocking, spiraling, and predator-prey patterns are *not programmed* —
  they emerge entirely from that matrix. Press **reshuffle** to see a
  completely different emergent behavior in the same system.

  With mic + a track that has clear drum hits: loud onsets reshuffle the
  matrix mid-song. The swarm visibly reorganizes on each kick. Sub-bass
  energy agitates the violet species; cymbal shimmer animates the pink ones.

  Matrix heatmap in the top-left shows current attraction rules live.

## In progress / partial

- **8-particle-life WebGPU upgrade** — same prototype, 50k+ particles via
  WGSL compute shader. Queued for next cycle. At 50k, it looks like a
  galaxy self-organizing. Requires WebGPU (70% browser coverage in 2026).
- **7-spatial polish** — reset positions button + elevation/azimuth readout
  per band. Small polish pass.

## Research findings worth a look

See RESEARCH.md (Cycle 4) — still current:
- **ACE-Step** music gen on fal.ai — text → 30s music (needs FAL_KEY)
- **Gray-Scott reaction-diffusion** — no audio version exists anywhere;
  this is a real gap. Bass→feed rate, treble→kill rate would be dramatic.
  Could be a single-cycle build.

## Open questions for Karel

- **6-compose**: FAL_KEY + budget approval for ACE-Step AI music gen
  (~$0.006/call)? One-cycle build once you approve.
- **8-particle-life**: want to be able to drag individual matrix cells
  (sliders per cell) to sculpt behavior by hand? Or is the reshuffle
  randomness the right UX?
- **Arc audio for 5-arcs**: still want looped audio per arc? I can do
  Tone.js procedural without any audio files.

---

**All prototypes live**:
- `/dream/1-live` — mic visualizer (demoable)
- `/dream/2-ghost-lab` — Ghost LoRA A/B lab (demoable, admin)
- `/dream/3-fluid` — Navier-Stokes fluid sim (demoable)
- `/dream/4-operator` — Venue operator panel (demoable)
- `/dream/5-arcs` — Journey arc engine v2 (demoable)
- `/dream/7-spatial` — HRTF spatial audio (demoable)
- `/dream/8-particle-life` — Particle life, emergent flocking (demoable) ← new

**Preview**: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream
