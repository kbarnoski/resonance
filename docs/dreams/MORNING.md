# Morning digest — last updated 2026-05-18 UTC (Cycle 22)

## New since yesterday

- **[/dream/20-scope](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/20-scope)** — Vectorscope
  Two modes. No permissions needed for the first:
  - **Lissajous demo**: each musical interval traces its own closed figure — octave = figure-8,
    fifth = three-lobed knot, fourth = four-crossing shape. CRT phosphor persistence makes
    the reversal cusps glow bright against dark. Phase slowly drifts so the figure breathes.
    *Why open this*: it's the oldest demonstration of the geometry of musical ratios. Jules
    Antoine Lissajous showed these to Napoleon III in 1857. None of the other 19 prototypes
    show it.
  - **Phase portrait (mic)**: plot signal[t] vs signal[t+delay]. Single piano note = ellipse.
    Chord = overlapping loops. Percussion = explosive spray. Delay slider reveals different
    periodicities. *Why open this*: it's what a Poincaré map of your playing looks like.

## In progress / partial

- **Sound for cymatics** — `19-cymatics` demo oscillator is silent (not connected to destination).
  Connecting it would complete the full physical experience (hear the resonant tone while watching
  the sand pattern). One-line fix queued next cycle.

## Research findings worth a look

- Research last done Cycle 18. Next cycle will be a research sweep (4 build cycles elapsed —
  past the 3-cycle rule). See RESEARCH.md §16–§21 for Cycle 18 findings.

## Open questions for Karel

- **`elevenlabs-compose`**: ElevenLabs Music API streaming + section-level arc control —
  $0.80/min ($0.40 for 30s track, ~$1.13 for 85s). More expensive than MiniMax but streaming
  + structured arc markup is a different capability. Approve budget?
- **`ghost-animate`**: Seedance 2.0 image → 15s cinematic video with native audio. Admin-only.
  Budget ~$0.05–0.15/clip. Need FAL_KEY set in env + approval to use.
- **`reference-compose`**: MiniMax Music 2.5 reference-audio style match — $0.035/track.
  Record 4-8 bars of piano → extend into full track in the same style. Need FAL_KEY + approval.
