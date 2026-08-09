# 3040 · tunnel

**The one question:** What if you could *pilot* your own passage down the
near-death "tunnel toward the light" — where holding toward the light blooms it,
letting go drifts you back into the void, and going still dilates time itself so
image *and* sound slow together?

A drug-free evocation of the near-death-experience / ketamine tunnel
phenomenology. You take nothing — screen and sound do the work. It is a piloted
instrument, not a self-playing simulation: you fly it moment to moment.

## The technique

A single full-screen **WebGL2 fragment shader** (`raymarch.ts`) sphere-traces
(raymarches) a camera flying down an **infinite tube SDF** on a slow Lissajous
path — an endless wormhole with:

- a **being-of-light core** far down the bore that blooms as you approach,
- exponential **depth fog** that thins toward the light,
- fake **gravitational light-bending** — each march step nudges the ray toward
  the core, so the geometry "pulls" (a lensing feel; the browser
  black-hole-lensing raymarch lineage),
- an animated **tunnel-vision vignette** that constricts the periphery,
- tube walls textured with cheap procedural **value-noise striations / caustics**
  (no textures), drawn from the shared brand violet ramp (`_shared/palette`).

Camera travel (`camZ`) and the striation clock are integrated in JS with the
**time-dilated** dt, so when the pilot goes still the flight and the wall drift
slow together.

## Controls (a hand always on it)

- **Steer heading** — pointer-drag, device-tilt (`deviceorientation`, with an
  iOS `requestPermission()` gesture button) and arrow-keys / WASD. All three sum
  into one heading vector.
- **Approach** — hold pointer down, hold Space, or hold the persistent
  "Hold to approach the light" button → accelerates commitment toward the core.
- **Drift back** — release → decelerate, drift into the darker, foggier void.
- **Time-dilation** — stop steering and approaching and a global `timeScale`
  decays toward near-stillness, slowing the shader clock and the audio glide
  together; any input blooms it back to 1.

## The mapping (control → visual → sound)

| Pilot signal | Visual | Sound (`audio.ts`) |
|---|---|---|
| **approach** ↑ (holding) | core nearer + brighter bloom, harder ray-bend, vignette constricts, fog thins | Shepard descent rate + brightness ↑, drone lowpass opens, void reverb dries |
| **approach** ↓ (release) | drifts back into dark void, heavier fog | descent softens, drone darkens, reverb wets |
| **timeScale** ↓ (stillness) | shader clock + travel slow to a crawl | descent glissando slows (dilated dt), master lowpass muffles the whole bed |

## Audio

Wires the shared psych kit (`_shared/visionary/`) into one master gain (≤ 0.14) →
dilation lowpass → `DynamicsCompressor` limiter → destination. The AudioContext
is created only inside the Start gesture.

- `shepard.ts` — the endless **descent** glissando (`dir: -1`), the plunge
  carrier. `drive = approach`; `step()` is called with the already-time-dilated
  dt so the glide slows exactly as the image slows.
- `droneBank.ts` — a low just-intonation sub-floor whose lowpass **opens toward
  the light** (drive = `0.12 + approach·0.88`).
- `convolutionVoid.ts` — the dark cavern; **wetter in the void**, drying out as
  you near the light.

## Determinism, degradation, safety

- No `Math.random` / `Date.now`. A `mulberry32(0x3040)` PRNG seeds the
  **autopilot**, which flies a slow deterministic S-curve so the piece
  self-demos with zero input (visibly flying within ~1 s of Start). Any real
  input hands the controls over; after ~3 s of stillness the autopilot resumes.
- If `webgl2` is unavailable or the shader fails to compile, it degrades to a
  **Canvas2D concentric-tunnel** (`makeTunnelFallback`) that answers the same
  controls + audio.
- Respects `prefers-reduced-motion`: slows the flight and **disables the
  clarity/bloom snap**, softens the vignette, and narrows the dilation range.
- Clean teardown on unmount: cancels rAF, disposes the WebGL context, stops the
  audio engines, closes the AudioContext, removes all listeners.

## Named references

- Raymond Moody, *Life After Life* (1975)
- Pim van Lommel et al., *Lancet* NDE study (2001)
- Borjigin et al., gamma surge in the dying brain (PNAS 2013 / 2023) —
  **evocation only, not a claim**
- Shepard–Risset endless glissando
- the browser gravitational-lensing / black-hole raymarch lineage (e.g. the 2026
  "Singularity" Three.js / TSL lensing showcase)

## Honest limitations

An evocation, not a medical or scientific model of dying — no claims are made
about what a near-death experience *is*. The aesthetic constants (lensing
strength, fog density, bloom, dilation curves) are hand-tuned, **not GPU-verified
on this build**. The lensing is a cheap per-step ray nudge toward the core, not a
true geodesic integrator.

## Next-cycle deepening (from the DEEP fan's two sibling approaches)

This shipped as the winner of a DEEP fan of three technical attacks on the same
"pilot the NDE tunnel" concept. The two runners-up are banked (IDEAS §922) and
their best ideas are the deepening path for this piece:

- **Volumetric mist + god-rays** (from `3096-lightbody`): replace the hard SDF
  wall with a marched *density field* (Beer–Lambert transmittance) and add
  forward-scattered crepuscular shafts streaming from the core, rendered
  half-res. Turns the tube into soft luminous smoke — the "cloud rushing toward
  the light" phenomenology — a selectable render mode alongside the SDF tube.
- **Feedback ring-rush + robustness** (from `3104-crossing`): a WebGL2 ping-pong
  "droste-zoom" feedback tunnel with log-polar ring injection (shares
  `_shared/visionary/logpolar`) runs on *any* GPU with two fullscreen passes — the
  right fallback tier between this raymarch and the Canvas2D degrade, and the
  most legible "concentric rings toward a point" NDE image.

Also queued: volumetric god-rays from the core; a sub-perceptual heartbeat under
the drone; a "let go entirely" ending that dilates all the way to a held white.

## Files

- `page.tsx` — `"use client"` component: Start gate, all three input sources,
  the piloting state machine + render loop, HUD, hold button, tilt-permission
  gesture, design-notes overlay, `PrototypeNav`, full teardown.
- `raymarch.ts` — GLSL source + WebGL2 setup/compile/draw, plus the Canvas2D
  fallback.
- `audio.ts` — the master-limited audio graph and the approach/timeScale drive
  mapping.
- `README.md` — this file.
