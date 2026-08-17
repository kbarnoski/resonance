# 14576-reefmind

> *"What if my whole catalog were a living chemical membrane that grows and
> dissolves its own patterns — a cosmos that arranges ITSELF, not an instrument
> I play?"*

An **autonomous cosmic-ambient** piece whose substrate is a **Gray-Scott
reaction-diffusion field** running on the GPU. A continuous, self-organizing
membrane of two competing chemicals (U, V) spots, stripes, mazes and dissolves
across the screen — Turing morphogenesis. There is no instrument to play here.
The field's own chemistry does the arranging.

## What it is

- The screen is one **raw WebGL2 ping-pong** reaction-diffusion field: a pair of
  `RGBA32F` textures hold the U/V concentrations, and an update fragment shader
  runs several Gray-Scott iterations per frame by ping-ponging between them
  through framebuffers. No Canvas2D, no three.js.
- The field is divided into a **4×4 lattice of 16 zones**, one per recording in
  Karel's real catalog (13 *Welcome Home* + 3 *Snowflake*). Each zone runs its
  own feed/kill regime, and those rates **drift slowly with time**, so every
  species-region keeps evolving between spots, stripes and mazes and never
  freezes into a dead steady state. A fresh perturbation is dropped roughly every
  seven seconds to keep it boundless.
- It is rendered as a glowing **bioluminescent teal → aqua → cyan → white**
  membrane on near-black.

## How the reaction-diffusion field conducts the mix

Every frame (throttled to every third frame) a **reduction shader** box-averages
the V field down to a tiny 64×64 texture, which is read back to the CPU with
`gl.readPixels`. For each of the 16 zones we compute:

- **bloom** — the mean V concentration in the zone. High V = a dense, coherent
  Turing pattern.
- **pan** — the V-weighted horizontal centroid of the bloom within the zone.

These drive that species' real piano loop:

```
BufferSource(loop) → Gain → BiquadFilter(lowpass) → StereoPanner → safeMaster → speakers
```

- **bloom → gain**: where a species blooms it SURGES; where the chemistry
  consumes/dissolves it, the track thins toward silence.
- **bloom → lowpass cutoff**: a coherent bloom is bright; a dissolving one goes
  dark and thin.
- **centroid → stereo pan**: the bloom's horizontal position places the voice in
  the field.

All glides use `setTargetAtTime` so the mix breathes without clicks. **Zero
oscillators, zero synthesis** — the field only sets gains, filters and pans on
Karel's real loops. Everything audible is his piano, routed through the shared
`safeMaster` ear-safety bus (nothing touches `ctx.destination` directly).

## Input

- **Primary: autonomous.** The piece conducts itself from the field's own
  reaction-diffusion dynamics. No pointer, keyboard or MIDI verb.
- **Secondary (optional): mic-perturbation.** If you enable the mic, room RMS
  seeds gentle activator ripples into the chemistry. This is **control only** —
  the mic signal is *never* routed to audio output; it only nudges the field.
  Without mic permission the piece is fully autonomous.

## Files

- `page.tsx` — React component: start gesture, the animation loop, HUD/legend,
  graceful degradation, full teardown.
- `field.ts` — the WebGL2 ping-pong Gray-Scott field: textures, framebuffers,
  step, reduction + readback, mic injection, disposal.
- `glsl.ts` — GLSL ES 3.00 sources (update / reduce / display).
- `audio.ts` — the 16-species mix engine over `REAL_TRACKS`.

## Named references

- Alan Turing, *The Chemical Basis of Morphogenesis* (1952) — the reaction-
  diffusion origin of biological pattern.
- The **Gray-Scott** reaction-diffusion model.
- Karl Sims, *Reaction-Diffusion Tutorial* — the practical GPU recipe.
- Robert Borghesi, *ASTRODITHER* (2026) — audio-reactive GPU field as substrate.

## Honest limitations

- Needs **WebGL2 + `EXT_color_buffer_float`**. Without them the piece shows an
  on-brand `text-destructive` notice instead of starting (no blank screen, no
  throw).
- 16 copies of the same 16-track catalog can crowd the low end when many zones
  bloom at once; the shared limiter tames peaks, and in practice V-consumption
  keeps only a handful of zones loud at a time, but dense passages can get busy.
- The per-frame `gl.readPixels` is a GPU→CPU stall; it is kept cheap (64×64) and
  throttled, but it is the main cost on low-end hardware.
- Feed/kill drift is gentle by design; over very long installs some zones settle
  into slow, near-static patterns between the periodic perturbations.
- Track audio loads lazily from the shared journey path; a slow network delays
  when each species' voice first wakes (the field still animates meanwhile).
