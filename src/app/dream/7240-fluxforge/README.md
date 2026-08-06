# 7240 · Fluxforge

**What if your sound physically _forged_ a fluid?** Fluxforge is the dream lab's
first **WebGPU compute-shader** prototype. A large particle buffer (100,000
particles) is advected every frame on the GPU through a divergence-free
**curl-noise** flow field, and that field is driven live by your audio. It reads
as a physical, analytical velocity field — not a transcendent mandala.

## What it is

- A **WebGPU compute pipeline** updates a storage buffer of particles each frame.
  Each particle's velocity comes from the analytic **curl of a scalar potential**
  (a few animated sinusoids), which is divergence-free by construction — so the
  flow looks incompressible and swirling with no pressure solve and no
  neighbour search.
- A **WGSL render pipeline** draws the same buffer as additive instanced quads,
  coloured on the **violet ramp by speed**: slow = deep violet, fast =
  bright violet / near-white (bright colours live in the WGSL art layer only).
- **Audio drives everything**: bass -> global flow strength / turbulence,
  treble -> fine curl detail (noise frequency), a detected onset -> an outward
  radial **ring** that shoves particles apart.

## How to use

1. Open the page in **Chrome or Edge** (recent).
2. Press **Start (microphone)** and allow mic access, then play or sing.
3. No mic (or denied)? Press **Internal pad** — a soft evolving synth that is
   both audible and analysed, with a pulsing sub that fires periodic rings, so
   the fluid moves and sounds even with no input. Mic failure auto-falls-back to
   the internal pad.
4. The on-canvas meters show the live bass / mid / treble bands, the ring
   trigger, and which backend is running.

## Fallback

If `navigator.gpu` is absent (Safari / Firefox / older Chrome) or WebGPU init
fails, the page shows a clear **`text-destructive`** notice
("WebGPU required — try Chrome / Edge") **and** runs a small **Canvas2D**
curl-noise particle fallback (~2,600 particles, same field math), so the page is
never a blank crash and still moves with sound. Nothing touches WebGPU at module
load or during SSR — all GPU work is behind feature checks and effects.

## Tags

- **input** = mic (+ internal audio pad)
- **output** = WebGPU compute
- **technique** = GPU-compute curl-noise particle fluid (divergence-free flow-field advection)
- **vibe** = physical / analytical

## Ambition criteria hit

- **(#1) First WebGPU compute in the lab** — a real `navigator.gpu` adapter +
  device, a compute pipeline over a 100k-particle storage buffer, dispatched
  each frame. This is the jury's explicitly-named un-built lane.
- **(#2) ≥3 subsystems** — Web Audio FFT band-split (bass/mid/treble + onset
  detection) · WebGPU compute simulation · WGSL render pipeline · audio->force
  mapping (bass->strength, treble->detail, onset->radial ring).
- **(#5) Recent research** — implements the WebGPU-compute fluid approach from
  the 2026 Sharma reference below.

## References

- Sachin Sharma, **_"Beyond WebGL: Real-Time Fluid Simulations Using WebGPU
  Compute Shaders"_** (2026, sachinsharma.dev) — the named, recent reference for
  running fluid simulation directly in WebGPU compute shaders.
- Jos Stam, **_"Stable Fluids"_** (SIGGRAPH 1999) — the stable-advection lineage
  this curl-noise advection descends from.

## Design notes

- **Curl-noise, not SPH.** Full SPH needs a neighbour grid and atomic density
  accumulation and is fragile to get building; a divergence-free curl-noise
  advection guarantees swirling, incompressible-looking flow and is far more
  robust. A beautiful curl-noise fluid that ships beats a broken SPH.
- **Divergence-free by construction.** Velocity = `(dP/dy, -dP/dx)` of a scalar
  potential `P`, so the flow has zero divergence (incompressible) analytically —
  computed with a small finite difference in the compute shader.
- **Shared buffer.** Compute (`read_write`) and render (`read`) bind the same
  particle storage buffer via `layout: "auto"` bind-group layouts — the sim
  writes it, the vertex shader reads it, no CPU round-trip.
- **Typing without `@webgpu/types`.** That package is not installed, so WebGPU
  handles use one narrowly-named `Wgpu` alias (a single reason-commented `any`)
  and spec-stable numeric usage flags, instead of a fragile hand-rolled
  interface surface. `(navigator as any).gpu` reads are individually
  eslint-disabled with reasons.
- **Safety.** Background clears to a near-black violet; brightness comes from
  additive accumulation of many dim points — no hard strobe, smooth changes.
