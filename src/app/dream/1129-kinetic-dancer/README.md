# Kinetic Dancer

Fourteen flat, identical, un-shaded ivory dots on a deep slate-blue ground —
placed at the joints of a rotating 3D human figure and projected
**orthographically**, so there are zero perspective or size depth cues. Your
brain assembles them into a living person turning in place, and because the
projection is depth-ambiguous, the perceived direction of rotation is genuinely
bistable: it flips on its own, or when you nudge it.

## What it is

- **Kinematics** (`figure.ts`): a 14-marker point-light skeleton (head,
  shoulders, elbows, hands, pelvis, hips, knees, feet) in 3D local coordinates,
  frozen in a pirouette pose — one standing pivot leg, the other extended out and
  forward, arms open. A soft breathing bob and slow limb sway keep it alive
  without adding depth cues. All variation is deterministic (`mulberry32`).
- **Projection + render** (`scene.ts`, class `KineticDancer`): a three.js
  `OrthographicCamera` and a single `THREE.Points` cloud with a flat round
  `PointsMaterial` (`sizeAttenuation:false`, equal-size ivory discs). The figure
  spins slowly about Y (a full turn every ~8 s, ≥ 6 s always). A signed `bias`
  adds a tiny **real** tilt about the horizontal axis — the only cue that can
  disambiguate the percept. A seeded autonomous drift lets the bias wander back
  across zero so the figure flips hands-off.
- **Audio** (`audio.ts`, class `DancerAudio`): two rivalrous stereo drones — a
  **bright** voice panned right for clockwise, a **dark/low** voice panned left
  for counter-clockwise — that crossfade with the figure's bias over a soft,
  centred pad. Just-intonation intervals of a single root (C3); everything runs
  through a `DynamicsCompressor` limiter. The `AudioContext` is created and
  resumed from the "Begin" gesture and closed cleanly on teardown.
- **Deepenings**: an **audio-only bias** toggle switches the visual tilt off
  entirely, leaving only the stereo balance to tip which way you perceive the
  spin; a **noise slider** buries the walker among randomly-moving decoy dots
  (deterministic), so at high noise she only "pops out" once your brain locks on.
- **page.tsx**: a client component with a serif title, drag-anywhere-to-bias
  canvas, a live "committed reading" + bias readout, controls for speed / bias /
  audio-only / noise, a collapsible design-notes panel, and a graceful no-WebGL
  fallback (a `text-rose-300` notice plus a static SVG point-light silhouette).
  Honours `prefers-reduced-motion` by slowing the spin and settling the drift.

## References

- **Johansson 1973** — point-light displays of biological motion.
- **Wallach & O'Connell 1953**; **Ullman 1979** — the kinetic depth effect /
  structure-from-motion (recovering 3D shape from projected 2D motion).
- **Kayahara 2003** — the bistable "Spinning Dancer" silhouette illusion.
- **"I see moving people: Expectations drive detection of biological motion in
  noisy point-light displays" (PMC 2026)** — the noise / expectation deepening.

## Honest caveats

- The **strength and rate of the flip are per-viewer** and can't be verified
  headless — the illusion lives in perception, not in the pixels. The readout
  reports the bias-committed reading, not what any individual actually sees.
- Orthographic ambiguity is real, but the figure's *actual* rotation is always
  the same direction; the audio and readout track the biasing cue, not a true
  measurement of the percept.
- The "audio-only bias" claim (sound alone tipping the visual percept) is a
  genuine open perceptual question offered as an experiment, not a guarantee.

## Constraints honoured

Self-contained; only `three`, React, Web Audio, Tailwind (no new deps); no
`Math.random` / `Date.now` in module scope (seeded `mulberry32` +
`performance.now`); no strobe/flicker (constant dot size & brightness, slow
rotation); audio through a limiter; full teardown (`dispose()` +
`forceContextLoss()` + `ctx.close()`) on unmount.
