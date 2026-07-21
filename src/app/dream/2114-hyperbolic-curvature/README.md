# 2114 · Hyperbolic Curvature

**STATE:** DMT-breakthrough / hyperbolic-curvature · **POLE:** intense

## The one question

What if a DMT breakthrough weren't "more shapes" but a change in the
**curvature of space itself** — and you could turn that dial?

The master control is a single scalar **κ**. At κ=0 the raymarched field is a
calm, open, near-Euclidean tiling. As κ rises, space bends toward a
hyperbolic ({7,3}-style Poincaré-disk) tiling that **proliferates and folds** —
jeweled, iridescent, "more axes than reality allows." The scene _builds up_
structure; it never dissolves or drifts away.

## How to play

- Press **Begin** to unlock audio (required by the browser autoplay policy).
- Play the **home row** — `A S D F G H J K L ;` — ten stacked degrees of a
  **just major-pentatonic** scale. Each key does two things at once:
  1. **strikes** a struck/plucked FM voice, and
  2. **nudges the curvature/rotation** — a strike blooms κ upward for a moment
     and rotates the field, so playing literally bends the space.
- Drag the **Curvature κ** slider to set the base bend (this is chrome, not the
  play gesture).
- **Autopilot** runs a seeded, deterministic gentle auto-play (notes + a slow κ
  sweep) so the piece animates and sounds with no key press — good for a
  headless demo. Re-engaging it reseeds to the same reproducible sequence.
- **Connect MIDI** (optional) routes a hardware keyboard in; note-on both plays
  the note and bends space. If Web MIDI is absent, the computer keyboard still
  works fully.

## Technique

- **Output:** WebGL2 fragment-shader **raymarch** on a full-screen triangle
  (no three.js / Canvas2D / SVG).
- **Curvature dial:** a folded distance estimator (Mandelbox-family KIFS). As κ
  rises, the affine `SCALE` interpolates from positive/open (Euclidean-ish
  repeating cells) toward negative with a tighter sphere-fold inversion radius,
  which crowds and folds space inward toward a Poincaré-disk-like boundary —
  the hyperbolic proliferation. An **N-fold kaleidoscope** whose symmetry count
  grows with κ adds the extra axes.
  - This deliberately **does not** use an inverse log-polar / `exp()`
    form-constant warp (banned this cycle). The saddle/Poincaré-style folded
    SDF is the sanctioned target.
- **Shading:** thin-film **iridescence** — spectral interference phased by view
  angle and surface thickness, biased toward a neon-jeweled electric
  blue/green/magenta gamut — plus a volumetric proliferation glow that
  brightens as κ and strike-energy rise.
- **Sound:** 2-operator **FM synthesis** (carrier + integer-ratio harmonic
  modulator, decaying modulation index → jeweled mallet/pluck). Pitches come
  from a **just major-pentatonic** scale (`1, 9/8, 5/4, 3/2, 5/3` over stacked
  octaves). A gentle feedback-delay shimmer + soft-clip limiter finish the bus.
  - The banned inharmonic "Chladni glass-plate" ratio set
    (`1 : 2.76 : 5.40 : 8.93`) is **not** used.

## Safety

Luminance change is a gentle drift only. The optional breathing uses the shared
`SafeFlicker` engine clamped to **≤3 Hz** (running at ~0.2 Hz with a high floor),
and all camera/curvature motion is slow and continuous — **no strobe**. This is
a photosensitive-epilepsy safety rule and is absolute.

## Deterministic autopilot

The autopilot uses a seeded **mulberry32** PRNG for all note/velocity choices and
an **accumulated frame clock** for scheduling. It never calls `Math.random()`,
`Date.now()`, or `performance.now()` for state that must be reproducible. (The
render loop does read `requestAnimationFrame` timestamps, but only for pure
visual animation and frame-rate-independent smoothing.)

## References

- Andrés Gómez Emilsson / QRI — _The Hyperbolic Geometry of DMT Experiences_:
  https://qri.org/blog/hyperbolic-geometry-dmt
- The DMTLand atlas: https://dmtland.com/

## Honest caveats (not yet verified)

- **Not run in a real browser.** `npx tsc --noEmit` and `eslint` pass clean for
  this folder, but the GLSL has **not** been GPU-compiled here (no headless GL
  available in this environment). The shader was reviewed for GLSL ES 3.00
  correctness (e.g. `inout` params never take swizzles), but a live compile
  check on target hardware is still pending.
- **Performance unmeasured.** The raymarch runs up to 96 steps with an
  8-iteration folded DE plus a 6-tap normal per pixel; this should be fine on
  modern desktop GPUs but may need step/iteration tuning on weaker/mobile GPUs.
  Pixel ratio is capped at 2 to help.
- **Audio voice-stealing** is not implemented; very dense chording spawns many
  short-lived oscillator voices (each self-stops at ~2 s). The soft limiter
  guards level, but extreme mashing could get busy.
- MIDI plays equal-tempered note frequencies directly (what you play), while the
  computer keyboard uses the just-pentatonic mapping — a deliberate difference.
