# 204 — Anemone AV

**For**: audio-visual prototype · adult · all browsers (WebGL2)  
**Cycle**: 237 · built 2026-05-29

## What it is

A bioluminescent sea anemone that lives in sound. The creature has:

- **Central stalk** — a slightly curving column, teal-glowing, swaying gently with bass
- **12 tentacles** — each a TubeGeometry along a CatmullRomCurve3 path that fans outward from
  the stalk crown, rises, then droops at the tip (sea anemone anatomy)

Every tentacle has its own wave phase (offset by `i × 0.523`, near-golden-ratio spacing) so no two
move in exact sync. The effect is an organic ripple of motion across the crown.

## Audio mapping

| Audio feature | Tentacle behavior |
|---|---|
| Sub-bass (20–60 Hz) | Slow radial sway, whole tentacle arcs outward/inward |
| Bass (60–250 Hz) | Contributes to sway amplitude + vertical nod |
| Mid (250–2 kHz) | Lateral sway (perpendicular in XZ), creates rotational shimmer |
| Treble (2–20 kHz) | Fast tip flicker — quadratic falloff so only tips tremble |
| Onsets | Radial pulse: `1 + onset × 0.22 × t` — tips jump on percussive hits |
| Spectral centroid | Hue shift: low centroid = deeper cyan, high centroid = more toward violet |

## Technical notes

**Geometry**: 12 `TubeGeometry` instances (24 tubular segments, r=0.046, 8 radial sides) + 1
stalk tube. All geometries pre-built at mount time and reused every frame. Total: ~140×12 + ~165 =
~1845 vertices.

**Shaders**: Raw GLSL `ShaderMaterial` (not TSL) — simpler and works on all WebGL2 browsers without
Three.js TSL compiler. Key pattern: `uv.y` on TubeGeometry gives position along the tube path
(0=base, 1=tip), used to scale displacement amplitude so tips move more than bases.

**Sway direction**: radial outward/inward displacement uses the vertex's own XZ position to compute
the outward unit vector: `(position.x / rLen, 0, position.z / rLen)`. Lateral sway uses the
perpendicular (-outZ, 0, outX). This means sway always points away from/toward the center axis,
regardless of tentacle angle — each of the 12 tentacles moves in its own radial direction.

**One `useFrame`**: A single `useFrame` in `AnemoneScene` updates all 12 tentacle ShaderMaterials
+ the stalk material each frame. No per-tentacle hooks, no redundant `dataRef` reads.

**Bloom**: `@react-three/postprocessing` Bloom at intensity 1.9, low luminanceThreshold 0.05.
The glowing tips at low luminance still bleed into bloom — important for bioluminescent feel.

## Color palette

- Stalk: deep teal (#0 saturation 0.90), brightening near crown
- Tentacle base: deep cyan (hue ≈ 0.53)
- Tentacle tip: violet (hue ≈ 0.76), brighter, bloom-lit
- Background: #020b12 (near-black deep ocean)

## Polish ideas for future cycles

- Tapered radius: `position *= (1.0 - vUv.y × 0.65)` to narrow toward tips
- Add 16 shorter inner tentacles at half-radius (anemone has two concentric rings)
- Mic mode: onset → random tentacle "grabs" (snaps toward camera briefly)
- Floor attachment disc at y=-1.1 (rock surface, partially translucent)
- Particle emission from tips on loud onsets (glowing spores)
