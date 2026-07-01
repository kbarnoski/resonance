# 1086 — Lenia Organisms

**Tags:** `state: DMT entity-encounter / self-organizing alien life · pole: intense`

## The question

> What if a screen of continuous artificial **life** — real alien organisms
> self-organizing out of a field — were an instrument you seed and that sings back
> as it lives?

You don't draw the creatures. You feed a continuous field by **tapping** it, and
you meet whatever grows.

## What it is

A **Lenia** continuous cellular automaton running as a real **WebGPU compute**
simulation, with a full CPU fallback. Lenia (Bert Wang-Chak Chan, _Lenia —
Biology of Artificial Life_, 2019) generalizes Conway's Game of Life to
continuous state, space and time.

Each cell holds a real value `A ∈ [0,1]`. Every step:

1. **Convolve** the field with a smooth ring-shaped kernel `K` (a sum of
   canonical Lenia exponential-bell shells, `K(x)=exp(4 − 4/(4x(1−x)))`,
   L1-normalized) → `U = K ∗ A`.
2. **Grow** through a smooth Gaussian mapping
   `G(u) = 2·exp(−(u−μ)²/2σ²) − 1`.
3. **Integrate**: `A ← clamp(A + dt·G(U), 0, 1)`.

Out of a seeded gaussian blob this spontaneously grows smooth, organism-like,
slowly-drifting structures. The mass-conservative extension is **Flow-Lenia**
(Plantec, Chan et al., ALIFE / MIT Press 2025, arXiv:2212.07906).

## Phenomenology

Self-organizing beings that appear, greet you and dissolve are the
DMT/entity-encounter register made literal (cf. QRI / Andrés Gómez Emilsson on
entity/organism phenomenology). Pole: **intense**.

## Interaction

- **Tap / click the field** (discrete — _not_ pointer-drag): seeds a small
  gaussian bump of living matter that the Lenia dynamics grow into a creature.
  Every tap also rings a bell.
- **Orbium / Rotor / Colony** buttons switch growth regime (kernel radius R and
  growth window μ, σ) → different creature "species".
- **Reseed field**, **Sound on/off**, **Design notes** (in-page modal).

On load it **auto-seeds 2–3 creatures**, so the piece is alive, moving and
sounding within ~2s with zero input.

## Output — compute

- **GPU path:** the field lives in two ping-pong `f32` storage buffers. A WGSL
  compute shader does the direct ring-kernel convolution + growth each frame
  (two sub-steps/frame). A render pass colours a full-screen quad: deep indigo
  void → teal → gold by local mass, with a soft inner glow. Grid 256².
- **CPU fallback:** if `navigator.gpu` is absent (or adapter/device fails), the
  **identical** model runs on a 128² grid in plain JS and draws to a 2D canvas.
- A small badge shows **● GPU** (emerald) or **● CPU fallback** (amber).

## Output — sound (Web Audio, always sounds)

Cheap global summaries are read back each frame (on GPU via a reduction pass into
a small buffer that's mapped asynchronously ~15 Hz; on CPU by direct sum) and
mapped to a **just-intonation additive/FM choir**:

| Field summary        | → Sound                                                     |
| -------------------- | ---------------------------------------------------------- |
| total mass           | drone fullness (a stacked JI chord swells, filter opens)   |
| births / growth rate | soft plucked JI bells, pitch quantized by creature height  |
| turbulence (motion)  | a shimmer band of bright partials that fades as motion ebbs |

JI scale: `1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2` over a ~98 Hz root. Everything
routes through a master `DynamicsCompressor`; bell polyphony is capped at 8 with
voice-stealing. Consonant and evolving, never a static loop.

## Verification

The Lenia model was verified by Node simulation (mirroring the exact update):
from the auto-demo seeds, at 128², after 120 steps each regime settles to a
living field — mean state ≈ 0.20–0.30 (neither decaying to 0 nor saturating to
all-1: fraction of near-1 cells stays < 0.3), max state ≈ 1.0, with ongoing
motion (Orbium ≈ 0.002 mean |ΔA| per step). Robustness was checked across single
blobs of radius 0.06–0.10: all three regimes survive.

## Honest limitations

- The **symmetric gaussian taps** this instrument uses don't reproduce the clean,
  endlessly-gliding classic **Orbium** (which needs its exact asymmetric seed
  bitmap). Instead they grow robust, churning, slowly-drifting life. The three
  regimes therefore sit _near_ — not exactly on — the razor-edge Orbium point,
  tuned a touch wider (σ ≈ 0.03–0.045) so a tap reliably grows life.
- The fallback grid is small (128²), so its creatures are chunkier and slower.
- Stats readback on the GPU path is asynchronous (~15 Hz), so audio events can lag
  the visuals by a frame or two.
- No `@webgpu/types` dependency exists in this repo, so `gpu.ts` declares the
  minimal WebGPU surface it uses locally (no `any`, no `@ts-ignore`).

## Safety

No full-frame strobe. Brightness drifts slowly; the background stays dark and
only creatures are bright. Sound has an instant on/off.

## References

- Bert Wang-Chak Chan, _Lenia — Biology of Artificial Life_ (2019).
- Plantec, Chan et al., _Flow-Lenia_ (ALIFE / MIT Press 2025, arXiv:2212.07906).
- QRI / Andrés Gómez Emilsson on DMT entity/organism phenomenology.

## Files

- `page.tsx` — client component: canvas, UI, GPU/CPU selection, auto-demo, loop.
- `lenia.ts` — model params/regimes, ring kernel, CPU update, field stats.
- `gpu.ts` — WGSL compute/render + WebGPU setup, ping-pong, async stats readback.
- `audio.ts` — the just-intonation choir engine.
