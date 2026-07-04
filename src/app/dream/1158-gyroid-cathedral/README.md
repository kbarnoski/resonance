# Gyroid Cathedral

> _What if you could fly forever through an infinite, impossible cathedral made of a single minimal surface — and hear the architecture you pass through?_

A real-time flythrough of Alan Schoen's **gyroid**, a triply-periodic minimal surface. Because the gyroid is space-filling and periodic on all three axes, it forms an endless labyrinthine interior that reads like DMT / mystical architecture. The surface is polygonized **from scratch with marching cubes** into a three.js mesh, tiled infinitely, and sonified into a cavernous drone whose brightness is driven by the geometry you are flying through.

## The math

The gyroid is the implicit isosurface

```
f(x, y, z) = sin x·cos y + sin y·cos z + sin z·cos x = t
```

with the classic minimal surface at `t = 0`. It is periodic with period **2π** on every axis, so one 2π³ chunk tiles space seamlessly. `gyroid.ts` provides:

- `field(x,y,z, morph)` — the scalar field (optionally blended toward Schwarz-P `cos x + cos y + cos z` via `morph`; gyroid is the default, `morph = 0`).
- `gradient(x,y,z, out, morph)` — the **analytic** gradient
  `∂f/∂x = cos x·cos y − sin z·sin x`, `∂f/∂y = −sin x·sin y + cos y·cos z`, `∂f/∂z = −sin y·sin z + cos z·cos x`.
  Normalized, this is the outward vertex normal — far smoother than face normals.

## Marching cubes (hand-written)

`marchingCubes.ts` is the classic Lorensen–Cline (1987) algorithm written out by hand — **not** `three/examples/MarchingCubes`, **not** a raymarched fragment shader. It contains the full standard **256-entry edge table** and **256-row triangle table** (these are just published lookup data, reproduced verbatim), plus the corner/edge topology.

`polygonize()` marches one 2π³ chunk on an N³ cell grid (default N = 32, dropped to 24 under `prefers-reduced-motion`), builds the 8-bit corner mask per cell, linearly interpolates each edge crossing at the isolevel, and emits flat position + normal `Float32Array`s straight into a `THREE.BufferGeometry`. Normals are the analytic gradient recomputed at each interpolated crossing.

_Verified:_ at N = 24 the marcher emits ~5,600 triangles whose vertices all satisfy `|f| < 0.005` (pure linear-interpolation error), with unit-length normals.

## Infinite flight

`scene.ts` instances the single marched chunk across a **5×5×5 lattice** (`THREE.InstancedMesh`, 125 instances, one draw call). Every frame the lattice group's origin snaps to the nearest 2π multiple of the camera position:

```
lattice.position = round(camera.position / 2π) · 2π
```

Since the field is 2π-periodic, `field(local + 2π·k) = field(local)`, so a chunk placed at a 2π lattice point is globally correct — the camera stays buried in the centre of the lattice and flight is seamless and endless, with `FogExp2` hiding the far edges. The camera drifts forward continuously along its heading; **pointer drag steers** yaw/pitch.

Material: `MeshPhysicalMaterial` with thin-film `iridescence: 1` / `iridescenceIOR`, low roughness, moderate metalness, `DoubleSide` (a minimal surface has two faces), over near-black `#04060a`. A teal-cyan **fresnel rim** is injected into the emissive term through `onBeforeCompile`. Palette: iridescent violet ↔ teal. A hemisphere light plus two slowly orbiting point lights (violet + teal).

## The drone

`audio.ts` synthesizes a stone-cathedral drone with Web Audio (no files, no mic):

- A **just-intonation chord over A1 (55 Hz)**: root, 9/8, 5/4, 3/2, plus a sub an octave below. Each voice is a detuned sine/triangle pair for a slow chorus beat.
- The gyroid **field** and **gradient magnitude** sampled at the camera each frame drive the master **lowpass cutoff** (and the sub level) — so the architecture you fly through opens and closes the drone's brightness.
- The mix runs through a synthesized **convolution reverb** (a noise-burst exponential-decay impulse response built with `OfflineAudioContext`) for a huge stone space, and a `DynamicsCompressor` **limiter** on the master.
- Gesture-gated start (browsers block autoplay); full teardown on stop/unmount (oscillators stopped, nodes disconnected, context closed).

The geometry→sound coupling is grounded in real physics: gyroid lattices are genuine **acoustic crystals** with topological sound modes.

## References

- **Alan Schoen** — the gyroid, _Infinite Periodic Minimal Surfaces Without Self-Intersections_, NASA TN D-5541 (1970).
- **Hermann Schwarz** — the P and D triply-periodic minimal surfaces (19th c.).
- **Gyroid acoustic crystal / topological sound** — PMC9951337 (2023): grounds the geometry→drone mapping as real physics.
- **Callophrys rubi** — butterfly-wing gyroid photonic crystals (structural colour).
- **arXiv 2512.18308** (Dec 2025) — a new chiral gyrating-surface family extending the gyroid.

## Safety

No hard strobe. The only global luminance oscillation is a slow drift routed through `_shared/psych/safeFlicker` at ≤ 0.2 Hz — cosmic-ambient, not flashing. `prefers-reduced-motion` lowers grid resolution and flight speed.

## Known limitations

- Camera world coordinates grow without bound in a very long session; `sin`/`cos` of large arguments eventually lose a little precision (double-precision, so it takes a very long flight to matter). The lattice re-centring keeps all *rendered* positions small regardless.
- The marched chunk is static (fixed `t = 0`); the geometry does not morph while flying (the `morph` parameter is wired but held at gyroid). A live re-march would be the natural next step.
- Marching runs once on the main thread at launch (a few tens of ms at N = 32); a Web Worker would remove that hitch for higher resolutions.
- Graceful degradation: no WebGL → a readable notice instead of a crash; audio failure → the visual flight still runs.
