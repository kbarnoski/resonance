# 11520 · Veilbreak

**One question:** What if your own movement, seen through the webcam, warped a
breakthrough visionary mandala — the concentric/spiral "form constants" of
visual cortex — so that waving a hand makes the tunnel of light bloom and fold?

INPUT live webcam → optical flow · OUTPUT WebGL2 fragment shader · TECHNIQUE
log-polar inverse-warp of a form-constant field · PALETTE iridescent thin-film
jewel tones · STATE visionary breakthrough · POLE intense.

## The geometry — form constants and the cortical map

Heinrich Klüver catalogued four recurring **form constants** of the visionary
state: (1) lattices / honeycombs, (2) cobwebs, (3) tunnels / funnels / cones,
(4) spirals. They are not pictures of anything — they are geometry of the visual
system itself, and they also show up in migraine aura, hypnagogia and flicker.

Bressloff & Cowan explained why: the map from the **retina to primary visual
cortex (V1)** is, to good approximation, a **complex logarithm**. Under that
map, simple straight stripe patterns of neural activity in the cortex become
curved patterns in the visual field:

| Cortical activity (log-polar space) | Perceived form (screen space) |
| ----------------------------------- | ----------------------------- |
| vertical stripes (vary with log r)  | concentric rings → **tunnels** |
| horizontal stripes (vary with θ)    | radial rays → **spokes** |
| diagonal stripes                    | **spirals** |
| hexagonal lattice                   | **honeycomb** |

So *all four* are one stripe/lattice field seen through one warp. This prototype
generates plane-wave stripes and a hex lattice in cortical `(log r, θ)`
coordinates, then applies the inverse warp `r = exp(u)` back to the screen. That
math is the shared engine in `_shared/visionary/logpolar.ts` (`screenToCortex`,
`cortexToScreen`, `formConstant`, `honeycomb`), reused here as GLSL.

## How movement drives the bloom

`flow.ts` is a live-body sensor: each webcam frame is drawn to a tiny 64×48
canvas and compared to the previous frame by absolute luma difference per cell —
a cheap optical-flow proxy (not Lucas-Kanade, and it doesn't need to be). That
motion field is aggregated into three scalars uploaded as shader uniforms:

- **energy** (total motion) → raises flow speed, cortical-noise amplitude,
  chromatic aberration, feedback bloom, and the drone's brightness.
- **bloom** (a slow accumulator off energy) → raises the kaleidoscope **fold
  count**, so more motion reorganizes the mandala into more symmetry.
- **centroid (x, y)** → bends the field's vanishing point toward your hand.

The result: at rest a calm slow tunnel; wave a hand and it accelerates, gains
petals, saturates, and folds — the "breakthrough" reading. A ping-pong feedback
buffer drifts each frame outward and decays it for iridescent jewel trails,
coloured by a thin-film palette with a traveling-wave phase sweep and mild
chromatic aberration.

## Self-demo / graceful degrade

The WebGL2 mandala animates from mount. If the camera is denied or unavailable
the **same** uniforms are driven by a seeded synthetic signal (slow LFOs), so
the piece still blooms and folds on its own within ~1 s. An `input · mode`
caption shows which sensor is live. The drone plays once audio is unlocked by a
gesture. No WebGL2 → an on-brand notice, never a throw or blank.

## Strobe safety (photosensitive epilepsy)

Non-negotiable. There is **no fast full-screen flashing**. All change is smooth
spatial drift of the warp; global luminance carries only a slow ~0.13 Hz breath,
far below the 3 Hz safety ceiling. `prefers-reduced-motion` cuts flow speed,
aberration and the breath, and damps the bloom. The shared `safeFlicker`
helpers (`prefersReducedMotion`) gate the reduced-motion path.

## Audio

A just-intonation drone (`_shared/visionary/droneBank.ts`) whose filter,
saturation and level open with motion energy, plus two shimmer partials that
fade in toward breakthrough. **All** sound is routed through the shared safe
master (`_shared/visionary/safeMaster.ts`) — limiter + brightness cap — never
`ctx.destination`. AudioContext is created only after a user gesture.

## Files

- `page.tsx` — orchestration, motion smoothing, UI, graceful degrade, teardown.
- `shader.ts` — WebGL2 form-constant mandala + ping-pong feedback + jewel palette.
- `flow.ts` — webcam frame-difference optical-flow sensor.
- `audio.ts` — drone + shimmer through the safe master.

## Teardown

Cancels rAF, stops the camera MediaStream tracks, disconnects the ResizeObserver,
stops oscillators and the drone, disconnects the master, closes the AudioContext,
deletes GL programs/buffers/textures, and loses the GL context.
