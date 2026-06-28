# Echo Halls — Sphere (1029)

> Walk through a **sphere** of harmonic rooms and find a chord by **ear**.

Route: `/dream/1029-echo-halls-sphere`

## The question

What if you could walk through a sphere of harmonic rooms and find a chord by ear —
six rooms floating around you at varied azimuth **and** elevation (some above, some
below, some behind), each room's sound brought alive by a living particle field, so
you can close your eyes and turn toward the chord you want?

This is **cycle 2** of the lab's "Echo Halls" spatial-harmony thread. Cycle 1
(`1019-echo-halls-tonnetz`) laid the rooms out as a flat Tonnetz floor-plan. This
cycle is the embodied, **full-sphere, first-person** version with a real GPU
compute/particle resonating body.

## How it works

### Six rooms on a full sphere
Six sustained drone chords from the C-major neighbourhood — **I** (C-E-G), **vi**
(A-C-E), **IV** (F-A-C), **ii** (D-F-A), **V** (G-B-D), **iii** (E-G-B) — are placed
on a sphere around you at varied azimuth *and* elevation. Critically the layout is
not coplanar: **IV** sits high overhead (y ≈ +0.7), **ii** sits low underfoot
(y ≈ -0.7), and **vi / iii** hide behind you. Each chord is octave-folded into a
warm low band (~65–235 Hz fundamentals) and the master bus runs through a ~6 kHz
lowpass so nothing is shrill. The drones never stop and there are no "wrong notes".

### You are the AudioListener
Each room owns its own `PannerNode` with `panningModel: "HRTF"` placed at the room's
3D position. Every animation frame the listener orientation (`forwardX/Y/Z` +
`upX/Y/Z`, with a `setOrientation` fallback for older browsers) is rewritten from
the first-person camera, so the binaural field re-pans continuously as you look
around. This is the headline: **find-the-chord-by-ear**.

### Facing → bloom
`facingWeights()` is a softmax over the negative angular distance between your
forward vector and each room direction. The room you face gets the largest weight;
its wet gain ramps up (via `setTargetAtTime`, so no clicks) while others recede, and
crossing between two rooms cross-fades.

### The resonating body drives the sound
Each room contains a particle field that blooms when the room is active. Three tiers,
preferred first:

1. **WebGPU compute** — a WGSL compute shader advects 4096 particles on a
   curl-of-value-noise flow plus an attraction toward the room centre. A second
   pass reduces the particles' kinetic energy with an `atomic<u32>` accumulator;
   the result is copied to a `MAP_READ` buffer and read back via **non-blocking
   `mapAsync`**. Positions are read back every ~6 frames (also non-blocking) to feed
   the renderer.
2. **WebGL2** — the same curl-noise sim runs on the CPU; the point cloud is rendered
   on the GPU.
3. **Canvas2D** — minimal projected-blob fallback.

In **every** tier the measured aggregate energy is smoothed and fed into the active
room's **shimmer-layer gain** (a high sine partial of the chord root). So the sim
genuinely drives the audio — it is not decoration.

### Render
Hand-rolled first-person 3D in WebGL2 (no three.js, zero new deps): rooms are drawn
as glowing camera-facing blobs at their sphere positions, accent-hued by chord
function, with the faced room's particle cloud overlaid. A reticle and a
pitch-shifted horizon give an elevation cue. Canvas2D fallback projects the same
geometry.

## Input (no "finger on glass")

- **Pointer-look** (drag) steers yaw + pitch — orientation-based, not tap-a-button.
- **WASD / arrow keys** drift toward a room (bumps its bloom) and nudge yaw.
- **Device orientation** — if available, physically turning the phone drives
  yaw/pitch. iOS permission is gated behind the Start tap.
- **Auto-tour** — after ~2s idle, the gaze slowly orbits between a LOW room (**ii**)
  and a HIGH room (**IV**), sweeping pitch up and down so a hands-free reviewer
  sees *and* hears the elevation effect with zero interaction.

Audio only starts after the Start gesture (browsers require a gesture for
`AudioContext`). A silent visual appears immediately; audio joins on Start.

## Named references

- **Janet Cardiff, _The Forty Part Motet_** — 40 spatialized voices you walk among.
- **"Spatial Orchestra"** (arXiv:2510.23848) — walk into spatial bubbles, each a
  positioned note.
- **Full-sphere human static sound-localisation** (arXiv:2606.24367, 2026) — people
  *can* localize chords placed above / below / behind by ear; this is why elevation
  matters here.
- **Sonic4D** (arXiv:2506.15759, 2026) — viewpoint-adaptive binaural rendering.
- WebGPU reached browser baseline in 2026 — which is why a compute body is viable.

## Verification

Pure geometry/harmony math lives in `geometry.ts` (DOM-free). `geometry.test.ts` is a
plain-assert self-test runner (no framework needed; throws on the first failure and
logs a PASS count). It passes **89 assertions**, including:

- there are exactly 6 rooms with 6 distinct chord functions;
- every room direction is a **unit vector**;
- the layout spans the **full sphere** — at least one room with `y > 0.4` (above),
  one with `y < -0.4` (below), and one with `z > 0.3` (behind); no two rooms are
  closer than 0.35 rad (well separated, not coplanar);
- `facingWeights()` **sums to ~1** and **peaks at the faced room**, agreeing with
  `facedRoomIndex()`;
- every chord's pitch classes are **diatonic to the C-major scale tone set**;
- every chord frequency folds into the warm low band (60–240 Hz);
- `forwardFromYawPitch(0,0)` looks down −z and faces the tonic (**I**); pitching up
  raises the forward vector.

Run ad hoc:

```
npx tsx src/app/dream/1029-echo-halls-sphere/geometry.test.ts
```

(The repo's vitest runner is scoped to `src/lib/**`, so this co-located test is not
auto-run by `npm test` — it keeps the prototype self-contained.)

## What's unverified

- The HRTF elevation cues are not measured against ground-truth localisation; "you
  can hear above vs below" is an experiential claim, browser-/HRTF-dependent.
- The WebGPU path is implemented but not exercised in CI; in headless/no-GPU
  environments the WebGL2 CPU tier runs instead. The audio↔viz coupling is identical
  across tiers, so the headline behaviour is covered regardless.
- Device-orientation mapping (alpha→yaw, beta→pitch) is a simple linear map, not a
  full quaternion fusion; it is sufficient for "turn toward the chord" but will drift
  on some devices.

## Next-cycle deepening ideas

- True per-room compute bodies (one buffer set per room) so all six fields evolve at
  once and you can hear several shimmers layer as you sweep between rooms.
- Quaternion sensor fusion + optional WebXR for real head-tracked binaural walking.
- Voice-leading paths: let the chord you settle on bend its neighbours' tunings (just
  intonation pivots) so the sphere subtly re-tunes around your gaze.
- A measured localisation mini-game: a target chord plays, you turn to it eyes-closed,
  and the app scores your angular error — directly testing the "by ear" premise.
