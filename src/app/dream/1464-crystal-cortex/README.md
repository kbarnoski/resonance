# 1464 · Crystal Cortex

**The one question:** *What if the DMT "jewelled honeycomb" visual form-constant
were a LIVING Voronoi lattice you play by dragging its cells — the honeycomb
warping into an infinite tunnel of stained-glass cells that each sing?*

Drug-free altered-states piece. Pole: **INTENSE** — dense, saturated,
overwhelming — but with **no strobe**: every luminance change is slow drift
(≤ ~0.15 Hz here, far under the 3 Hz safety ceiling).

## The altered state it evokes

The **jewelled / honeycomb lattice** is the first of Heinrich Klüver's four
"form constants" — the geometric hallucinations that recur across DMT,
psilocybin, mescaline, migraine aura, hypnagogia and stroboscopic flicker. On
DMT specifically it is often reported as a faceted, iridescent, tunnelling
honeycomb of "stained-glass" cells receding to a centre, each facet feeling
charged with its own presence. Crystal Cortex reconstructs that percept as
something you can reach into and deform with your fingers, with each cell voiced
as a continuous tone.

## The technique (the point of the piece): GPU Voronoi via Jump Flooding

The cell partition is a **real Voronoi diagram computed on the GPU with the Jump
Flooding Algorithm** (Rong & Tan, *Jump Flooding in GPU with Applications to
Voronoi Diagram and Distance Transform*, I3D 2006) — implemented in WebGL2, not
faked, not three.js, not Canvas2D.

Per frame, in `gl.ts`:

1. **Seed pass.** A 512×512 float (or 16-bit-packed) target is cleared to
   `(0,0,0,0)` = "no seed". Each of the ~12 moving seeds is drawn as a 1-pixel
   `POINT` that writes its own `(u,v)` into the texel it lands on.
2. **JFA passes.** `log2(512) = 9` full-screen ping-pong passes at step sizes
   `k = 256, 128, … 1`. Each texel examines its 8 neighbours at offset `±k` and
   adopts the **nearest** seed among them (toroidal distance, so the lattice
   tiles seamlessly). After the last pass every texel stores the coordinate of
   its nearest seed — that is the Voronoi cell ID and, via the distance to it,
   the distance field.
3. **Display pass.** The field is sampled through an **inverse log-polar warp**
   (`r = exp(u)` — the retina→V1 cortical map; Bressloff & Cowan's account of
   why the cortex turns a plane lattice into a perceived honeycomb-tunnel). Cell
   colour is `hash(seed) → iridescent hue`; the bright **stained-glass leading**
   is drawn where the nearest-seed field has an edge, detected with `fwidth()`
   of the seed coordinate (an anti-aliased proxy for "distance to the
   second-nearest seed"). A gentle, continuously drifting warp makes the cells
   recede into an infinite funnel.

**Storage & graceful degradation.** If `EXT_color_buffer_float` is present the
JFA field lives in `RGBA16F` (seed `uv` in `RG`). If not, it falls back to an
`RGBA8` target with each coordinate **packed into two 8-bit channels** (16-bit
precision), which is universally renderable. NEAREST filtering throughout — JFA
must never interpolate packed coordinates. If WebGL2 itself is missing, the UI
shows a readable `text-rose-300` notice instead of crashing.

## Voronoi → log-polar → audio mapping

The visual field coordinate is `(log r, θ)`; dragging a cell (via Pointer
Events, tracking multiple `pointerId`s so several fingers work at once) sets that
seed's field position directly, so the grabbed cell follows the finger through
the warp. When no pointer is active, the seeds wander on smooth deterministic
paths, so the piece demos itself on load.

Audio (`audio.ts`) gives **each seed one continuous voice** — a sawtooth through
a per-voice band-pass + gain:

- **Pitch** is continuous and **inharmonic** — derived directly from the seed's
  tunnel-depth (`field.x`) as a log-frequency sweep over **80–900 Hz**. It is
  never quantised to a scale.
- **Cell area** (proxied by the toroidal gap to the nearest other seed) → voice
  **amplitude**: big roomy cells sing louder and rounder.
- **Neighbour count** (Voronoi adjacency, proxied by seeds within a radius) →
  band-pass **cutoff + Q**: crowded cells are thin and bright.

A quiet 2-oscillator sub-drone sits underneath. Total oscillators = 12 voices +
2 drone = **14** (the hard cap). The `AudioContext` is created only from the
Start-button gesture; master gain **ramps 0 → 0.85 over 0.3 s** and passes
through a `DynamicsCompressor` limiter; on unmount every node is stopped and the
context is `close()`d.

## Named references

- **Heinrich Klüver**, *Mescal and Mechanisms of Hallucinations* (1966) — the
  four form constants: (1) lattices/honeycombs, (2) cobwebs, (3)
  tunnels/funnels/cones, (4) spirals.
- **Bressloff, Cowan, Golubitsky, Thomas & Wiener** (2001) — geometric visual
  hallucinations and the retino-cortical (log-polar) map of V1.
- **Rong & Tan** (2006) — the Jump Flooding Algorithm, the GPU Voronoi/distance
  transform this piece is built on.

## Known limitations

- **Cell area / neighbour count are proxies**, not exact Voronoi cell integrals
  computed from the GPU field — a nearest-neighbour gap and a radius count. They
  track the intended feel (big = loud, crowded = bright) but aren't the true
  polygon areas.
- **`fwidth`-based leading** can draw a faint extra seam at the `θ = ±π` and the
  `fract()` wrap boundaries of the toroidal field. It reads as a little extra
  leading rather than an obvious artifact.
- **Pointer picking under drift** is exact only for the current frame's warp
  parameters; because the tunnel drifts slowly, a grabbed cell can feel very
  slightly "pushed" while held. Kept subtle by keeping the drift slow.
- Seeds live on a **torus**; they wander off one edge and back on the other,
  which is intentional for an "infinite" lattice but means a cell can appear to
  teleport across a seam.

## Next-cycle deepening

- Compute **true second-nearest distance** with a second JFA channel so the
  leading width is a real edge distance, and derive **exact cell areas +
  adjacency** from a GPU histogram of the label field for the audio.
- Add **curl-noise** seed drift instead of summed sinusoids for less periodic
  idle motion.
- A **held-mandala latch**: when the dragged configuration stabilises, bloom a
  high just-intonation shimmer chord (the "more real than real" ceiling tone).
- Keyboard arrow-key nudging of a selected seed for accessibility.
