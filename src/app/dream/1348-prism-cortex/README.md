# 1348 · Prism Cortex

**Route:** `/dream/1348-prism-cortex`

> **The one question:** What if a DMT-breakthrough field were a living Gray-Scott
> reaction-diffusion chemistry running as a WebGPU *compute* shader, warped
> through the cortical form-constant map, and you **played** it on a MIDI
> keyboard?

This is the dream lab's **first WGSL compute-shader** piece. The render substrate
— WGSL compute on GPU storage textures — is the deliverable, not just the look.

---

## The WebGPU compute technique

Two chemicals, **A** and **B**, live in a pair of `rgba16float` storage textures
that are **ping-ponged** every substep:

- A **compute** shader (`STEP_WGSL`, workgroup `8×8`) runs the classic Gray-Scott
  reaction-diffusion equations with a toroidal 9-point Laplacian:

  ```
  A' = A + (Dₐ·∇²A − A·B² + f·(1−A)) · dt
  B' = B + (D_b·∇²B + A·B² − (k+f)·B) · dt
  ```

- It reads the previous state as a **sampled** `texture_2d<f32>` (via
  `textureLoad`, no filtering) and writes the next state as a **write-only**
  `texture_storage_2d<rgba16float, write>` (`textureStore`). Two alternating bind
  groups implement the ping-pong.
- Each displayed frame steps the chemistry **3–8 iterations** through
  `dispatchWorkgroups(64, 64)` — real GPU time evolution, not a texture
  animation.
- Feed/kill sit in the **worm/maze regime** (`f≈0.037`, `k≈0.060`) and are pushed
  by a slow LFO (~0.05 Hz) for a "breathing" field.
- An `INIT_WGSL` compute pass seeds the field (A=1 everywhere, a ring of B blobs)
  so structure grows even before any input.

The whole thing degrades gracefully: `createPrismRenderer` throws a typed
`WebGPUUnsupportedError` on missing `navigator.gpu` / adapter / device, which the
page catches to show a readable notice — never a blank screen.

## The log-polar / form-constant mapping

The render pass (`RENDER_WGSL`, full-screen triangle) samples the planar RD field
through the **inverse retino-cortical map**. Klüver's four form constants
(tunnels, spirals, lattices, cobwebs) fall out of the Bressloff–Cowan result that
cortical activity maps to the visual field by a complex logarithm: a screen point
at radius `r`, angle `θ` reads the chemistry at cortical coordinate
`(log r, θ)`. So:

- radial structure → **tunnels / funnels**,
- a small angular twist (`spiral` coupling) → **spirals**,
- n-fold angular symmetry (`symmetry = 6`) of the maze → **honeycomb lattices**.

On top: a thin-film **iridescent** cosine palette, **chromatic aberration** (the
warp radius is split per colour channel), an additive feedback **glow** on the B
ridges, saturation lift for the jeweled read, and a soft radial vignette for
depth.

## MIDI / QWERTY interaction

- **Web MIDI** (`navigator.requestMIDIAccess`, feature-detected and wrapped in
  try/catch — it throws when unsupported or denied). Each note-on injects a
  Gaussian **seed** of chemical B into the field, at an angle set by **pitch
  class** and a ring radius set by octave; **velocity** sets seed strength and
  radius. Held notes keep sowing; note-off releases the seed (it decays) and its
  audio partial.
- **QWERTY fallback** (always live): white keys `a s d f g h j k l`, black keys
  `w e t y u o`.
- **Idle auto-demo:** after ~4 s with no input, the field gently auto-seeds a
  C-minor-pentatonic loop so it stays alive on a phone with no keyboard.

## Sound

An additive **pad-drone** you play, built on the shared `_shared/psych` kit:
`startDroneBank` (just-intonation drone bed), a detuned three-partial voice per
held note, and `startShepard` (slow endless-glissando shimmer), all summed into a
`createVoidReverb` bus. Everything runs through a `DynamicsCompressor` limiter and
a master gain capped at **0.25** with an exponential fade-in. Audio is
**gesture-gated**: the `AudioContext` is created/resumed only on the **Begin**
click.

## Safety (photosensitive epilepsy)

- **No strobe.** Any global luminance oscillation stays ≤ 3 Hz — the only global
  modulator is the ~0.05 Hz breath LFO.
- `prefers-reduced-motion` → fewer chemistry substeps, slower warp drift, reduced
  chromatic aberration, and softened contrast.
- Master gain ≤ 0.25, exponential fade-in, hard limiter before the destination.
- Full teardown on unmount: `cancelAnimationFrame`, MIDI/keyboard/resize
  listeners removed, `AudioContext.close()`, and `device.destroy()` plus
  `.destroy()` on every texture and buffer.

## Reference

The iridescent GPU-field aesthetic follows **Marpi** (marpi.studio) and **Android
Jones** — both living artists working in luminous, jeweled generative fields.

## Files

- `page.tsx` — client component: Begin gate, MIDI/QWERTY input, render loop,
  idle auto-demo, in-page design-notes overlay, teardown.
- `webgpu.ts` — the WebGPU compute core: RD ping-pong storage textures, init/step
  compute pipelines, log-polar render pipeline, all WGSL inline.
- `audio.ts` — the additive pad-drone engine and limiter chain.
- `webgpu-types.d.ts` — folder-local `@webgpu/types` reference.
