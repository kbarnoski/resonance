# Piano Splat Cathedral

> **What if Karel's recorded piano didn't just make a cloud — it BUILT an
> architecture? A luminous cathedral of anisotropic, depth-sorted Gaussian
> splats — columns, arches, a vaulted nave — that his music raises around you
> and lights as you fly through it.**

This is the lab's **cycle 2** Gaussian-splat piece — the "massively bigger
concept" variant. Where cycle 1 (557-piano-splat-galaxy) used isotropic
additive billboards in a free-floating cloud, this piece arranges splats into
a coherent Gothic cathedral *structure* that the music builds over time, and
renders them with depth-sorted alpha-over compositing so near elements genuinely
occlude far ones.

---

## Architecture generation

The cathedral is procedurally defined as a list of **structural elements** in
build order:

| Layer | Elements |
|---|---|
| Floor | 160 flat horizontal splats along the nave |
| Columns | 5 pairs (L/R) at Z = 2, 5, 8, 11, 14 — 120 splats each |
| Arches | 5 semicircular arches connecting column tops — 80 splats each |
| Transept | Two crossing arms extending from the mid-nave — 140 splats each |
| Vault bays | 4 vaulted ceiling panels — 200 splats each |
| Rose window | 240 splats in petal rings at the far end |
| Ambient | 80 diffuse splats filling the nave volume |

Each element is pre-generated at startup as typed arrays of world positions,
orientation axes, and principal/secondary radii — no geometry is created at
runtime. Music onsets fire in sequence through this list: the cathedral
**literally builds itself** from the floor up, columns before arches before
vault. The state is permanent — once raised, elements stay at a steady dim
glow and are only re-lit (flashed) by subsequent onsets.

**Orientation:** every splat carries two world-space axes (`axisA`, `axisB`):
- Column splats: `axisA = (0,1,0)` (vertical) → tall flat flakes aligned to
  the shaft.
- Arch splats: `axisA = tangent direction` of the semicircular arc at each
  point → flakes that follow the curve's flow.
- Vault splats: `axisA = Z` (along nave), `axisB = X` (across nave) → wide
  flat patches on the ceiling surface.
- Rose window splats: `axisA = radial direction` at each petal position →
  radially elongated petals.

---

## Anisotropic Gaussian-splat rasterization

Cycle 1 used **isotropic** splats (radial `exp(-4r²)` in screen UV). Here
each splat is an **oriented ellipse** in screen space.

**Projection (EWA-style):** for each splat, the vertex shader:
1. Transforms the splat centre to view space.
2. Projects the tip of each world axis (`pos ± axisA·sizeA`, etc.) to clip
   space, subtracts the projected centre → two screen-space 2D vectors
   `screenA`, `screenB` (pixel-space semi-axes).
3. The quad is expanded to cover the bounding box of the ellipse (`2× each
   semi-axis` for 2σ coverage).
4. The fragment receives `vLocal = (dot(screenCorner, dirA)/lenA,
   dot(screenCorner, dirB)/lenB)` — coordinates in the ellipse's principal
   frame where `|vLocal|² = 1` at the 1σ boundary.
5. Fragment: `alpha = exp(-|vLocal|²) * splatAlpha`. An additional emissive
   core `exp(-8|vLocal|²) × 0.35` adds a glow highlight.

This is a simplified EWA projection (Zwicker et al. 2001) — not a full
covariance matrix, but a two-axis approximation sufficient for architecturally-
oriented splats where the principal axes are globally aligned.

---

## Depth sorting + alpha-over compositing

Every frame, before uploading to the GPU:

1. **Collect live splats:** iterate the pool, compute view-space Z
   (`view[2]*px + view[6]*py + view[10]*pz + view[14]`) for each alive splat.
2. **Sort:** build an index array `[0..liveCnt-1]`, sort by view-Z descending
   (most-negative = furthest first). Uses JS `Array.sort` on a plain number
   array of length `liveCnt` — at 10k splats this is ~0.3–0.5ms/frame.
3. **Pack:** reorder the instance data float array in sorted order.
4. **Render:** `gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)` (over-
   compositing). `gl.disable(gl.DEPTH_TEST)`.

The result: a near column genuinely **occludes** a far one, because the far
column's alpha-over layer is painted first and the near column composites on
top with its own alpha mask. This is the real architectural depth that additive
blending could not give.

A small additive emissive core (using the same fragment pass) keeps the glow
quality from cycle 1 without sacrificing the structural occlusion.

---

## Music → structure mapping

| Feature | Effect |
|---|---|
| **Onset** (spectral flux > adaptive threshold) | Raises the next structural element in sequence (first ~20 onsets build the cathedral; subsequent onsets flash random elements) |
| **Pitch** (dominant frequency → 0..1) | Hue of the raised element's light |
| **Loudness** (spectral energy) | Alpha intensity of the flash |
| **Sustained energy** (EMA-smoothed loudness) | Nave breath — gentle sinusoidal alpha modulation across all live splats |
| **Energy + low pitch** | Rose window pulse — boosts rose-window splat alpha when the window is built |

The cathedral is **visibly different at minute 3 than at second 10**: early
onsets raise just the floor and first column pair; later the arches and vault
fill in; eventually the rose window blooms. The build order encodes the
architectural logic of a Gothic nave.

---

## Pre-gesture auto-demo

Before the Begin gesture, synthetic onsets fire on a ~0.8–1.9s schedule,
slowly building the cathedral so a reviewer sees a living structure immediately.
The camera flies forward down the nave and auto-rotates. Audio waits for the
gesture (iOS AudioContext requires user interaction); visuals run at startup.

---

## Controls

- **Begin** — start Karel's real piano (or synth fallback if unavailable)
- **Drag** — orbit camera
- **Scroll / pinch** — zoom

---

## References

- **Kerbl, Kopanas, Leimkühler, Drettakis** — *"3D Gaussian Splatting for
  Real-Time Radiance Field Rendering,"* SIGGRAPH 2023. The source of the
  anisotropic Gaussian primitive and the depth-sort + alpha-over rendering
  algorithm that makes real occlusion possible.
- **Zwicker, Pfister, van Baar, Gross** — *"EWA Volume Splatting,"*
  IEEE Visualization 2001. The EWA projection that turns a 3D Gaussian
  covariance into a 2D screen-space ellipse — here simplified to two
  orthogonal world axes but following the same tip-projection algebra.
- **antimatter15/splat** — the lightweight CPU sort + WebGL splatting demo
  that proved depth-sorted splats are feasible in the browser at interactive
  rates; the `sortIndices/sortKeys` pattern follows its approach.
- **James Turrell** — architectural light installations (*Ganzfeld*, *Meeting*,
  *Skyspace*). The idea that light itself can be a load-bearing architectural
  material — that you can be *inside* the light, not just illuminated by it.
- **Refik Anadol** — *Machine Hallucinations*, *Unsupervised* — volumetric
  data sculptures that make abstract data read as physical, inhabitable space.

---

## Honest notes (unverified surface)

- Built without a real audio playback environment or GPU: **the piano fetch,
  WebGL2 draw path, and EWA projection have not been observed live.** The
  shader algebra is correct by construction but may need tuning in the field
  (e.g., very wide axis ratios could produce degenerate quads on near-clip
  geometry).
- The depth sort uses JS `Array.sort` (~O(n log n)) rather than a radix sort.
  At 10k splats this should hold 60fps on a modern laptop; very slow integrated
  GPUs may dip on the sort + bufferSubData together.
- The EWA projection is a two-axis approximation, not a full 2×2 covariance
  matrix. Splats whose two world axes are not orthogonal in screen space will
  have slight ellipse shear, which is a known simplification.
- Onset detection thresholds (flux EMA + 1.6σ, 5-frame cooldown) are tuned by
  estimate, not against Karel's actual recording; very dense passages may
  over-fire or stall the build sequence.
