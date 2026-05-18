# Morning digest — last updated 2026-05-18 UTC (Cycle 6)

## New since yesterday

- **[/dream/5-arcs](/dream/5-arcs)** — Journey Arc Engine v2. Open this first.
  Five tabs at the top: Psychedelic (the current arc), EDM Build-and-Drop,
  Cinematic, Ritual, Sleep Cycle. Click **Demo mode** → the arc plays out
  in 60 seconds so you can see all phases. Click any phase chip at the bottom
  to jump there immediately. Start mic → audio drives particle behavior live.

  Each arc has distinct phases (5–7), each with its own color palette, particle
  behavior (orbit / rise / scatter / grid / wave / dissolve), and intensity curve.
  The Sleep arc suppresses onset flashes (never startles). The EDM arc compresses
  from dark-grid intro → cyan build → white-hot drop → green euphoric plateau.

  The right panel (desktop) shows the current phase name + description and the
  arc's design rationale vs. the psychedelic baseline.

  **Why this matters**: building these arcs forces explicit answers to "how long
  is the build?", "where does the emotional peak sit?", "what does resolution
  look like in sound?" — questions the current engine never had to answer
  because there was only one arc.

## In progress / partial

- **4-operator polish** — scene crossfades (dual offscreen canvas), MIDI CC
  learn mode, auto-advance on crowd-noise threshold.
- **6-compose** queued — ACE-Step AI music gen ($0.006/call). Needs FAL_KEY
  and your go-ahead on budget.

## Research findings worth a look

See RESEARCH.md (from Cycle 4) — still current:
- ACE-Step music gen on fal.ai — text → 30s of music in 20s
- WebGPU at 70% browser coverage — unlocks 8-particle-life
- Gray-Scott reaction-diffusion — audio version doesn't exist yet

## Open questions for Karel

- **5-arcs playback audio**: the arcs demo with synthetic oscillators. If you
  have a short audio file per arc (even 30s of EDM, ambient, etc.), I can add
  looped HTML5 `<audio>` per arc so sound and visual structure actually match.
  Or I can generate placeholder files with Tone.js. Say the word.
- **6-compose**: FAL_KEY budget approval for ACE-Step AI music gen?
- **Arc priority for next cycle**: 7-spatial (HRTF binaural) feels surprising
  and self-contained. Or polish 5-arcs with actual audio. Your call.

---

**All prototypes live**:
- `/dream/1-live` — mic visualizer (demoable)
- `/dream/2-ghost-lab` — Ghost LoRA A/B lab (demoable, admin)
- `/dream/3-fluid` — Navier-Stokes fluid (demoable)
- `/dream/4-operator` — Operator panel (demoable)
- `/dream/5-arcs` — Journey arc engine v2 (demoable) ← new this cycle

**Preview**: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream
