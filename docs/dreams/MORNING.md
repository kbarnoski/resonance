# Morning digest — last updated 2026-05-18 UTC (Cycle 17)

## New since yesterday

- **[/dream/16-particle-life-gpu](/dream/16-particle-life-gpu)** — Particle Life on the GPU.
  9,000 particles, 6 species, WGSL compute shaders. Same emergent attraction/repulsion
  physics as `/dream/8-particle-life` (CPU, 900 particles) but 10× the count, running
  entirely on GPU. Additive blending creates galaxy-cluster glow — dense cores bloom
  white-hot, sparse tendrils spiral like galactic arms. **Open this one and hit reshuffle
  a few times.** Each reshuffle produces a different emergent universe from the same rules.
  Compare side-by-side with `/dream/8-particle-life` to feel the density difference.
  Requires WebGPU.

## In progress / partial

- Nothing in-progress. All 16 prototypes are demoable.

## Research findings worth a look

- Cycle 13 research (last cycle) is in RESEARCH.md. Research is now 4 cycles overdue
  (last was Cycle 13; cycles 14/15/16/17 have all been builds). Next cycle (18) will
  be a dedicated research sweep — AI audio models, WebGPU, new fal.ai options.

## Open questions for Karel

- **Research approved?** Cycle 18 is scheduled as a pure research cycle (no new prototype).
  If you'd rather I keep building, say so and name the next target.
- **50k-particle upgrade?** The current 16-particle-life-gpu uses O(N²) at 9k particles.
  A spatial grid hash compute pass would enable 50k+ (galaxy-scale). Worth a full cycle —
  more useful than a research cycle?
- **`reference-compose`** (MiniMax Music 2.5 style-match: record piano phrase → extend to
  full track) still queued. Needs FAL_KEY and per-prototype budget OK (~$0.035/track).
  Still interested?
