# 1758 · Boundless Wave

A boundless, edge-dissolving standing-wave field you shape with your breath —
the mature GPU wave-equation solver pointed at the opposite of realism.

## The one question

**What if the mature GPU wave-equation solver — the thing every WebGPU
water/cloth demo uses for REALISM — were pointed at its opposite: a boundless,
edge-dissolving standing-wave field with no object, no centre, no scale, that you
shape only with your BREATH?** The formless-jhāna "sphere of boundless space"
(_ākāsānañcāyatana_), drug-free, made audible.

Water demos use this exact PDE to sell a _surface_: an object, a scale, an edge
you can read. This piece keeps the physics and removes all of that. There is no
thing on screen — only one continuous medium, folded back on itself by its own
reflecting boundary into a shimmering Chladni interference that fills and thins
with the loudness of your breath.

## How to use it

1. Press **Begin** (browsers block autoplay, so sound + mic start on this click).
2. Breathe slowly, long and full, toward the microphone. Louder, steadier breath
   fills the field toward a shimmering standing-wave equilibrium; silence lets it
   decay toward a faint breathing ground — never fully flat.
3. With no microphone (or a denied one), a deterministic **ghost breath** (~0.08
   Hz) shapes the field on its own, so the piece is always alive and audible —
   including in a headless review with no display and no speakers.
4. "Read the design notes" (top-right) opens the full prose.

Dark filaments are the **nodal lines** (|u| ≈ 0) — the Chladni figure. The violet
pad brightens and swells as the field's energy fills.

## The technique

- **PDE.** A WGSL **compute** shader integrates the discretized 2D wave equation
  `u_next = 2·u − u_prev + c²·∇²u` over a **512×512** grid of f32 amplitudes,
  ping-ponging three GPU storage buffers (`u_prev`, `u_curr` → `u_next`) every
  frame. The Laplacian is a 5-point stencil. Light damping (`×0.9985`) bleeds
  energy so the field settles to a calm equilibrium instead of running away.
- **Reflective (Neumann) edges.** Neighbour indices are clamped to the grid, so
  the outward normal derivative is zero and every ripple folds back — this
  interference is what makes the standing-wave / Chladni pattern form.
- **Stability.** `c² = 0.24`, a hardcoded constant giving a Courant number well
  under the 2D stability wall of 0.5. It is never derived from a wall clock.
- **Breath excitation.** A smoothed low-band mic RMS envelope becomes the drive
  amplitude of a slow, wide, low-amplitude **radial Gaussian** excitation
  injected each frame at a handful of fixed, off-centre sites (a separate compute
  pass). The drive is signed by a drifting phase, so it stirs real standing waves
  rather than a DC bump.
- **Render.** A full-viewport pass samples `|u|` and maps it to a dim→bright
  **violet** ramp, brightness hard-clamped ≤ 0.7 (no white-out). The square field
  is cover-fit so it bleeds edge to edge — boundless, no visible frame.
- **Audio.** A soft pad of detuned, slightly **inharmonic** partial voices
  (ratios just off the harmonic series, so a sustained chord shimmers and beats
  instead of locking) whose brightness/level tracks a CPU-side field-energy
  proxy. Routed pad → shared synthesized void reverb → `DynamicsCompressor` →
  gain `0.15` → destination. The mic is **never** routed to output (no feedback);
  only its loudness reaches the field.

## Named references

- **_ākāsānañcāyatana_** — the formless jhāna "sphere of boundless/infinite
  space" (Buddhist Abhidhamma): no object, no centre, one continuous medium. The
  concept this piece tries to make audible.
- **Ernst Chladni (1787)** — Chladni figures / cymatics: standing waves on a
  driven plate settle into nodal-line patterns. The reflective-boundary 2D wave
  equation reproduces this literally; here it is used _anti_-realistically.
- **d'Alembert / the 2D wave equation** — the PDE being integrated.

## Determinism & safety

- No `Math.random` / `Date.now` / `performance.now` in the state/audio/visual
  update path. The only randomness is a fixed-seed `mulberry32`, used once to lay
  out the drive sites (and, in the shared reverb, its impulse response). All
  timing comes from an integer frame counter; `ctx.currentTime` is used only for
  Web Audio ramps.
- Brightness clamped ≤ 0.7; only a slow ~0.06 Hz luminance drift (no strobe,
  well below the photosensitive danger band). `prefers-reduced-motion` slows the
  stir and flattens the drift.
- Graceful degrade: no WebGPU → clean on-brand notice + audio still plays + a DOM
  glow breathes on the same signal; no mic → the ghost breath keeps it alive.

## Known limitations

- WebGPU only (Chrome/Edge, or Safari 18+). The wave field is a GPU compute
  shader with no CPU fallback for the visuals — the degrade path is the notice +
  audio bed + breathing DOM glow.
- The field-energy that drives the audio is a lightweight CPU-side scalar proxy,
  not a GPU read-back of the actual grid — chosen to avoid per-frame async
  read-back stalls while staying fully deterministic. It tracks the drive, not
  the exact `∑|u|²`.
- Antinode brightness saturates (then clamps) under sustained loud breath; the
  Chladni figure reads through the dark nodal lines rather than through antinode
  gradients.
- The GPU/audio paths could not be exercised on real hardware in this build
  environment (no GPU / no audio device); the shader math, buffer layouts, and
  teardown were verified by inspection.
```
