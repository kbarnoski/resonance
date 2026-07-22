# 2320 · Three Valves

**The question:** what if an altered state of consciousness were not ONE dial
from calm → peak, but a **cube** navigated along three genuinely independent
axes — where the same three sliders, in different combinations, produce
categorically *different* phenomenologies: geometric hallucination vs.
figurative/semantic imagery vs. the feeling that it is *real-and-out-there* vs.
*imagined-and-in-here*?

## The instrument: the C×G×D reducing-valve cube

Aldous Huxley described perception as a **reducing valve** that filters "Mind at
Large" down to a survival trickle, and psychedelics as the valve relaxing. The
2026 Frontiers paper below reframes that single valve as **three independently
manipulable computational functions** of a deep generative-perception network.
This piece makes all three draggable at once, as three faders on one field:

- **C — Classifier constraint.** Relax it and normally-hidden "effective causes"
  surface as **geometric form constants** — Klüver's tunnels, spirals, spokes and
  honeycomb — rendered here through the shared log-polar (retina→V1) warp. Low C =
  tight perception; high C = pure geometry blooms. *Cool / teal channel.*
- **G — Generator prior.** Its strength governs **abstract → figurative**. Low G =
  flat fine abstract grain; high G = the field gains bilateral symmetry, larger
  coherent structures and dark nuclei, organising into almost-recognisable
  figures / masks / scenes. *Warm / coral–magenta channel.*
- **D — Discriminator / reality-monitoring threshold.** Governs whether the same
  imagery is felt as **real, out-there, bound** or **imagined, in-here, unreal.**
  Low D = drifting, hazy, translucent, drowned in reverb; high D = crisp,
  grounded, mono-centred, present.

## Why this is NOT a single knob

There is **no master intensity**. The three axes are orthogonal and are meant to
*conflict and combine*, so each octant of the cube is a different world, not a
different brightness:

- **high C · low G · low D** → floating geometry that feels unreal.
- **high C · low G · high D** → the *same* geometry snapped solid and present.
- **low C · high G · high D** → a vivid figurative vision with no lattice at all.
- **low C · high G · low D** → ghost figures, suppressed, hovering in fog.
- **high C · high G · high D** → objective visions: figures bound inside a lattice.

Drag any two valves against each other and the category changes, not just the
degree. If the piece could be collapsed to one calm→peak dial it would have
failed its own brief — the readout names the current octant to keep the
independence legible.

The three valves drive **sound** the same way: **C** widens the detune-spread and
inharmonicity of a just-intoned Phrygian pad (consonant bed → shimmering
inharmonic cloud); **G** sweeps a formant/vowel filter (dark abstract noise →
resonant almost-vocal); **D** crossfades dry/present against the shared void
reverb and a Haas stereo spread (mono-centred-present ↔ smeared-wide-unreal).

## Interaction

- **Three draggable vertical faders** (C, G, D) — the live readout *and* the
  controls. Each has a `type="range"` fallback for touch / keyboard accessibility.
- A **seeded, deterministic autopilot** (mulberry32) self-demos the cube on load,
  gliding through distinct octants so a silent reviewer sees the whole idea with
  zero interaction. Grabbing any fader takes the wheel; a toggle re-engages it.
- **Start sound** — audio is silent until pressed (1 s fade-in, master ≤ 0.18
  behind a `DynamicsCompressor`).

## Safety & degradation

All visual change is **slow luminance / colour drift — no strobe, no flicker.**
`prefers-reduced-motion` is honoured (motion collapses to a gentle drift). Without
WebGL2 the piece shows a clear notice and a text fallback. Full teardown on
unmount (rAF cancelled, GL program/buffers disposed and context lost, AudioContext
closed after the reverb tail).

## Named references

- **"Beyond the reducing valve: towards a computational neurophenomenology of
  altered states via deep neural networks,"** *Frontiers in Psychology*, 20 May
  2026. doi:10.3389/fpsyg.2026.1819038 — the C (classifier), G (generator),
  D (discriminator) decomposition this instrument is built on.
- **Aldous Huxley,** *The Doors of Perception* (1954) — the "reducing valve."
- **Heinrich Klüver,** *Mescal and Mechanisms of Hallucinations* (form constants,
  1926 / 1966) — the four geometric constants (lattice, cobweb, tunnel, spiral).

## Shared infrastructure used

- `_shared/psych/logpolar` — `LOGPOLAR_GLSL` (the log-polar / form-constant GLSL
  engine) spliced into the fragment shader.
- `_shared/psych/convolutionVoid` — `createVoidReverb` (the shared void tail that
  D drowns the signal in).
- `_shared/psych/safeFlicker` — `prefersReducedMotion`.

## Files

- `page.tsx` — React client: WebGL2 setup, render loop, faders, autopilot, chrome.
- `shader.ts` — the C×G×D fragment shader (imports `LOGPOLAR_GLSL`).
- `audio.ts` — `ValveAudio`: the three-valve Web Audio instrument.
- `valves.ts` — pure helpers: mulberry32, autopilot schedule, octant labels.
