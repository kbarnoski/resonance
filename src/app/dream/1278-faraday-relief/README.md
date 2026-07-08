# 1278 · Faraday Relief

**Play a vibrating fluid membrane as real 3D relief.** Drive a virtual liquid
surface, view it at a low raking angle, and watch actual displaced geometry rise
into **stripes → squares → hexagons → a 12-fold quasicrystal**, catching
metallic light — each symmetry answering as a chord. This is a three.js
displacement-mapped mesh (real relief geometry seen at a grazing angle), not a
flat full-screen fragment field.

## The one question

What if the Faraday instability — the pattern a fluid forms when you shake it
vertically — were something you could *play*: drag to choose the drive, and feel
the surface lock into a symmetry that is simultaneously a shape you can rake
light across and a chord you can hear?

## The physics — parametric Faraday, as an amplitude equation

We do **not** solve Navier–Stokes. We evolve the *slow envelopes* `A_j`
(`j = 0..5`) of six standing waves that share one wavenumber `k` but sit at six
orientations `θ_j = 0°, 30°, 60°, 90°, 120°, 150°`. Each is a parametric
(Mathieu) oscillator; cubic self- and cross-saturation makes the modes **compete**
for the surface:

```
dA_j/dt = A_j·(σ_j − A_j² − c·Σ_{m≠j} A_m²) + ν·w_j       (c ≈ 1.3)
σ_j     = g · w_j ,      g = kGrow·(ε − ε_c) ,   ε_c ≈ 0.3
```

- **Drive amplitude ε gates everything.** `ε < ε_c ⇒ g < 0 ⇒` every `A_j`
  decays and the surface flattens; `ε > ε_c ⇒` the weighted modes rise and lock.
- **Drive frequency f selects both the wavenumber and the symmetry.** `f` maps
  monotonically to `k` (finer ripples as `f` climbs) and to the weight vector:

  | symmetry | weights `w_j` (orientations) |
  |---|---|
  | stripe | `[1,0,0,0,0,0]` |
  | square | `[1,0,0,1,0,0]` (0°, 90°) |
  | hexagon | `[1,0,1,0,1,0]` (0°, 60°, 120°) |
  | 12-fold quasicrystal | `[1,1,1,1,1,1]` |

- A tiny nucleation floor `ν·w_j (~2e-3)` lifts the active modes off zero. The
  cubic saturation **bounds** every amplitude by construction. Integration is
  forward Euler at `dt ≈ 0.016` (fixed sub-steps). All randomness comes from a
  seeded **mulberry32** PRNG (phases and their slow drift only — never the
  amplitudes, so the prescribed symmetry stays balanced). No top-level
  `Math.random()`.

The relief is the sum of the six plane waves:

```
h(x,y) = Σ_j A_j·cos( k·(x·cosθ_j + y·sinθ_j) + φ_j )
```

### Subharmonic response

A parametrically driven fluid responds at **half the drive frequency** — the
defining Faraday signature. So the surface *sings at f/2*, and the active
symmetry chooses the chord:

| symmetry | chord over f/2 |
|---|---|
| stripe | `1, 3/2` — a bare fifth |
| square | `1, 6/5, 3/2` — a minor triad |
| hexagon | `1, 5/4, 3/2, 9/4` — major add9 |
| quasicrystal | `1, 4/3, 16/9, 2, 8/3` — wide quartal shimmer, gently detuned |

Surface energy `E = Σ A_j²` opens a lowpass and lifts the voice level: the
timbre **brightens as the relief locks**, and thins to almost nothing below
`ε_c`. Voices plus a just-intonation drone bed run through a convolution void,
then a `DynamicsCompressor` brick-wall limiter, then a master gain (≤ 0.32, 2 s
ramp).

## The render

A subdivided `PlaneGeometry` (160×160, or 96×96 under reduced-motion) lies flat.
Every frame each vertex's height is set from `h(x,y)` and vertex normals are
recomputed, so ridges genuinely rise into 3D relief. A liquid-metal
`MeshStandardMaterial` (metalness ≈ 0.97, roughness ≈ 0.24) reflects a
procedurally-built dark **mercury/petrol studio environment** (a PMREM of a
hand-written equirect gradient with two soft light windows) plus a warm copper
key light and a cold cyan fill that drift slowly — so specular **glints slide
along the ridges as the pattern forms**. A 30° lens sits low, looking across the
surface at a grazing angle so the relief reads as depth, with a very gentle idle
sway and breathing (slow drift, never a flash).

## How it's played

- **Drag horizontally** → drive frequency `f` → symmetry + ripple scale (live
  symmetry-name readout).
- **Drag vertically** → drive amplitude `ε` (below `ε_c` the surface flattens;
  above, the relief rises and locks).
- **Tap / click** → drop a ripple (knocks every `A_j` × 0.3, so the relief
  collapses and re-forms).
- **Preset buttons** jump to the centre of each symmetry band.
- **Begin** gates the audio behind a user gesture; the relief animates before
  and after.

## Safety & robustness

No strobe or flicker — luminance changes are slow and continuous (highlights
slide, they never flash). `prefers-reduced-motion` is honored (coarser mesh,
gentler camera). If WebGL is unavailable the page shows a `text-rose-300` notice
and a shaded Canvas2D heightmap of the same simulation rather than crashing.
Audio master is capped at 0.32 behind a limiter, and all three.js geometry /
material / environment / renderer and every audio node are disposed on unmount.

## References

- Faraday, M. (1831). *On the forms and states assumed by fluids in contact with
  vibrating elastic surfaces.* Phil. Trans. R. Soc.
- Chladni, E. F. F. (1787). *Entdeckungen über die Theorie des Klanges.*
- Edwards, W. S. & Fauve, S. (1994). *Patterns and quasi-patterns in the Faraday
  experiment.* J. Fluid Mech.
- Christiansen, B., Alstrøm, P. & Levinsen, M. T. (1992). *Ordered capillary-wave
  states: quasicrystals, hexagons, and radial waves* — the 12-fold quasipattern.
- Klüver, H.; Bressloff, P. C. & Cowan, J. D. (2001) form-constant theory — the
  symmetries that emerge here **are** the visual-cortex form-constants.

## What I'd deepen next

- Derive `c` and the weights from a real Faraday dispersion relation and the
  triad-resonance angles, so the symmetry that wins is *selected* by the physics
  rather than prescribed — including the marginal regime where hexagons give way
  to the quasipattern.
- A screen-space caustic pass (refracted floor lines under the metal) for a true
  liquid-mercury read.
- Analytic per-vertex normals from the height field's gradient to drop
  `computeVertexNormals()` and push the mesh finer at 60 fps on mobile.
