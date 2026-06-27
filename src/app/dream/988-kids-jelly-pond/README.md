**For**: kids (4+)

# Sing the Pond — a pond of water you play with your finger

A toddler drags a finger across a glowing pond of **thousands of real
GPU-simulated fluid particles**. The finger pushes and stirs the water; blobs
swell, merge, and splash — and **the water's own motion is the instrument**.
There are no wrong notes, no fail states, and it is never silent.

## The one question

> What if a 4-year-old could PLAY a pond of water with their finger, and the
> water's own motion sang?

## How the water sings (motion → sound)

The fluid simulation reports its own motion every animation frame, and that
motion drives the music:

- **Stirring speed / local particle velocity → a soft continuous shimmer
  voice**, pitched within a warm key (F-Lydian / major-pentatonic palette).
  Faster water climbs up the scale; it is always in key, so there are no wrong
  notes.
- **A splash** (a fast drag or a tap that shoves a cluster of particles) **→ a
  gentle bell/marimba sparkle**, a short arpeggio up the scale with a soft
  attack.
- **The size / density of the water pooled under the finger → a fuller, lower
  chord** when it is a big calm pool, and **brighter, sparser** sound when the
  water is scattered.
- An **always-on soft water-drone pad** so the pond is never silent.

## The fluid technique (the real GPU compute sim)

The water is a real **Position-Based Fluids (PBF / SPH-lite)** simulation run in
**WebGPU compute shaders** (WGSL), not a Canvas2D particle loop and not a single
fragment shader. Each frame runs these compute passes over ~4,096 particles in
GPU storage buffers:

1. `predict` — integrate external forces (the finger's radial push + drag) and
   predict positions.
2. `buildGrid` — insert predicted positions into a spatial hash grid (atomic
   counters) for fast neighbour search.
3. `computeDensity` — poly6 density estimate over neighbours and the PBF
   density-constraint scalar λ (lambda).
4. `solve` — iterative position correction from neighbour λ values, with a
   tensile-instability (s_corr) term. Run for several solver iterations.
5. `finalize` — soft round pond boundary, derive velocity from the position
   change, light XSPH damping, and **accumulate motion statistics on the GPU**
   (average speed, peak speed, pooled density under the finger, splash flag)
   using atomics. A tiny 8-word stats buffer is copied back to the CPU each
   frame to drive the audio.

The simulated positions are rendered as warm additive glowing metaballs on a 2D
overlay (sunlit amber glints on teal-green water).

### Named references

- **Macklin, M. & Müller, M. — "Position Based Fluids," ACM SIGGRAPH 2013.**
  The density-constraint PBF solver this prototype implements.
- **arXiv:2606.21753 — "Scene-Level Heterogeneous Physics Simulation"
  (June 23 2026)**, the 2026 GPU-physical-simulation frontier this work nods to.

## Controls

- **▶ Play** — one big button (≥72px). Tapping it pre-initialises audio on the
  gesture (required by iOS) and boots the simulation.
- **Drag a finger / pointer across the water** — stir, push, splash. Every
  interaction makes music. Touch targets are large and no reading is required.
- Let go and wait: after ~2s of no touch a gentle **auto-demo** ghost finger
  stirs the pond on its own, so an unattended glance both **sees** the water
  move and **hears** the music within about a second.

## Kids-safe audio

Master chain: `masterGain ≈ 0.26 → lowpass ≈ 6.5 kHz → DynamicsCompressor
(threshold −10, ratio 20:1)`. All attacks are ≥30ms, finger velocity is clamped,
and there are no harsh or sudden transients. The pad never stops, so the pond is
never silent.

## Graceful degradation

1. **WebGPU available** → real PBF compute fluid (the intended experience).
2. **No `navigator.gpu`** → a hand-written **WebGL2** particle approximation
   (a coarse CPU SPH-lite step rendered with a hand-written GL program). It
   returns the same motion-stats shape, so **the music is driven by the water's
   motion exactly as in the WebGPU path**.
3. **No WebGL2 either** → a `text-rose-300` notice, and the **audio + auto-demo
   keep running** so the pond still sings.

On unmount everything is torn down: rAF cancelled, GPU/GL resources destroyed,
and `AudioContext.close()`.

## Files

- `page.tsx` — client page: Start gate, pointer handling, render loop,
  auto-demo, backend selection, teardown, sunlit overlay rendering.
- `fluid-gpu.ts` — WebGPU PBF compute simulation (WGSL) + GPU stats readback.
- `gl-fallback.ts` — WebGL2 / CPU SPH-lite fallback with matching stats.
- `audio.ts` — kids-safe Web Audio engine (drone pad, shimmer voice, pool
  chord, splash sparkles).

No new npm dependencies; WebGPU and WebGL are hand-written.
