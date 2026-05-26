# Morning digest — last updated 2026-05-26 UTC (Cycle 201)

## New since yesterday

- **[/dream/172-loop-station](https://getresonance.vercel.app/dream/172-loop-station)** — Loop Station `demoable`
  **Load demo** immediately — four phase-locked loops start with no mic needed:
  violet sub-bass drone (2 bars), emerald pentatonic melody (2 bars), amber arpeggio (1 bar),
  cyan kick+hihat rhythm (1 bar). All four snap to the same beat grid and loop in perfect alignment.
  **Tap REC** on any slot to layer your own mic recording. Tap again to stop — the recorded loop
  trims to the nearest bar and aligns to beat 1 with no manual quantization.
  Per-slot controls: bar length (1b/2b/4b), MUTE (smooth crossfade), ✕ (clear). TAP TEMPO.
  **Why open this**: first sandbox prototype about *constructing* a composition. 171 prior
  prototypes react to audio or generate it. This one asks you to build it deliberately.
  Zero permissions for demo · Zero API · Zero deps · 4.55 kB.

- **[/dream/171-kids-snow-globe](https://getresonance.vercel.app/dream/171-kids-snow-globe)** — Snow Globe (kids) `demoable` (Cycle 200)
  Tap high on sky → high note (C4 rose); tap low → low note (C3 violet). The note plays when
  the flake LANDS, not on tap — gravity delay as musical pedagogy.

- **[/dream/170-spectral-morph](https://getresonance.vercel.app/dream/170-spectral-morph)** — Spectral Morph `demoable` (Cycle 199)
  Drag slider to blend two waveforms' harmonic spectra. First prototype to synthesize from
  spectral manipulation rather than just analyze.

## In progress / partial

- Nothing in-progress. Cycle 201 shipped cleanly.

## Kids queue (cycle 202)

- `kids-garden-bloom` — hold finger on soil → stem grows, petals unfold one per second (each
  petal = triangle-wave note, pitch rising). Hold 4s = 5-petal chord. Up to 6 flowers.
- `kids-raindrop-rhythm` — tap clouds → burst of raindrops → pentatonic note on landing.
  Three-voice polyphony, auto-rain keeps canvas alive.

## Research note

Adult research last done Cycle 177 (23 cycles ago). Getting overdue. Could pair nicely
with a Cycle 203 research sweep — but the build queue is still rich.

## Open questions for Karel

- **Loop station overdub**: tap REC on a looping slot to mix new recording into existing buffer.
  Worth ~2 cycles. Want this for v2?
- **Spectral Morph pitch**: root locked to C3. Add pitch slider?
- **Snow Globe bell count**: 5 pitches (C3–C4). Too many for 3-year-olds? Narrow to 3?
- **Marble run restitution**: 0.68 energy retained per bounce. Too bouncy / not enough?
