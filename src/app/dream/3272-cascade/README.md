# /dream/3272-cascade — Cascade

Compose a rhythm by diverting a waterfall of physics marbles onto a row of tuned
bars — a browser marble machine where the "marbles" are thousands of
GPU-simulated particles.

## The one question

What if you could COMPOSE a groove not by placing notes, but by *steering a
stream* — tilting angled deflectors so a falling waterfall of particles lands on
the bars you want, in the rhythm you want?

## The machine

- Particles fall continuously under gravity from an emitter at the top of a tall
  play-field.
- Down the field sit a handful of **deflectors** — angled bars you can drag to
  reposition and rotate (grab the middle to move, grab an end to rotate) to
  re-aim the flow.
- At the bottom is a row of nine **tuned resonator bars** (a major-pentatonic
  row, low pitch left → high pitch right). Every particle that strikes a bar
  plucks that bar's note and flashes it.
- Your decisions — deflector positions and angles, plus the emitter's flow rate
  — steer *where* the stream lands and therefore *which* notes play and in what
  rhythm. Aim it for a groove; over-drive the emitter and the stream turns to a
  dense, unpitched wash (a decision you can get wrong).

This is a **kinetic / mechanical** piece — clockwork and marble-machine, not
cosmic or psychedelic.

## The technique — GPU compute physics

The ambition core. When the browser exposes WebGPU, the entire simulation runs
GPU-side:

- A **WGSL compute shader** integrates ~30,000 particles under gravity with
  2 substeps/frame, resolves collisions against every deflector (segment SDF +
  reflection with restitution) and against the bar row, clamps to a terminal
  speed, and recirculates spent particles back to the emitter with a
  flow-controlled release delay.
- Bar strikes are tallied into an **atomic storage buffer** that is copied back
  to the CPU each frame (36 bytes, via a small ring of mapped staging buffers)
  to drive audio — the only GPU→CPU traffic.
- Particles are drawn as **additive point-sprites** by a WebGPU render pipeline
  reading the *same* storage buffer the compute shader wrote — positions never
  leave the GPU.

Raw WebGPU (`navigator.gpu`) is used for the compute + render path rather than
the `three/webgpu` TSL node stack: it is the pattern already proven in this repo
(`130-tsl-particle-compute`), it keeps the atomic-hit readback explicit, and it
avoids the heavier TSL import surface at the `next build` gate. The novelty the
brief asks for — thousands of particles integrated *and collided* in a compute
shader and drawn without a CPU round-trip — is intact.

## Graceful fallback (required)

If `navigator.gpu` is undefined or WebGPU init throws, the **exact same machine**
runs on the CPU:

- ~1,400 particles integrated in a normal `requestAnimationFrame` loop.
- Rendered through **three.js `WebGLRenderer`** as additive instanced points
  (`THREE.Points` + a radial sprite texture).
- Identical physics constants, deflectors, bars, tuning and interaction — only
  the particle count and where the maths runs differ.
- A quiet `text-muted-foreground` note reads *"running CPU fallback — WebGPU
  unavailable"*. It is a degrade, not an error.

Only if **both** WebGPU and WebGL fail to initialise does the page show a real
`text-destructive` "3D unavailable" notice.

## The sound

Web Audio API only.

- Each bar is a short **struck-modal** voice: an inharmonic partial stack
  (1, 2.76, 5.40) with a fast, pitch-dependent decay plus a band-passed mallet
  tick, so higher bars ring shorter and brighter like a xylophone.
- A **voice pool** caps simultaneous notes and a **per-bar retrigger cooldown**
  keeps a dense stream from machine-gunning.
- Everything sums through a master **limiter** (`DynamicsCompressor`).
- The `AudioContext` is created/resumed on the Start gesture (autoplay policy).

## References

- **Wintergatan "Marble Machine"** — marbles released onto tuned acoustic
  percussion; the interaction model.
- **three.js WebGPU compute-physics (2026)** — thousands of particles integrated
  and collided in a compute shader and drawn without a CPU round-trip; the
  technique anchor (a July-2026 research finding this piece implements).

## What a next cycle could deepen

- Funnels and spinning rotors as additional divertors.
- A quantise-to-grid toggle so hits snap to a tempo, plus a swing control.
- Per-bar timbre / scale selection (whole-tone, microtonal rows).
- A shareable machine layout — deflector positions encoded in the URL.

## Files

- `page.tsx` — React shell, tall play-field, SVG interaction overlay, RAF loop,
  backend selection, design-notes modal.
- `sim.ts` — shared constants, types, CPU stepper, colour ramp, and the WGSL
  compute-shader builder (constants injected so GPU + CPU stay in lock-step).
- `webgpu-backend.ts` — raw WebGPU device / compute pipeline / render pipeline /
  atomic-hit readback.
- `webgl-backend.ts` — three.js `WebGLRenderer` CPU-sim fallback.
- `audio.ts` — Web Audio struck-bar voices, voice pool, cooldown, limiter.
- `readme-text.ts` — design-notes prose for the in-app modal.
