# 1462 · Box Temple

## The one question
**What if you could walk through an endless folded-architecture fractal — a
machine-elf temple of infinite corridors and chambers — and the geometry's own
folding structure resonated as sound, so travelling through it plays it?**

This is the *architectural* face of the fractal-breakthrough phenomenology: not
organic bloom but rigid, hyperbolic, cathedral-of-impossible-architecture — boxes
within boxes, corridors that multiply and tighten as you fold deeper. The pole
runs from **cosmic-ambient** (drifting slowly through calm chambers) to **intense**
(folding into a dense, tightening lattice).

## The technique
A single WebGL2 fragment shader **raymarches a Mandelbox distance estimator**.

- The Mandelbox is Tom Lowe's fractal ("**Tglad**", FractalForums, 2010). Each
  iteration applies a **box fold** (`v = clamp(v, -1, 1) * 2 - v` — reflect any
  component that leaves the unit box) followed by a **sphere fold** (rescale toward
  a fixed radius when inside `minRadius`), then a linear `v = scale·v + c`,
  accumulating the running derivative `dr`. The distance estimate is `|v| / |dr|`.
  A **negative scale** (≈ −1.6 … −2.35 here, 10–14 iterations) produces the classic
  rigid, temple-like structure rather than a rounded blob.
- Rendering is **sphere-tracing** the DE from the camera (max ~110 steps),
  the surface normal is the DE gradient, ambient occlusion comes from the step
  count, and corridors glow from a grazing-distance accumulator — the
  distance-estimator raymarching lineage of **Iñigo Quílez**'s articles. Colour is
  an IQ cosine palette (cold indigo/violet stone → warm amber inner light).
- The camera **drifts forward through the structure on load** (a live flythrough,
  never blank), slowing as it nears walls so it glides through corridors, steering
  back toward the lattice if it drifts out toward the void. Pointer drag steers the
  heading; wheel / pinch / the *Fold deeper* button raise the fold scale and
  iteration count so the corridors multiply.

Everything is deterministic: no `Math.random`, no `Date` — a seeded `mulberry32`
generates the reverb/noise, and `performance.now()` only drives animation time.
No three.js, no external libraries — WebGL2 + Web Audio + React only.

## The sonification — the folding structure resonates
Each frame the **same Mandelbox fold** is run on the CPU for the single point *at
the camera* (`mandelbox.ts`), and its structure drives the audio directly, so
**movement is playing**:

- **Folds triggered → resonant band-pass voices.** A bank of up to 8 high-Q
  band-pass "corridor" resonators (noise + sine through a bandpass). Every
  iteration that *folded* lights one voice, and its pitch is read **continuously**
  from that iteration's radius — the local temple dimension. The mapping is
  log-continuous over `[0.08, 8] → [95, 1500] Hz`; pitches are **never snapped to a
  scale**. They are inharmonic and alien, because the temple's own dimensions set
  them — that is the point (and the reason the banned "always-consonant scale-index"
  crutch is deliberately absent).
- **DE at the camera (wall proximity) → reverb + presence.** Gliding close to a
  surface makes the voices present, dry, and higher-Q; an open chamber sends them
  distant and reverberant through the shared cavernous void reverb.
- **Fold depth → drive.** Deeper folding = more folds = more active voices, more
  presence, and an opening inharmonic drone bed (its ratios are fractal-derived
  `[1, 1.34, 1.78, 2.29, 2.97]`, not a consonant chord).
- **Fold-boundary crossings → pings.** When the total fold count at the camera
  changes, one voice is transiently excited — a sparse resonant ping as you pass
  through a fold wall.

Audio safety: master gain ramps from silence, peaks ≤ 0.22, and passes through a
`DynamicsCompressor` limiter before `ctx.destination`; polyphony is capped (8
corridor voices + one low bed). Full teardown on unmount stops every node, cancels
the animation frame, closes the `AudioContext`, and loses the GL context.

## Sonification mapping (summary)
| Temple structure at the camera | Sound |
| --- | --- |
| iteration folded → voice pitch | band-pass voice tuned to that iteration's radius (continuous, inharmonic) |
| box + sphere fold count | number of active voices + drone drive (density/intensity) |
| distance estimate (wall proximity) | reverb wet ↔ dry + band-pass Q (present vs. distant) |
| fold-boundary crossing | sparse resonant ping |
| fold depth control | scale/iterations up → denser corridors, more voices |

## Known limitations & honesty
- The Mandelbox DE is a slight over-estimate in places; the march uses a 0.9
  relaxation and a small collision push-out, so very rarely a fold edge can look a
  touch soft or the camera can graze a wall before sliding off it.
- The camera is an autonomous, steerable drift, not free-fly WASD — you nudge its
  heading and depth; it will not let you fly out into the empty void for long
  (it steers back so the piece never goes blank/silent).
- The CPU fold and the GLSL fold are kept in sync by hand; they share the same
  constants (`minRadius² = 0.25`, `fixedRadius² = 1.0`) but are two
  implementations, so the sonified point is representative of, not bit-identical
  to, the rendered pixel under it.
- Raymarching a 10–14-iteration Mandelbox at ~110 steps is fragment-heavy; devices
  are limited to ≤ 1.75× device-pixel-ratio to keep the flythrough smooth. On a
  weak GPU it may run below 60 fps.
- If WebGL2 is unavailable the visuals degrade to a readable notice, but the
  temple still resonates — the audio does not depend on the GPU.

## Lineage
Mandelbox — Tom Lowe ("Tglad"), 2010. Distance-estimated raymarching of fractals —
Iñigo Quílez. The "impossible architecture / temple of infinite corridors" reading
belongs to the wider psychedelic-breakthrough and hyperbolic-geometry phenomenology
this lab keeps circling.
