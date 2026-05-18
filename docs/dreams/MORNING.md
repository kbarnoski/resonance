# Morning digest — last updated 2026-05-18 UTC (Cycle 10)

## New since yesterday

- **[/dream/10-strange](/dream/10-strange)** — Strange Attractor + FM Synthesis.
  Open this one with headphones. Click **Start demo** — no permissions needed.

  The Lorenz chaotic system traces its butterfly in real time. Its xyz coordinates
  simultaneously drive FM synthesis: **x flips carrier pitch** between registers each
  wing transition (orange = high, blue = low); **z shapes timbre** (bottom = pure sine,
  top = buzzy harmonics); **|y| shifts the harmonic ratio**. You hear and see the same
  mathematical chaos at once.

  Wing transitions sound like random melody notes — because they are. The system is
  deterministic but unpredictable. With σ=10 they fire every 1–5 seconds; give it your
  mic and play loud to crank σ up to 18, and the transitions accelerate into turbulence.

  **Best demo**: Start demo, watch both wings for 20s (orange right, blue left). Then
  Start mic, hum quietly — hear the long sustained notes. Then sing loudly — watch the
  pitch jump go chaotic.

## In progress / partial

- **9-particle-life-gpu** — WebGPU upgrade (50k particles, WGSL compute shader).
  Next cycle's candidate.
- **10-strange polish** — σ/ρ/β sliders for exploring stable vs. chaotic regimes.
  Interesting pedagogically: below σ=24.74 the butterfly collapses to a fixed point.

## Research findings worth a look

See RESEARCH.md (Cycle 4) — still current:
- **ACE-Step** on fal.ai — text → 30s music (needs FAL_KEY)
- **Strange attractor → fluid loop** — pipe the FM output into 3-fluid as audio source.
  The fluid responds to its own chaos. Zero new code needed.

## Open questions for Karel

- **6-compose**: FAL_KEY + budget approval (~$0.006/call)? One-cycle build once approved.
- **10-strange carrier range**: current range is 3 octaves (110–880 Hz, A2–A5). Want it
  narrowed to one octave for more musical coherence, or is the dramatic sweep better?
- **σ/ρ/β sliders**: worth a polish cycle so you can explore non-chaotic regimes live?

---

**All prototypes live**:
- `/dream/1-live` — mic visualizer (demoable)
- `/dream/2-ghost-lab` — Ghost LoRA A/B lab (demoable, admin)
- `/dream/3-fluid` — Navier-Stokes fluid sim (demoable)
- `/dream/4-operator` — Venue operator panel (demoable)
- `/dream/5-arcs` — Journey arc engine v2 (demoable)
- `/dream/7-spatial` — HRTF spatial audio (demoable)
- `/dream/8-particle-life` — Particle life, emergent flocking (demoable)
- `/dream/9-reaction-diffusion` — Gray-Scott RD, Turing patterns (demoable)
- `/dream/10-strange` — Strange attractor + FM synthesis (demoable) ← new

**Preview**: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream
