# The Luthier

**The one question:** *What if you could WIRE your own instrument — drop masses,
string springs between them, ground some, then pluck it and hear the exact shape
you built?*

A blank workbench where the network you see vibrating **is** the waveform you
hear. There is no separate synthesizer.

## How it works

This is **mass-interaction physical modelling** in the lineage of Claude Cadoz's
CORDIS-ANIMA system (ACROE, Grenoble) and the miPhysics library.

The instrument is a graph of point masses `{x, y, vx, vy, m, fixed}` joined by
spring + damper links `{a, b, restLength}`. Once per audio **sample**, every
link computes a force along its own axis — a Hookean spring term
`-k · (length − restLength)` plus a damping term `-z · (relative velocity along
the link)` — and each non-grounded mass is advanced with **semi-implicit
(symplectic) Euler** at `dt = 1/sampleRate`: velocity first, then position. This
runs inside an `AudioWorklet`, so it happens 48 000 times a second.

The output sample is the **velocity of the listener node**, DC-blocked and
passed through a `tanh` soft-clip. That same node network is streamed back to the
main thread ~60×/second and drawn on a Canvas2D. So the picture and the sound are
literally the same numbers — motion is audio, audio is motion.

The AudioWorklet processor is built as an inline JavaScript string and loaded
from a Blob URL — nothing lives outside this folder and there is no build step
for it. A `DynamicsCompressor` sits on the output as a limiter.

**Topology + material = timbre:**

- **String** — a tensioned line of 16 masses, both ends grounded. The springs
  rest slightly shorter than their spacing, so the line is taut and a transverse
  pluck rings with a near-harmonic overtone series. A plucked string.
- **Ring / bell** — a closed loop of 14 masses (one grounded to kill drift). Its
  bending and breathing modes are **inharmonic**; it rings like a small bell and
  decays quickly.
- **Web** — a triangulated net with grounded corners. A dense modal cluster with
  no single clear pitch — a metallic, rattly in-between sound.

Load any preset, pluck it, and the timbre is obviously different. That is the
whole point: you can hear the topology.

## Interaction guide

- **Start · build & play** — begins audio (browsers require a click first) and
  plucks the current build so you hear it.
- **Pluck** — drag a mass and let go; the release velocity is injected into the
  network and the whole object rings.
- **Add mass** — click empty space to drop a new point mass.
- **Wire** — drag from one mass to another to string a spring between them.
- **Ground** — click a mass to anchor it (fixed). Without at least one ground or
  enough springs, the net drifts.
- **Listener** — click the mass whose motion you hear.
- **Erase** — click a mass (removes it and its springs) or a spring.
- **Stiffness / Damping / Mass** sliders retune the entire network live.

On load, before any AudioContext exists, the default string is auto-plucked and
rings silently on a softened main-thread solver, so the workbench is alive within
a second with zero clicks. If `AudioWorklet` is unavailable, the piece falls back
to that same visual-only solver and says so. `prefers-reduced-motion` gentles the
plucks.

## Honest limits

Topology → timbre is genuinely the mechanism here, but the integrator runs a
small net (≤ ~16 masses) for numerical stability, and the on-screen self-demo /
fallback uses a deliberately softened main-thread solver — its pitch does not
match the audio-rate model, it only needs to visibly ring. When audio is playing,
the canvas shows the real audio-rate network.

## Reference

Claude Cadoz / **CORDIS-ANIMA** (ACROE, Grenoble) and the **miPhysics**
mass-interaction library (2026).
