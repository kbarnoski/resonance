# Cave — SDF ray-marching cave interior

**Route**: `/dream/176-sdf-cave`  
**Status**: demoable  
**Cycle**: 207  
**Deps**: zero (WebGL1 + inline GLSL, no npm)

## What it does

A stone cave rendered entirely by a WebGL1 fragment shader via **signed-distance function (SDF) ray-marching**. The camera orbits slowly inside the cave; the geometry responds to audio in real time.

SDF scene: three primitive families merged with **smooth-min** blending:
- **Cave room** — inverted rounded box (you are inside it)
- **Stalactites** — 12 capsule SDFs hanging from the ceiling (4×3 grid, heights + radii randomised via `hash3`)
- **Stalagmites** — 5 capsule SDFs rising from the floor

## Audio mapping

| Signal | Effect |
|---|---|
| **Bass energy** | `smin` blend factor `k` (0.05 → 0.68) — walls melt together on heavy bass, crystallise on silence |
| **Treble energy** | value-noise surface displacement — roughens stone with high-frequency content |
| **Spectral centroid** | cave glow colour: deep violet (low centroid) → ice blue (high centroid) |
| **Onset** | brief camera shake ±0.055 / 0.032 NDC units + white pulse on surfaces |

## Render quality vs performance

Renders at ~55% of CSS resolution (capped at 1.5× DPR). CSS scales the canvas up with bilinear filtering. This keeps 60fps comfortable on mid-range GPUs while the 64-step ray march + 6-tap normal estimation runs per pixel.

## Visual paradigm

**First sandbox prototype where the viewer is _inside_ the visual space.** All 175 prior prototypes render visuals _on_ the 2D canvas plane. Cave's camera orbit puts you at azimuth `(sin θ × 2.7, -0.3, cos θ × 3.1)` looking toward origin — always inside the positive (air) region of the SDF.

## Polish ideas

- **Vorticity / turbulence**: add a second noise octave to the stalactite shapes so they sway gently with bass pressure
- **Fog density from amplitude**: thicker fog = quieter playing, clearing on loud phrases
- **Water floor**: a reflective plane SDF at y=−2.3 with Fresnel reflection of the key light
- **Multiple light colours**: second point light whose hue is driven by the spectral centroid for richer palette separation
- **Resolution toggle**: expose a `quality` slider (0.4× → 1.0× DPR) so Karel can adjust on weaker hardware

## Research basis

- MUTEK 2026 Sphaîra (§224) — architectural spatial sound art; concept of "inhabiting" a sonic space
- Revision 2026 Shader Showdown (§225) — SDF `smin` technique for organic merging
- Inigo Quilez SDF primitives (iquilezles.org) — `sdBox`, capsule, smooth-min formulas
