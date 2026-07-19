# 1972 — Morphosong

**State / pole:** psilocybin morphing-fractal bloom · **INTENSE**

> **The one question:** What if you could HUM a living organism into being — where
> your pitch breeds a different psychedelic Turing-pattern morphology, and the
> pattern you SEE is exactly the shimmer you HEAR?

## The loop (and it closes)

1. **You hum.** The microphone is pitch-tracked by time-domain **autocorrelation**
   on `getFloatTimeDomainData` (more stable than FFT for a sustained hum) plus RMS
   energy. The analyser is a **dead-end** — the mic is never connected onward, so
   acoustic feedback is impossible by construction.
2. **Pitch breeds morphology.** Your pitch steers the **feed/kill** parameters of a
   real **Gray–Scott reaction–diffusion** simulation running in a **WGSL compute
   shader**: two ping-ponged storage buffers of `vec2<f32>` = `[U,V]`
   concentrations, a 9-point Laplacian, eight sub-steps per frame. Low hums grow
   mazes/stripes; higher ones bloom honeycomb → coral worms → dividing spots. RMS
   drives growth rate and bloom brightness.
3. **You see form constants.** A render pass warps the field through a **log-polar /
   cortical map**, so the flat petri pattern reads as tunnels, spirals and
   honeycomb — the Klüver form constants — in a warm amber→magenta→violet
   psilocybin palette (not a violet-on-black petri dish).
4. **It re-voices itself.** A compute **reduction** reads the field's spatial
   statistics (mean V, variance/"spottiness", gradient/edge-density) back to the
   CPU every few frames. Those scalars set the amplitudes of a bank of
   **inharmonic partials** over a low root. **What swells on screen swells in your
   ears.** That is the weld: **SEE ≈ HEAR.**

## Substrate

- **Primary renderer: WebGPU compute (WGSL).** Not WebGL2, not three.js, not
  Canvas2D. The Gray–Scott step, the statistics reduction, and the cortical-warp
  render are all GPU passes.
- **Graceful degradation:** if `navigator.gpu` is missing (e.g. the headless
  06:30 review container), the piece falls back to a small **Canvas2D**
  reaction–diffusion so it is never blank — and the audio stays coupled to the
  (CPU-computed) field statistics.
- **Never blank/silent headless:** with no mic grant it runs a **deterministic
  seeded carrier** — pitch and energy as pure functions of an integer frame
  counter. No `Math.random`, `Date.now`, or `new Date()` anywhere in the
  animation/audio state path; determinism comes from a fixed-seed `mulberry32`.

## References (real)

- **Alan Turing, "The Chemical Basis of Morphogenesis" (1952)** — reaction–diffusion
  as the origin of biological pattern.
- **Gray & Scott** — the autocatalytic `U + 2V → 3V` system whose feed/kill plane
  holds the whole morphology zoo (spots ↔ stripes ↔ worms ↔ maze).
- **Bressloff & Cowan (2001–02)** — the retina→V1 complex-logarithm map under which
  all the Klüver form constants are one geometry seen in cortical coordinates.

The fresh axis is not any single technique but their **combination**: GPU-compute
reaction–diffusion rendered in cortical space, its morphology bred by a hum, and
its own field statistics re-voicing the drone.

## Safety

- **No strobe / flicker.** Luminance only *drifts* slowly (~0.05 Hz breathing);
  reaction–diffusion morphs are inherently slow and kept so.
- **`prefers-reduced-motion`** is honored (imported from the shared `safeFlicker`).
- The **mic analyser is a dead-end**, and the output drone never routes into it.

## Honest knocks

- The pitch→(feed,kill) path is a **curated diagonal** through Gray–Scott space,
  visiting four regimes rather than every morphology.
- Autocorrelation on a breathy hum can **octave-jump**; a gate + heavy smoothing
  hide most of it, not all.
- Reaction–diffusion has **latency**: a new pitch takes a second or two to re-grow
  the field, so the pattern (and thus the re-voicing) trails the voice by a beat —
  it is growing, not cutting.
- The statistics readback is **one frame stale** by design (async buffer map), so
  the audio coupling is ~16 ms behind the pixels. Inaudible, but real.

## Files

- `page.tsx` — chrome, orchestration, the rAF loop, WebGPU/Canvas2D selection.
- `sim.ts` — `WebGpuOrganism` (WGSL compute Gray–Scott + cortical render + stats
  reduction) and the `CanvasOrganism` fallback; pitch→morphology mapping.
- `wgsl.ts` — the three WGSL stages (update / stats / render).
- `audio.ts` — `MorphoVoice`: mic autocorrelation + RMS, the seeded carrier, and
  the inharmonic re-voicing bank.
- `webgpu.d.ts` — a minimal ambient WebGPU type surface (project ships none).
- `readme-text.ts` — the prose shown in the in-app design-notes modal.
