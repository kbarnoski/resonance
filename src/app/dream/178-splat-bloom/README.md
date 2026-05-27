# 178-splat-bloom — Splat Bloom

**For**: audio-visual experiment (all audiences)  
**Cycle**: 209 (adult build)  
**Route**: `/dream/178-splat-bloom`  
**Status**: `demoable`

## What it is

500 oriented luminous ellipses arranged in a Gaussian cloud around the canvas
centre (σ = 22% of the smaller canvas dimension). Each ellipse is elongated
(minor:major axis ratio 1:3–1:8), randomly rotated, and rendered with
`globalCompositeOperation = "screen"` so overlapping splats add light rather
than occluding each other — the dense centre blooms to near-white while sparse
edges stay richly coloured.

## Audio mapping

| Signal | Effect |
|---|---|
| **Bass** | The 100 nearest splats to centre scale outward (1 + bass × 0.6) and slightly fade; the cloud "pulses" on each bass hit |
| **Treble** | All splats rotate at `treble × 0.008 rad/frame`; high treble makes the whole field slowly swirl |
| **Spectral centroid** | Global hue target shifts from violet (265°, centroid ≈ 500 Hz) to amber (35°, centroid ≈ 2 kHz); each splat's hue converges toward target at 1°/frame via shortest-arc interpolation |
| **Onset** | 50 randomly-chosen splats receive a velocity impulse (40–100 px); spring constant k = 0.015 returns them to rest over ~2 s |

## Why this visual language

`3-fluid` and `15-webgpu-fluid` are continuous density fields. `16-particle-life-gpu`
is discrete physics-interacting particles. Splat Bloom is a **texture field** — a
middle ground: each primitive has its own orientation and elongation, but they're
distributed statistically rather than individually simulated. Overlapping additive
ellipses create a nebula-like luminous cloud with soft edges that feels qualitatively
different from anything else in the sandbox.

The `"screen"` compositing means you never see individual splats — you see their
cumulative light. The centre (densest) is always bright regardless of audio; the
periphery only brightens when splats scatter outward on an onset.

## Technical notes

- **Spring dynamics**: Euler integration with `k = 0.015`, `damping = 0.07`.
  Natural period ≈ 0.86 s; settling within 3–4 s. Onset impulse magnitude 40–100 px.
- **Bloom push**: applied at render time only — the `isNear` flag is pre-computed at
  initialisation (based on rest positions, which don't change). No per-frame distance
  sort needed.
- **Hue convergence**: shortest-arc method via `((target − current + 540) % 360) − 180`.
  Prevents hue from taking the long way around the colour wheel.
- **Performance**: 500 `save/rotate/scale/arc/fill/restore` cycles at 60 fps ≈ 3–5 ms
  render time on a mid-range GPU. No resolution reduction needed.
- **Zero deps**, **zero API**, **zero permissions** (demo mode). Mic is optional.

## Research basis

WebSplatter (RESEARCH.md §222, Feb 2026) — Gaussian splat Canvas2D technique
as an interactive AV medium. Aligns with Karel's loves of `130-tsl-particle-compute` ❤️
(GPU-native luminous particle fields) and `153-paint-compose` ❤️ (additive blending
as a painting medium).

## Polish ideas

- Add a `sensitivity` slider for live performance (scales all audio band magnitudes)
- Spawn new splats on onset rather than scattering existing ones — "galaxy formation"
- Let Karel tune the spring constant: lower k = slower, dreamier oscillation
- WebGPU variant: compute-shader physics for 5 000+ splats
