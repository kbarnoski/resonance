# 2402 · Sandfall

**The one question:** What if the lab's first-ever GPU compute simulation were a
playable *material* — pour tens of thousands of grains, and the collisions and
flow of the pile itself become the music?

A physical-simulation toy, not a mood piece. One expressive control (where you
pour) and one playful goal: build sand piles and topple them into song.

## What it is

- A **WebGPU compute-shader granular simulation** of up to **40,000 grains**.
  Grains fall under gravity, collide, pile up and settle. **Click-drag** on the
  field aims the pouring stream (the single expressive control). **Shake ⟵ / ⟶**
  impulses the whole field so the pile avalanches.
- **Audio derived from the simulation.** Every frame the field's aggregate state
  is reduced *on the GPU* into a 4-value stats buffer and read back to drive the
  sound. Nothing is pre-baked:
  - **motion → loudness** — mean grain speed sets the drone's level; a settled
    pile fades to near-silence.
  - **flow → rush** — the flowing fraction opens a band of noise into a rushing
    swell during an avalanche.
  - **fall → pitch** — mean downward speed bends the pentatonic drone *down*
    while grains are falling; it drifts back up as they settle.
  - **contact → grain** — collision correction magnitude gates a high, sandy
    hiss — the trickle/tick of grains striking the pile.

## The technique

First compute-shader prototype in the lab. The solver is **Jacobi
Position-Based Dynamics (PBD)** on a **fixed-capacity uniform grid**:

```
integrate → [ clearGrid → buildGrid → solve → applyCorr ] ×3 → finalize
```

Each grain hashes into a grid cell (atomic bucket insert), then **gathers**
separation pushes from its 3×3 neighbourhood and writes only its own position
correction. Because every thread writes solely to itself, there are no write
races and the whole field steps in parallel. PBD (positional projection rather
than stiff forces) keeps it unconditionally stable — the pile never explodes,
even under a hard avalanche impulse. Aggregate motion is summed into an atomic
stats buffer (fixed-point) and copied to a mapped staging buffer for the audio
thread. Rendering is instanced soft dots coloured by speed, in the same command
buffer.

## Named reference

MLS-MPM / SPH WebGPU fluid & granular simulation — the Codrops
**"WebGPU Fluid Simulations"** writeup (2025-02-26, ~100k particles on an iGPU
via MLS-MPM) and the broad 2026 consensus that **compute shaders are the single
most important capability WebGPU adds to the browser**. Also drew on classic
granular DEM / PBD contact-projection literature (Müller et al., Position-Based
Dynamics) for the solver.

## How it degrades (hard requirement, both paths are real)

- **No WebGPU** (`navigator.gpu`, adapter, device, or pipeline validation
  fails → thrown and caught): the piece runs a **Canvas2D CPU sim** at **3,000
  grains** with the *same* Gauss-Seidel granular solver and the *same* pour /
  avalanche / audio loop. An on-brand `text-destructive` note announces the
  fallback. Not a stub — a genuine playable instrument.
- **No AudioContext**: creation is wrapped in try/catch and the visual demo
  continues silently.
- **Silent review**: on load, before any gesture, a **seeded deterministic
  auto-demo** pours a sweeping stream, shakes the pile into an avalanche, clears
  and loops — so a muted phone shows the whole idea. Driven by a frame counter +
  `mulberry32(0x2402)`. No `Math.random`, no `Date`, no wall-clock anywhere.
- **Teardown**: on unmount/stop — oscillators & buffer sources stopped,
  `AudioContext.close()`, `requestAnimationFrame` cancelled, all GPU buffers and
  the `GPUDevice` destroyed.

## Next cycle

- True MLS-MPM transfer (grid-based pressure) for cohesive/wet sand and fluids,
  reusing this stats-readback → audio bridge.
- Multi-material grains (density/colour → timbre) and a proper prefix-sum grid
  sort so bucket capacity never clips under dense piles.
- Spatialised audio: pan the rush to the side the avalanche slides toward.
