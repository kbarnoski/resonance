# 1081 · Singularity Fall

> **The one question:** *What if you fell toward a black hole — light bending around
> it, your own sound red-shifting — until you crossed the horizon and the universe
> swallowed itself?*

`state: black-hole-infall / ego-dissolution-void · pole: intense`

INTENSE → cosmic-terror pole: the awe and ego-dissolution of the void, the NDE
tunnel taken to its violent limit. A drug-free altered state.

## Tags

- **INPUT** — device tilt (DeviceOrientation) + keyboard fallback. Tilt your phone
  to steer the infall vector; arrow keys / WASD on desktop. iOS orientation is
  requested from inside the "Fall ▸" gesture.
- **OUTPUT** — three.js: a GPU starfield / accretion-disk particle swarm plus a
  gravitational-lensing fragment shader that bends the background around the hole.
- **TECHNIQUE** — gravitational lensing via GPU ray-bending. An approximate
  Schwarzschild deflection bends each screen ray toward the singularity by an angle
  ∝ 1/impact-parameter, producing an Einstein ring and a black shadow disk; the
  accretion disk is Doppler + gravitationally blue/red-shifted; a swarm of infalling
  particles spirals inward on geodesic-ish paths.
- **PALETTE / VIBE** — intense cosmic terror: deep black, blue-shifted forward rim,
  red-shifted trailing tone, blinding photon-ring white. (Not bloom-radial-pastel,
  not log-polar, not calm-ambient.)

## Named reference

Gravitational lensing of a Schwarzschild black hole — the *Interstellar*
**"Gargantua" DNGR renderer** (James, von Tunzelmann, Franklin & Thorne, *Gravitational
Lensing by Spinning Black Holes in Astrophysics, and in the Movie Interstellar*,
Class. Quantum Grav., 2015) — and the recent (2026) Three.js / WebGPU **"Singularity"**
black-hole raymarch community pieces. This version is a **real-time browser
approximation**, not a full geodesic integrator: rays are bent by a closed-form
1/b deflection rather than integrated along null geodesics.

## Subsystems (4)

1. **Device tilt / keyboard input** (`input.ts`) — requests `DeviceOrientationEvent
   .requestPermission?.()` on iOS from inside the user gesture, then maps
   `beta`/`gamma` to a steering vector in [-1,1]. Arrow keys / WASD are always
   listening as a desktop fallback; the active mode flips to whichever last fed
   input. If neither yields data, the mode stays `auto` and the page drives an
   autonomous slow spiral so it plays with zero input.
2. **three.js black hole** (`scene.ts`) — two passes over one renderer:
   (a) a fullscreen **lensing fragment shader** samples a procedural starfield through
   a ray bent toward the (steered) shadow center by `deflect / (b + ε)`, drawing a
   blinding **photon ring**, a soft-edged **shadow** disk, and a foreshortened,
   **Doppler-beamed accretion disk** (approaching side brighter/bluer); (b) the
   camera falls inward over the arc, tilt steering it for parallax.
3. **Infalling particle swarm** — ~4000 GPU points; the vertex shader advances each
   point's angle (spinning up as radius shrinks), flattens it toward the disk,
   stretches + reddens it near the horizon, and fades it out at the shadow.
4. **Audio synthesis** (`audio.ts`, Web Audio) — reuses the canonical detuned-just
   drone bed from `_shared/psych/droneBank.ts` (drive opens with arc progress).
   On top: a red-shifting partial pair that **glides down in pitch** toward the
   horizon, a rising sub-bass **"swallow"** whose gain + cutoff grow as the shadow
   fills the view, and a bright inharmonic **bell** struck once at the photon-ring
   crossing. A compressor limits the sum. AudioContext starts from the gesture.

## Long-form arc (~3 minutes, stateful)

Progress `0→1` threads every subsystem, then resets to a fresh approach:

- **0.00–0.30 · distant approach** — faint lens, slow spiral, quiet dark drone.
- **0.30–0.60 · lensing intensifies** — the Einstein ring tightens, the shadow
  swells, your tone begins to red-shift down.
- **0.60–0.82 · disk roar** — the Doppler-beamed disk blazes, the swallow sub rises.
- **0.82–0.92 · horizon crossing** — the shadow fills the view; the photon-ring bell
  strikes.
- **0.92–1.00 · white-out** — a smooth luminance ramp washes toward white, then
  reset. It feels different at the end than the start: quiet blue distance vs. a
  red-shifted, sub-bass-swallowed white void.

## How to play

1. Open `/dream/1081-singularity-fall`. Press **"Fall ▸"** (starts audio + requests
   tilt permission).
2. **Phone:** tilt to steer where you fall — the singularity drifts across your view.
3. **Desktop:** arrow keys or WASD steer. With no input at all, you fall on an
   autonomous spiral.
4. Watch (and hear) the arc: distant approach → lensing → disk roar → the horizon.
   Press **"End ▸"** to stop.

## Safety

The horizon-crossing white-out is a **smooth sine luminance ramp** (rise then fall),
routed through `_shared/psych/safeFlicker.ts` clamped to **≤2 Hz** with a 0.7 floor —
a gentle drift, never a fast full-frame strobe.

## Graceful degradation

- **No DeviceOrientation** (desktop / denied): keyboard steer; with no input at all,
  an autonomous slow spiral infall. A small `text-amber-300/95` notice states the
  active input mode.
- **No WebGL:** a readable `text-rose-300` notice instead of the scene.

## Files

- `page.tsx` — client shell: arc state machine, hero + "Fall ▸", input-mode notice,
  design-notes reveal, teardown.
- `scene.ts` — three.js lensing shader + particle swarm + camera fall.
- `audio.ts` — Web Audio: drone bed, red-shift glide, swallow sub, photon-ring bell.
- `input.ts` — DeviceOrientation permission + tilt/keyboard/auto steering.
