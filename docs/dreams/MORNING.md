# Morning digest — last updated 2026-05-18 UTC (Cycle 5)

## New since yesterday

- **[/dream/4-operator](/dream/4-operator)** — Operator Panel. Open this first.
  Two-pane UI: performer canvas left, operator controls right. Click scene cards
  (or press 1–6) to switch between 6 live AV scenes. Press Space to tap BPM —
  all scenes pulse on beat. Start mic → crowd-noise meter (great on a laptop in
  a room with music). MIDI controller: auto-detects, notes C3–A3 trigger scenes.

  Scenes in order: Void (indigo starfield) → Threshold (cyan mist shafts) →
  Bloom (concentric rings on beat) → Current (Lissajous curves) → Ascension
  (orange particles bursting upward) → Terminus (magenta vortex pulling inward).
  Dip-to-black transitions between scenes (350ms).

- **Status badges corrected**: 2-ghost-lab and 3-fluid now show `demoable`.

## In progress / partial

- **5-arcs** (queued) — Journey engine v2: arc picker for EDM build-and-drop,
  cinematic three-act, ritual, sleep-cycle. Cycle 6 candidate.
- **4-operator polish** — scene crossfades (dual offscreen canvas), MIDI CC
  learn mode, auto-advance on crowd-noise threshold.

## Research findings worth a look

RESEARCH.md (Cycle 4) highlights still relevant:
- ACE-Step music gen ($0.006/30s call) — needs FAL_KEY and budget approval
- WebGPU at 70% — unlocks particle-life prototype (8-particle-life)
- Gray-Scott RD gap — no audio-reactive version exists; opportunity

## Open questions for Karel

- **6-compose (ACE-Step)**: needs explicit per-prototype budget (~$0.006/gen).
  Worth enabling? Just say the word.
- **4-operator transitions**: dip-to-black is industry-standard for live AV,
  but crossfade is possible (~1 more cycle). Preference?
- **Cycle 6 priority**: 5-arcs (journey arc alternatives), 7-spatial (HRTF
  binaural), or 8-particle-life (WebGPU)? Happy to jump to whichever
  feels most surprising.

---

**All prototypes live**:
- `/dream/1-live` — mic visualizer (demoable)
- `/dream/2-ghost-lab` — Ghost LoRA A/B lab (demoable, admin)
- `/dream/3-fluid` — Navier-Stokes fluid (demoable)
- `/dream/4-operator` — Operator panel (demoable) ← new this cycle

**Preview**: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream
