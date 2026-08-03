# 5912 · Homecoming

A wordless, immersive, transcendent piece for Resonance's *Cosmic Homecoming*
register. You fall inward through a living nebula of light that breathes with the
music — no readout, no meter, no derivation trace, no chrome to speak of. It
plays itself: the field is already alive the instant it loads, so it reads on a
silent phone at a glance.

## The one question

*What if a Resonance session could be a cosmic homecoming — you fall inward
through a living nebula of light that breathes with the music, with no words and
no chrome?*

## How it works

- **WebGPU end to end.** A `createComputePipeline` (WGSL) advects a large
  particle buffer entirely on the GPU — an adaptive 400,000 particles on capable
  hardware, 150,000 on fallback adapters, clamped to the device's storage-buffer
  limit. The advected particles are drawn by a WebGPU **render pipeline** as
  additive soft-glow billboards (`draw(6, count)` instanced quads, additive
  `one/one` blending). No Canvas2D on the primary path.
- **Curl-noise flow field.** Each frame the compute shader samples a 3D
  value-noise vector potential ψ and takes its curl by finite differences →
  divergence-free swirling flow (after Bridson et al., "Curl-Noise for
  Procedural Fluid Flow", 2007). Added to that: a slow gravitational drift toward
  a warm central bloom, plus a galactic swirl. Particles that reach the core
  respawn on the rim → a continuous fall-in.
- **The breathing.** A ~42-second LFO modulates the field scale and the inward
  pull so the whole nebula inhales and exhales. A separate `1 - e^(-t/90)`
  deepening (with a slow living drift) raises density and brightness over two to
  three minutes, so minute three genuinely differs from second zero — evolution,
  not a loop.
- **Audio (Web Audio).** A wordless generative just-intonation drone: seven
  voices on ratios `[1/2, 1, 5/4, 3/2, 15/8, 2, 3]` above a 55 Hz root, each two
  detuned oscillators with a slow shimmer LFO, through a lowpass and a
  Schroeder-style feedback reverb (two damped combs). Brightness and level swell
  with the same breath and core glow. No beat, no melody, no note names. A single
  **Begin** gesture unlocks the AudioContext (browsers require it); the visual is
  alive before and without it.
- **Palette.** Deep violet at the rim → warm gold at the core, with a white-gold
  hot centre. Raw colours live only inside the shader art; all UI chrome uses
  semantic tokens and the violet brand accent.

## Determinism

No `Math.random`, `Date.now`, or `new Date()` anywhere. All host-side randomness
(particle seeding, oscillator detune) comes from a seeded `mulberry32` in
`rng.ts`; animation timing uses `performance.now()`. GPU-side pseudo-random
hashing in WGSL is used only for respawn scatter.

## How it degrades

1. **WebGPU available →** the full GPGPU nebula.
2. **No WebGPU →** a reduced Canvas2D nebula (`fallback.ts`, ~1,400 additive
   soft sprites spiralling inward and respawning at the rim), still paired with
   the audio drone, plus a small on-brand `text-destructive` notice.
3. **No 2D canvas either →** an on-brand `text-destructive` message; never an
   unhandled throw.

No strobe or flicker above 3 Hz — all luminance change is slow drift.

## References

- Refik Anadol — *Latent City* (BRUSK, Bruges 2026) and *Machine
  Hallucinations*: data-nebula immersion.
- R. Bridson, J. Houman, M. Nordenstam — "Curl-Noise for Procedural Fluid Flow",
  ACM SIGGRAPH 2007.

## Files

- `page.tsx` — client component: canvas, orchestration, breathing LFO, Begin
  gate, fading chrome, design-notes toggle, graceful degradation.
- `field.wgsl.ts` — WGSL compute (curl-noise advection) and render (additive
  glow billboard) shaders.
- `gpu.ts` — WebGPU device/pipeline/buffer setup, adaptive particle count,
  uniform packing, minimal mat4 camera helpers.
- `audio.ts` — Web Audio just-intonation drone + Schroeder reverb.
- `fallback.ts` — reduced Canvas2D nebula.
- `rng.ts` — `mulberry32` seeded PRNG.
- `webgpu-types.d.ts` — `@webgpu/types` reference.
