# 1530 · Hyperbolic Organ

## The one question
**What if you could _play_ a hyperbolic universe?** An M.C. Escher _Circle Limit_
tiling in the Poincaré disk that you translate and spin by pressing keys — each
hyperbolic move sounding one just-intonation interval — so the endlessly-streaming,
negatively-curved lattice becomes a musical instrument.

## Tags
- **Surface / output:** pure SVG. The tiling is real `<path>` elements created with
  `document.createElementNS`, appended once and updated imperatively every frame. No
  `<canvas>`, no WebGL, no three.js. Vector tiles under live Möbius transforms are the
  whole point.
- **Input:** keyboard-primary. Home-row and arrow keys _are_ the generators of the
  tiling's symmetry group — hyperbolic translations along the disk axes plus two spin
  keys. No pointer play at all; keyboard is the only instrument.
- **Technique:** a `{8,3}` Poincaré-disk tiling grown by a Fuchsian reflection group;
  hyperbolic isometries (Möbius transforms of the unit disk, represented as SU(1,1)
  matrices) as _playable_ transforms.
- **Palette / vibe:** jeweled iridescent violet on near-black. State: DMT-hyperbolic /
  Klüver-lattice. Pole: intense/kinetic — a geometric, kinetic form-constant, not a
  dissolution/void tunnel.

## How it works
- **Geometry.** One central regular octagon sits at the origin; its Euclidean
  circumradius comes from `cosh R = cot(π/p)·cot(π/q)` → `r = tanh(R/2)`. The tiling is
  grown breadth-first by reflecting each tile across its geodesic edges. A hyperbolic
  edge lies on a circle orthogonal to the unit circle, and reflection across it is a
  circle inversion; the edge-adjacency graph is connected, so this single move reaches
  the whole lattice. Tiles are capped (`MAX_TILES`) and pruned near the rim.
- **Playing.** The "camera" is a Möbius isometry `V ∈ SU(1,1)`. Each frame we compose
  `V` with a small translation + rotation built from a decaying velocity, then
  re-normalise back onto SU(1,1). Every tile vertex is pushed through `V`; each curved
  edge is drawn as a short polyline sampled along its geodesic arc.
- **Sound.** Pressing (or holding) a movement key walks a **just-intonation pitch
  lattice**: the running ratio is multiplied by that key's interval (3:2, 4:3, 5:4, 6:5,
  9:8, 5:3), folded back into one octave. Each step retunes a quiet drone bed and strikes
  one inharmonic FM bell. This is the Tonnetz-like lattice made literal — moving through
  hyperbolic space _is_ moving through a lattice of pure ratios.
- **Never blank, never silent.** Before you act, the disk drifts on a slow auto-pan
  (silent, since audio needs a gesture). Press **Play** to unlock the `AudioContext`; a
  drone bed then hums underneath and the keys come alive.

### Controls
- `W A S D` / arrows — translate the lattice (up/left/down/right)
- `Q` / `E` — spin the disk (major sixth / whole tone)
- Hold a key to stream the lattice outward, one interval per step.

## Safety, audio, determinism
- Master gain `0.18` through a `DynamicsCompressor` before `destination`; bell polyphony
  capped at 12 voices (under the 14 ceiling), oldest culled first.
- `AudioContext` is created only inside the Play gesture, and fully torn down on unmount
  (bells + drone stopped, context `close()`d, RAF cancelled, listeners removed, paths
  removed).
- No strobe: luminance is a slow drift plus a soft per-note swell that decays — no
  flashing above ~3 Hz. `prefers-reduced-motion` slows the drift, the input accel and the
  pulse.
- Deterministic: no `Math.random`, no `Date`/`Date.now`. Time is `performance.now()`.

## Named references
- **M.C. Escher, _Circle Limit III_ (1959)** — the woodcut whose `{8,3}`-family fish
  tiling this piece structurally echoes.
- **The Poincaré disk model** of the hyperbolic plane; geodesics as circular arcs
  orthogonal to the boundary.
- **H.S.M. Coxeter** — the reflection-group / `{p,q}` combinatorics behind the tiling
  (and Escher's mathematical correspondent).
- **Fuchsian / Möbius groups** — the discrete isometry group generated here, and the
  SU(1,1) camera used to "play" it.
- **Heinrich Klüver**'s form-constants / lattice-tunnel imagery — the phenomenological
  target.

### Lineage / honesty note
The lab already contains **`1044-hyperbolic-bloom`**, which renders the _same_ Poincaré
tiling but as a **watched WebGL2 fragment shader driven by mic FFT**. This piece is the
deliberate inversion of that one: **SVG vector tiles**, **keyboard-played**, an
**instrument** rather than a spectacle. The hyperbolic-tiling technique is not new here —
credit `1044` (and QRI's _Hyperbolic Geometry of the DMT Experience_ lineage it cites).

### Honest knocks
- The `{8,3}` label is honest, but Escher's _Circle Limit III_ is a colored, decorated
  pattern with an extra twist symmetry — this is the plain regular tiling that underlies
  that family, not a fish reproduction.
- Edges are sampled polylines (5 points/edge), not exact SVG arcs, so at extreme zoom the
  curvature is faceted rather than perfectly smooth.
- Tiles are BFS-capped, so the "endless" lattice is a generous finite patch that simply
  streams new cells in from the rim as you move — not a truly infinite regeneration.
- Holding a key both glides the view and re-rings on a fixed throttle; mashing keys very
  fast could stack several bells, though the voice cap and compressor keep it tame.
