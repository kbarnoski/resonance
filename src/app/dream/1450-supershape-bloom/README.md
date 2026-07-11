# Supershape Bloom

**What if you could reach into the equation behind natural form and play the whole
morphospace of alien organisms as an instrument — each shape ringing its own chord?**

A drug-free psychedelic instrument built on the **Superformula**. You drag across
the canvas to morph a 3D **supershape** live — radiolaria, sea-urchins, diatoms,
chrysanthemum blooms unfurling and breathing — while the audio re-tunes itself from
the shape's symmetry. It is Ernst Haeckel's *Kunstformen der Natur* made playable.

## What it is

A single self-contained WebGL2 + Web Audio prototype. A 120×120 parametric mesh
(~14.6k vertices) is recomputed in JavaScript every frame from the current parameter
set, uploaded to a dynamic VBO, and drawn as a lit two-sided shaded surface with an
overlaid additive wireframe "engraving" sheen. The sound is an additive drone whose
partial spectrum is derived from the shape's symmetry number.

## How to play

- **Drag on the canvas = the play surface.** Horizontal drag morphs the symmetry
  `m` (lobe count). Vertical drag morphs the roundness `n1/n2/n3` (drag up = pinch
  into spikes, drag down = bloom into rounded petals). The organism morphs
  continuously as you drag.
- **Two-finger drag (touch) or Shift+drag = orbit** the camera.
- **Keys 1–8** jump to preset organisms (starfish, sea urchin, chrysanthemum,
  diatom, radiolaria, bloom, prime thorn, orb). **Space** re-enters the auto-tour.
- **Idle self-demo:** untouched for ~2s, the shape auto-morphs slowly through a
  curated, deterministic tour of organisms, so it is alive on a phone glance.

## The math (the substrate — it *is* the deliverable)

**2D superformula** (radius as a function of angle θ):

```
r(θ) = ( |cos(m·θ/4) / a|^n2  +  |sin(m·θ/4) / b|^n3 ) ^ (-1/n1)
```

- `m` — **symmetry** (number of lobes / rotational symmetry).
- `n1, n2, n3` — **roundness / pinch** (low n → spiky pinched star, high n →
  rounded polygon/circle).
- `a, b` — axis scaling (kept at 1 here).

**3D supershape** = the spherical product of two independent superformulas,
`r1(θ)` over longitude θ∈[-π, π] and `r2(φ)` over latitude φ∈[-π/2, π/2]:

```
x = r1(θ)·cos θ · r2(φ)·cos φ
y = r1(θ)·sin θ · r2(φ)·cos φ
z =               r2(φ)·sin φ
```

Two parameter sets — `m1, n1a, n2a, n3a` (θ) and `m2, n1b, n2b, n3b` (φ) — give the
full zoo. `superRadius` is clamped so a near-zero `n1` cannot send a vertex to
infinity, and pole vertices (where `cos φ = 0` collapses a whole ring to a point)
get a guarded outward normal. Normals are computed each frame by finite differences
across grid neighbours.

## How the audio maps symmetry → (in)harmonic spectrum

The played axis is **(in)harmonicity**, driven by the symmetry `m` — *not* a fixed
consonant scale. An additive drone of 9 partials sits over a slow sub. For partial
`k`:

```
f_k = f0 · ( k · (1 + inharm · 0.16 · off_k) )
```

`off_k` is a fixed per-partial detune pattern from a seeded `mulberry32` PRNG.
`inharm` rises with how "irrational" the symmetry is:

- integer, low, even `m` → `inharm ≈ 0` → partials land on the harmonic series →
  the shape rings a **clean, consonant** chord.
- **fractional** `m` (mid-morph) or **prime** `m` → large `inharm` → the partials
  stretch and beat → the organism sounds **alien and unsettling on purpose**.

Morphing the shape audibly re-tunes the whole chord. `m2` shifts the fundamental,
and the roundness ("bloom") gently lifts the upper partials for an amplitude breath.
The master gain ramps from silence (target ≤ 0.22) and passes through a
`DynamicsCompressor` limiter before the destination. The AudioContext is created and
resumed only inside the Bloom button's click handler.

## Safety / reduced motion

All motion is slow and sub-Hz (gentle auto-yaw, a slow hue drift, organic morphs).
There is no strobing and no rapid luminance flipping. When
`prefers-reduced-motion` is set, the auto-tour is frozen to a still bloom, the
auto-yaw slows to a crawl, and the hue drift is minimal. Nothing is ever a blank or
silent screen once started.

## Determinism

No `Math.random()` and no `Date.now()` / `new Date()`. All randomness comes from a
seeded `mulberry32`; all time comes from accumulating `requestAnimationFrame`'s
timestamp argument. Full teardown on unmount: rAF cancelled, AudioContext ramped
down and closed, GL buffers/VAO/program deleted, listeners removed.

## References

- Johan Gielis, *A generic geometric transformation that unifies a wide range of
  natural and abstract shapes*, American Journal of Botany, 2003 — the superformula.
- Paul Bourke, *Supershapes / Superformula* pages — the 3D spherical-product
  construction used here.
- Ernst Haeckel, *Kunstformen der Natur* (1904) — the radiolaria / diatom vibe.
- *ParamExplorer* (arXiv, 2025-12) — recent framing of superformula parameter-space
  exploration as an interactive design space.

## Knobs to tune / next cycle

- **Adaptive resolution:** drop to ~80×80 on low-power devices; the JS mesh rebuild
  is the main cost.
- **Better normals:** analytic derivatives of the superformula would remove the
  finite-difference shimmer at sharp pinches.
- **Richer audio:** add a resonant formant/filter tied to `m2`, and a subtle noise
  bed for the "wet biology" texture; optionally FFT the output to drive emissive
  glow instead of the current param-derived proxy.
- **Morph inertia:** give the drag a little spring so releasing mid-morph settles
  gracefully instead of stopping dead.
- **Preset crossfade audio:** currently the retune is continuous; a short glide
  envelope on preset jumps would smooth the 1–8 key snaps.
- **Two-superformula UI:** expose θ vs φ parameter sets separately so the player can
  sculpt longitude and latitude independently.
