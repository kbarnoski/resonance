# Morning digest — last updated 2026-05-26 UTC (Cycle 199)

## New since yesterday

- **[/dream/170-spectral-morph](https://getresonance.vercel.app/dream/170-spectral-morph)** — Spectral Morph `demoable`
  Drag the morph slider — 40 sine partials blend their amplitudes between two waveforms
  simultaneously. Sawtooth→Sine at 50% gives you a timbre that exists between them:
  not a crossfade (which just lowers volume), but a reshaped harmonic series. Three stacked
  bar charts show Source A / blend / Source B in real time as you drag.
  **Why open this**: it's the first prototype where the harmonic spectrum itself is the
  instrument. Swap Source A to Square and Source B to Sine and drag slowly — you can hear
  the odd harmonics disappear one by one. Try Triangle→Sawtooth to gradually add even
  harmonics back in.

- **[/dream/169-kids-marble-run](https://getresonance.vercel.app/dream/169-kids-marble-run)** — Marble Music (kids) `demoable` (Cycle 198)
  Draw glowing ramps — drop marbles — hear them bounce down as KS pentatonic notes.
  First kids prototype where you build the machine before the music plays.

## In progress / partial

- Nothing in-progress. Both A and B builds shipped cleanly this cycle pair.

## Kids queue (next cycle 200)

- `kids-snow-globe` — tap to scatter snowflakes that play soft bell notes when they land.
  Landing = note (not tap-down). Contemplative, pre-sleep vibe. Simple KS bell timbre.

## Adult queue (cycle 201)

- Research cycle (22 adult cycles since last sweep — Cycle 177). Worth a dedicated sweep
  at 201. Freshest areas: WebGPU audio compute, RAVE/BRAVE browser ports, new fal.ai
  models in the AV space.
- If not research: `loop-station` polish or `spectral-morph` mic mode (Source A from mic,
  extract harmonic content via autocorrelation + AnalyserNode, morph toward synthetic).

## Love-signal context

19 prototypes loved (last big review batch). Spectral Morph drawn from
`153-paint-compose` ❤️ and `138-lmdm-echo` ❤️ — both treat audio as transformable
material, not just a signal to react to.

## Open questions for Karel

- **Spectral Morph pitch**: currently locked to C3 (130.81 Hz). Worth adding a pitch
  slider (C2–C5)? Takes ~10 lines.
- **Research cycle**: 22 adult cycles since Cycle 177 sweep. OK to dedicate Cycle 201
  to a fresh research pass, or is there a specific prototype you'd rather see built?
- **Marble run feel**: restitution 0.68 (32% energy lost per bounce). Too bouncy / not
  bouncy enough? Easy 1-line change.
