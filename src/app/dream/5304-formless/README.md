# Formless — the geometry of boundless awareness

A slow, hands-free (~2.7 min one-way, then a gentle return/loop) flight through
the **actual triangulated geometry** of the formless (arūpa) jhāna meditative
states: a real, everywhere-connected triply-periodic minimal-surface mesh — a
soap-film manifold — whose form *enacts* the meditative progression.

Route: `/dream/5304-formless`.

## The question it answers

What if you could fly through the real minimal-surface geometry of the formless
jhānas — a boundless manifold whose shape traces the arc from the sphere of
infinite space → infinite consciousness → nothingness?

## The concept

Grounded in 2026 neuroscience of advanced concentrative absorption meditation
(jhāna / ACAM-J): the later "formless" jhānas are marked by expansive,
*boundless* awareness in which the brain reorganizes from a **segregated** toward
a **globally-integrated** state, while sensory content and self-referential
thought fade. A **triply-periodic minimal surface (TPMS)** is the geometric
embodiment of that boundlessness: no boundary, no centre, everywhere
self-similar and connected.

An auto-advancing absorption parameter `a` (0→1, ping-ponged) drives four
overlapping, continuously-blended stages:

1. **Infinite space** — the lattice frequency `k` slowly *dilates* (cells grow
   larger) so the space reads as opening toward boundlessness.
2. **Infinite consciousness** — the surface morphs continuously between
   **gyroid ⇄ Schwarz-P ⇄ Schwarz-D** so the structure feels alive and
   self-transforming.
3. **Nothingness** — the isosurface level `c` drifts upward so the walls thin,
   dissolve and open; the space empties.
4. **Gentle return / loop.**

Correspondingly the audio moves from **segregated** partials (detuned, stereo
spread) toward a single **globally-integrated** tone as `a → 1` — sonifying the
segregated→integrated brain finding.

## The technique — marching-cubes real mesh

The implicit TPMS field is sampled on a 40³ grid and polygonized with
**marching cubes** (`three/examples/jsm/objects/MarchingCubes`) into a real
`THREE.BufferGeometry` you fly through — giving true depth, lighting and fog.

- **Fields** (blended by morph `m`, evaluated in absolute world coordinates so
  the lattice tiles infinitely):
  - gyroid `sin x·cos y + sin y·cos z + sin z·cos x`
  - Schwarz-P `cos x + cos y + cos z`
  - Schwarz-D `sin x·sin y·sin z + sin x·cos y·cos z + cos x·sin y·cos z + cos x·cos y·sin z`
  - iso level `c` (absorption-driven).
- The field is filled with **separable per-axis sin/cos tables**, so a full grid
  costs a few hundred trig calls rather than tens of thousands.
- **Infinite flight:** the mesh box is recentred on the camera and rebuilt on a
  throttled budget (every ~14 frames); the camera interpolates continuously
  between rebuilds, so motion stays smooth and the lattice never ends. `THREE.Fog`
  hides the box edge and gives the boundless fade.
- Translucent/emissive violet `MeshStandardMaterial` (double-sided film) on a
  near-black background, plus `UnrealBloomPass` for the luminous soap-film glow.
- Pointer-drag steers yaw/pitch; on release the steering eases back to a
  seeded auto-wander. The absorption arc self-demos with zero input.
- Optional **"Use breath"** mic toggle (off by default): slow RMS raises the
  isolevel and opens the filter. Denied gracefully with a `text-destructive`
  notice; the flight keeps running without it.

## Audio

Web Audio only. A generative just-intoned drone: four oscillators at
`1 : 9/8 : 5/4 : 3/2` over a low root (B1 ≈ 61.7 Hz). At `a≈0` they are detuned
and stereo-spread (segregated); as `a→1` detune → 0 and pans collapse to centre
so they fuse into one integrated tone. Signal chain: voices → swept lowpass →
dry + procedural `ConvolverNode` reverb → `DynamicsCompressor` limiter → capped
master gain (~0.18). A soft bell rings on each morph crossing. Audio starts on
the first gesture (the **Begin** button).

## Determinism & safety

- All randomness is seeded with a local `mulberry32(0x5304)` PRNG; timing uses
  `performance.now()`. No `Date.now()`, `new Date()`, or `Math.random()`.
- **No strobe** — only slow luminance drift. Bloom and emissive intensity ease
  gently with absorption.
- Degrades gracefully: no WebGL → on-brand notice; mic denied → keeps running.

## References

- **arXiv:2607.23437**, *"Neural Representation of Minimal Surfaces"* (28 Jul
  2026).
- **Alan Schoen**, discoverer of the **gyroid** minimal surface (NASA, 1970);
  **Joseph Plateau**, soap-film (minimal) surfaces and Plateau's problem.
- **W. E. Lorensen & H. E. Cline**, *"Marching Cubes: A High Resolution 3D
  Surface Construction Algorithm"*, SIGGRAPH 1987. (Lookup tables via Paul
  Bourke / Cory Gene Bloyd, as used by three.js.)
- **Sacchet lab / MGH 7T-fMRI jhāna (ACAM-J) work** on formless-jhāna
  boundlessness and the segregated → globally-integrated brain shift —
  Chowdhury et al., *NeuroImage* (2024); 2026 ML-classification of jhāna states
  (arXiv).

## Files

- `page.tsx` — React client component: three.js scene, marching-cubes flight
  loop, audio wiring, camera steering, mic toggle, UI chrome.
- `field.ts` — `mulberry32` PRNG, the deterministic absorption arc (`stepArc`),
  and the blended-TPMS marching-cubes field filler (`fillField`).
- `audio.ts` — the segregated→integrated just-intoned drone engine.
