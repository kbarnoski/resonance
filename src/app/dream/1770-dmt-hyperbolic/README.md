# 1770-dmt-hyperbolic

**One question:** *What if the DMT breakthrough's hyperbolic, negatively-curved geometry could bloom in real time — Escher's Circle Limit alive and breathing, driven by sound?*

- **State:** DMT breakthrough
- **Pole:** intense
- **Input:** audio — a deterministic self-playing generative carrier by default; optional file-drop of your own track
- **Output:** WebGL2 full-viewport fragment shader (three.js `ShaderMaterial` on a fullscreen triangle)
- **Technique:** Poincaré-disk {7,q} hyperbolic tiling folded by an exact (2,7,q) reflection group, with Möbius drift toward the boundary, saddle-curvature fold displacement, and an iridescent thin-film palette with edge chromatic aberration — all FFT-driven
- **Palette:** neon-iridescent (lives inside the GLSL only)

## How to use

Press **Enter the bloom**. Audio must be gesture-started, so the `AudioContext`
resumes on that click. A seeded generative carrier — a slow inharmonic
pentatonic piano-like arpeggio over a detuned drone — begins on its own and
keeps evolving with no further input, so the piece is always alive and audible
(including on a headless review box).

Controls (bottom-left): **Stop** (full teardown), **Mute**, and **Drop a
track** — pick any audio file and it is decoded via `decodeAudioData` and routed
through the same `AnalyserNode`, becoming the carrier that drives the geometry
(the ghost carrier ducks away). **Design notes** (top-right / intro) opens a
panel summarising the build. These visuals are built to ride a slow piano — a
dropped solo-piano or ambient track reads especially well.

## What drives what

The `AnalyserNode` FFT is split into bands, mapped to the neural-gain
phenomenology of the breakthrough:

- **bass** → global Möbius drift speed + saddle-fold depth
- **mids** → tiling curvature / apparent {7,q} density (q drifts 3↔4)
- **highs** → chromatic aberration at the boundary + fine iridescent detail
- **overall loudness** → saturation + gain (neural gain rising on V1)

A **journey arc** is derived from the audio energy envelope plus a slow
frame-based clock: onset (still, faint, low entropy) → come-up (folds emerge) →
breakthrough (max curvature/entropy/saturation, edges melted) → soft return.

## How the geometry works

Every pixel is a complex point in the unit disk. A disk automorphism
`m(z) = e^{iθ}(z − a)/(1 − ā z)` drifts the tiling; because hyperbolic area
grows exponentially toward the boundary circle, the tiles bloom without limit —
the felt "infinite regress / more axes than physical reality allows". Each point
is then folded into the fundamental triangle of the (2,7,q) triangle group via
two mirror lines (angles 0 and π/7) and one mirror circle orthogonal to the unit
circle (derived exactly from the law of sines so the triangle closes with angles
π/2, π/7, π/q). The number of circle inversions is the tile-ring index that
colors the iridescent palette.

## Determinism

An integer frame counter plus a fixed-seed `mulberry32` PRNG drive everything in
the audio/visual/state path. No `Math.random`, `Date.now`, `new Date`, or
`performance.now` appears there; `ctx.currentTime` is used only for Web Audio
scheduling and ramps. The self-playing ghost therefore renders identically on
any machine.

## Safety

No alpha-band (8–12 Hz) flicker. All luminance modulation is slow (≤3 Hz): the
palette cycle runs at ~0.09 Hz, the drone filter LFO at 0.05 Hz, and intensity
is conveyed through fast **motion** and **saturation**, never full-screen
high-contrast strobe. `prefers-reduced-motion` reduces motion amplitude
throughout. Master chain ends `DynamicsCompressor → gain ≈ 0.15`.

## Named references

- **QRI / Qualia Computing — "The Hyperbolic Geometry of DMT Experiences:
  Symmetries, Sheets, and Saddled Scenes"** (Andrés Gómez Emilsson, 2016) — the
  core thesis that breakthrough geometry is negatively curved: hyperbolic
  sheets, saddles, and exponentially blooming tilings.
- **M.C. Escher, *Circle Limit* series** (with **H.S.M. Coxeter**, 1956) — the
  Poincaré-disk hyperbolic tessellation this piece renders and animates.
- **Bressloff–Cowan cortical form-constant / log-polar map** — the retino-
  cortical map under which cortical activity patterns become the geometric form
  constants of hallucination.

## Honest limitations

- The {7,q} fold is exact only at integer q; while mids drift q between 3 and 4
  the tiling is a smoothly-morphing approximation rather than a perfect
  tessellation (this reads as "breathing density", which is intentional).
- Near the boundary circle the fold loop is truncated (26 iterations), so the
  deepest infinite-regress detail is softened rather than resolved to infinity.
- The generative carrier is a stylised piano/drone, not a real DMT-associated
  soundscape; the mapping from FFT bands to phenomenology is an artistic analogy
  informed by the references, not a neuroscientific model.
- This is a visual/sonic evocation. It is not a substitute for, nor a
  reproduction of, the experience it references.
