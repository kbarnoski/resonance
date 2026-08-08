# 8392 · Longtide

**Route:** `/dream/8392-longtide`

> What if a Resonance piece were a **10-minute journey with real memory** — a
> flowing cosmic field you SEED and STEER, carried by granulated piano, that at
> minute 8 plays your own earlier gestures back to you, transformed — so minute
> 10 is unrecognisable from minute 1?

This is the **flow-field** take on the shared brief: ~22,000 points ride an
evolving curl current; the granular piano *forces* the flow; your seeds are
persistent vortices that remember a phrase and are replayed to you in the
fourth movement.

## The fusion of 130 / 243 / 227

- **130 `tsl-particle-compute`** → the particle/flow **FIELD**. Rather than a
  TSL GPU-compute pass (which needs WebGPU / WebGL2 addon plumbing), Longtide
  advects ~22k points on the CPU through an **analytic curl field** — the curl
  of a low-order sinusoidal vector potential, so it is divergence-free, cheap,
  time-evolving, and runs on any plain WebGL context.
- **243 `spectral-cloud`** → the **SPECTRAL body**. A live `AnalyserNode` FFT
  gives amplitude + spectral centroid; those drive the colour ramp
  (violet → indigo → warm amber) and the flow turbulence, and a second
  `WebGLRenderTarget` feedback pass (blend ≈ 0.9) paints the afterimage trails.
- **227 `paths-granular`** → the **GRANULAR** carrier. A procedural warm-piano
  phrase (struck partials, fast attack / long decay, light generated-convolver
  reverb) is rendered into an `AudioBuffer` and read by overlapping
  Hann-windowed grains from a moving read-head.

## The five movements

`Stillness → Bloom → Turbulence → Recollection → Dissolution`, ~2 min each
(600 s total). Each shifts flow speed, particle size, granular density/size,
grain transposition, drone level and palette temperature — slow drift, never a
loop. A live movement label + a thin progress line show where you are.

## Memory + recapitulation (the point of the piece)

A **seed** (pointer-drag, or `Space` at the reticle) does three things:

1. plants a **persistent vortex** that permanently bends the local curl flow,
2. captures the current granular **read-head window** as a "phrase",
3. is stored in a **memory ring buffer** as `{x,y,z, t, intensity, grainWindow,
   pitch}`.

- **Short-term tier:** on every plant the phrase is echoed twice locally with
  decaying gain — a soft canon.
- **Long-term tier:** the **Recollection** movement (movement 4) snapshots the
  seeds you planted earlier and replays them **in order**, each one re-lighting
  its old vortex (warm) while its captured phrase re-sounds **time-stretched and
  transposed up a perfect fifth** (`playbackRate × 1.5`). You watch and hear
  your own past return.

## Seeded auto-demo

A deterministic **virtual traveller** (`mulberry32(0x8392)`) front-loads a
cluster of seeds in the first ~9 s (so Recollection always has material), then
keeps steering and occasionally seeding through the early movements. The whole
arc self-plays within ~2 s of load. The instant a real human acts, the
traveller retires forever.

## Input

- **Pointer-drag** — plant a seed on press, steer the current while dragging.
- `Space` — plant at the centre reticle · `1`–`5` — jump to a movement ·
  `R` — reset memory + clock.
- Touch works (pointer events). **Drop** a `.wav`/`.mp3`/`.m4a` to feed your own
  piano as the granular source (decoded locally; no network).

## Safety & degradation

- **SafeFlicker** (`maxHz 3, defaultHz 0.4, floor 0.62`) — slow luminance drift
  only, never a strobe.
- **Reduced-motion** — calmer flow, slower camera, gentler feedback.
- **No WebGL** — a `text-destructive` notice appears but the audio journey keeps
  playing.
- **Full teardown** on unmount: rAF cancelled, `AudioContext.close()`, renderer
  + all geometries / materials / render-targets disposed, listeners removed.

## References

- **Refik Anadol, *Latent City* (2026)** — memory-as-material rendered as a
  multi-chapter, evolving canvas; the piece treats a person's own past input as
  the raw material re-synthesised later.
- **La Monte Young** — long-duration, sustained-tone listening; the just-
  intonation drone bed and the 10-minute non-looping arc are in this lineage.

## Files

- `page.tsx` — orchestration, master clock, input, movement + recollection
  sequencing, UI chrome, teardown.
- `sim.ts` — `LongtideSim`: curl-flow advection, vortices, feedback trails,
  drift camera, point shaders.
- `audio.ts` — `LongtideAudio`: carrier synthesis, granular engine, drone,
  analyser features, memory replay, file-drop carrier.
- `memory.ts` — `MemoryRing` + `VirtualTraveller`.
- `util.ts` — PRNG, math helpers, movement timing.
- `readme-text.ts` — the in-app design-notes modal text.
