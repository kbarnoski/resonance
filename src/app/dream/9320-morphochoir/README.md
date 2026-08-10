# 9320 · Morphochoir

**One question:** What if a living reaction-diffusion field were a CHOIR you seed
and play — where the morphogenesis itself (spots → worms → labyrinth) is heard as
a shifting chord?

## What it is

A Gray-Scott two-chemical reaction-diffusion field, simulated on **WebGPU compute
shaders**, that you seed and play from the **keyboard**. Letter keys drop reactant
into the field; the reaction self-organizes into Turing patterns. Eight fixed
**listening probes** on a ring sample the local field each frame, and each probe
gates one **warm note** of a pentatonic choir. As the pattern grows, sweeps, and
re-shapes, the chord breathes and re-voices — the morphology _is_ the music.

## How it works

- **Simulation.** Two chemicals U and V live in an `rgba16float` texture (U in
  `.r`, V in `.g`). A compute pass steps the classic Gray-Scott equations with a
  nine-point weighted Laplacian and toroidal (wrapping) boundaries, ping-ponging
  between two storage textures. Ten sim steps run per rendered frame, so a
  morphology forms within about a second of load.
- **Seeding.** A letter key injects a small decaying disk of V at a deterministic
  position derived from the key code. A short click on the stage is a mouse
  fallback, but the keyboard is the instrument.
- **Regimes.** Number keys `1`–`4` move to four labelled points on Pearson's
  feed/kill map — **Mitosis** (dividing spots), **Coral** (branching worms),
  **Labyrinth** (winding maze), and **Solitons** (drifting cells). Each is a
  visibly and audibly different morphology.
- **Listening.** A second compute pass reads the eight ring probes (local V and
  gradient magnitude), writes them to a storage buffer, and copies that to a
  mappable buffer read back asynchronously. Those readings drive the choir.
- **The choir.** Eight note-gated FM voices (carrier + low-index modulator,
  shared slow vibrato, soft lowpass), each quantized to a fixed 12-TET major
  pentatonic degree. A voice sounds only while its probe's activity crosses a
  threshold and fades to silence otherwise — no held drone. The whole mix runs at
  ~0.18 into `createSafeMaster` (high-shelf + lowpass cap + limiter).
- **Alive on load, muted-safe.** A seeded deterministic auto-demo seeds the field
  and cycles regimes with **no audio** the instant the page mounts, so a muted
  phone at 06:30 already sees the pattern forming and evolving. A "Start sound"
  button begins the choir on a gesture. User keypresses pause the autonomous
  seeding/cycling so you stay in control.
- **Graceful degradation.** If `navigator.gpu` is absent, a `text-destructive`
  note appears and the same Gray-Scott equations run on a coarse CPU grid painted
  with Canvas2D — the same probes, the same choir, just a smaller field.
- **Determinism.** All randomness comes from `mulberry32(0x9320)`; no
  `Math.random`, `Date.now`, or argless `new Date()`. Timing is `performance.now`
  and `AudioContext.currentTime` only.
- **Safety.** No strobe/flicker — only a slow, small luminance drift, damped
  further under `prefers-reduced-motion`. Full teardown on unmount: rAF cancelled,
  `device.destroy()`, all audio nodes stopped/disconnected, `AudioContext.close()`,
  listeners removed.

## Palette

Warm bioluminescent / organic: a deep near-black ground rising through amber and
gold to pale cream at the pattern crests. No violet, no clinical blue.

## Named references

- **Alan Turing**, _The Chemical Basis of Morphogenesis_ (Phil. Trans. R. Soc.,
  1952) — the origin of reaction-diffusion pattern formation.
- **John E. Pearson**, _Complex Patterns in a Simple System_ (Science, 1993) — the
  Gray-Scott feed/kill regime map; the specific (F, k) values used here for
  spots / worms / labyrinth / solitons come from that plane.
- (lineage) TouchDesigner feedback-loop practice (Bileam Tschepe / Elekktronaut) —
  reaction-diffusion as a browser-feasible GPU feedback loop.

## Honest limitations

- Probe readback is asynchronous, so the choir hears the field with a frame or two
  of latency. It is inaudible in practice but real.
- The field is fixed at 256×256 (GPU) / 96×96 (CPU); the canvas upscales, so at
  large sizes the pattern is smooth rather than crisp.
- Voice pitches are fixed per probe. The morphology changes _which_ probes gate
  and how strongly, not the tuning — the re-voicing is spatial, not modulating.
- Solitons and mitosis can locally die back to bare field if left unseeded; the
  auto-demo's slow re-seeding keeps the piece alive.
- `powerPreference: "low-power"` is requested for battery friendliness; a
  discrete GPU would allow a larger, sharper field.

## Next cycle

- Let each regime lightly transpose or re-voice the scale so the four morphologies
  are distinct harmonic worlds, not only textural ones.
- Add a slow toroidal drift/advection term so solitons visibly travel across the
  ring and hand notes from probe to probe.
- Make probe count and ring radius playable, so the "choir" can be re-seated.
- A history smear (feedback of the previous frame) for longer ghost-trails behind
  moving fronts.
