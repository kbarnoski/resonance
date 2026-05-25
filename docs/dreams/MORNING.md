# Morning digest — last updated 2026-05-25 UTC (Cycle 189)

## New since yesterday

- **[/dream/161-tap-rhythm](https://getresonance.vercel.app/dream/161-tap-rhythm)** —
  Tap Rhythm (adult). **Why open this**: press spacebar (or the TAP button) in time with
  any groove you're feeling — the system captures your timing, detects BPM from your
  inter-tap intervals, quantizes each tap to a 32-step (2-bar) circular grid, and starts
  looping. Kick / snare / hi-hat tabs let you layer drum types. The clock face shows all
  32 steps; click any dot to cycle it through kick → snare → hat → empty. BPM slider
  adjusts speed mid-loop. Demo pattern auto-loads on open so the clock is already spinning.
  **First prototype where rhythm timing is the primary input** — none of the 160 prior
  prototypes ask "when are you tapping?" rather than "what pitch are you playing?" A
  non-pianist can build a 2-bar groove in 30 seconds. Live performance tool. Zero API ·
  Zero deps · Spacebar works.

- **[/dream/160-kids-paint-loop](https://getresonance.vercel.app/dream/160-kids-paint-loop)** —
  Loop Garden (kids, Cycle 188). Draw a freehand stroke → it immediately loops as a
  pentatonic melody. Four color-timbre zones. Up to 4 simultaneous loops. Tap to erase.

## In progress / partial

- Nothing in-progress. Cycle 190 is next (kids cycle, 190%2=0). Plan: kids research sweep
  to refill KIDS.md queue (exhausted after Cycle 188), plus optional polish of
  `154-kids-clap-back` (pattern indicator dots).

## Research findings worth a look

- **Rhythm as the unexplored input modality**: 160 prototypes use pitch, spectral features,
  timing as output, or image analysis. Only `161-tap-rhythm` uses rhythm onset timing as
  the *input*. The same idea extends to: gesture rhythm (clap pattern → ghost scene arc
  tempo), breath rhythm (inhale/exhale → journey arc phase timing), walking rhythm
  (accelerometer → BPM). Worth exploring.
- **`161-tap-rhythm` layering approach**: because each tap session overlays rather than
  replaces, you can build a 3-layer drum pattern by tapping kicks, then snares, then hats.
  This is the exact same paradigm as `121-loop-station` (record → loop → layer) but for
  rhythm input instead of audio.

## Open questions for Karel

- **`161-tap-rhythm` feel**: is 32 steps (2 bars at 16th-note resolution) the right grid,
  or would you prefer a simpler 16-step (1 bar) default? Could add a "1 bar / 2 bar" toggle.
- **`161-tap-rhythm` mic mode**: the current prototype needs no mic — you tap a button.
  Should I add an optional mic onset-detection mode so live clapping or desk-tapping triggers
  steps automatically? One more cycle.
- **`154-kids-clap-back` pattern dots**: deferred to Cycle 190. Still wanted?
- **`160-kids-paint-loop` loop density**: 0.32 s notes, 12-note loops ≈ 3.8 s. Adjust?
