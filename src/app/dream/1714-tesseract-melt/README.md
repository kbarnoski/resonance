# 1714 · Tesseract Melt

**State:** `DMT-breakthrough-hyperdimensional` · **Pole:** `intense`

## The one question

*What would DMT's "more axes than physical reality allows" feel like — a
four-dimensional polytope you steer by tilting your device, melting through
hyperspace?*

## What it is

A regular **tesseract (8-cell)** rotating through true four-dimensional space.
You steer it by **tilting your phone** (`deviceorientation`); on a laptop it
falls back to **pointer-drag**. With no input at all, a slow deterministic
**ghost auto-rotation** keeps it melting so the piece always self-demos.

- **Input → 4D rotation planes.** Tilt/drag left–right feeds the **XW** rotation
  rate; tilt/drag forward–back feeds the **YW** rate. Those are two of the three
  *hyperplanes* — rotations involving the 4th axis `w`, which have no
  3-dimensional counterpart. Steering them is what makes the object read as
  genuinely hyperdimensional rather than a spinning 3D cube.
- **Visual.** Raw **WebGL2** (no three.js / webgpu / npm 3D libs). The 16
  vertices are rotated in 4D, projected 4D→3D→2D by two perspective divides, and
  the 32 edges are drawn in a fragment shader as an additive glow with
  **thin-film iridescence**, **chromatic aberration**, and an **N-fold
  kaleidoscope** bloom. Jeweled, ultra-saturated — the palette lives inside the
  shader.
- **Audio.** An **inharmonic partial bank** (9 stretched, seed-jittered sine
  partials on a low root) whose detune and per-partial gain **track the summed
  w-rotation angle** — rotating through W audibly re-tunes the timbre. It beats
  and shimmers rather than resolving to a clean chord. Chain ends in a
  `DynamicsCompressor` → master gain ~0.12 → the shared **void reverb**.

## Technique — the 4D math

- **Geometry.** Vertices = every `(±1, ±1, ±1, ±1)` (16 of them). Two vertices
  share an edge iff they differ in exactly one coordinate → 32 edges.
- **Rotation.** Six independent planes `xy, xz, xw, yz, yw, zw`, each a standard
  2D rotation applied to its coordinate pair. The three w-planes are animated
  and steerable; the pure-3D planes rotate slowly for framing.
- **Projection.** 4D→3D by perspective divide `k4 = 1/(distW − w)`, then 3D→2D
  by `k3 = 1/(distZ − z)`. The rotated `w` coordinate also drives each edge's
  iridescent hue (hyper-depth → color), and the near/far `z` drives brightness.

## Named references

- **H.S.M. Coxeter, *Regular Polytopes*** — the tesseract / 8-cell and 24-cell,
  and the projection lineage.
- **Heinrich Klüver's form constants** — the lattice/tunnel/spiral geometries
  reported under altered states, evoked here via the kaleidoscopic cage.
- **DMT phenomenology reports** — the recurring "more axes / more dimensions
  than physical reality allows" and hyperdimensional-geometry descriptions.
- **Thin-film iridescence** — the physical origin of the jeweled, angle-shifting
  spectral color used for the edges.

This is a **drug-free evocation of phenomenology**. No neural or pharmacological
effect is claimed.

## Relationship to prior lab 4D pieces

Prior 4D pieces exist (1042 hyperspace-bloom, 1051 hand-hyperspace, 1196). This
one is differentiated: **tilt-driven** steering of the XW/YW hyperplanes, a
jeweled **kaleidoscopic melt** aesthetic, and audio whose partials are coupled
to the **4D rotation angle** itself.

## Safety

INTENSE by **saturation, detail, and slow luminance drift** — never flicker.
There is no strobe and no fast full-screen high-contrast flashing. The only
periodic luminance change is a single soft, slow (~0.4 Hz, floor 0.78) breath
routed through the shared `createSafeFlicker` engine (hard-capped ≤3 Hz), which
honors `prefers-reduced-motion` (downgraded to a sub-perceptual drift).

## Determinism

The render/audio-state path uses only an integer frame counter plus
`Math.sin`/`Math.cos` — no `Math.random`, `Date.now`, `new Date`, or
`performance.now`. Fixed art randomness (partial ratios, IR noise) comes from a
hardcoded-seed mulberry32. `ctx.currentTime` is used only for audio scheduling.
With no interaction the ghost rotation is a pure function of the frame counter,
so the headless review sees a live, moving, sounding piece.

## Degradation

- **No `deviceorientation`** (desktop) → pointer-drag fallback + an on-screen
  note ("tilt on mobile; drag on desktop").
- **No interaction** → deterministic ghost rotation.
- **iOS permission** → the primary button calls
  `DeviceOrientationEvent.requestPermission?.()` when present.
- **No WebGL2** → a Canvas2D wireframe of the same rotating tesseract, with a
  notice; audio and the 4D melt continue.

## Honest knocks

- 32 additive edges in a 6–8 fold kaleidoscope with 3× chromatic sampling is
  pretty per-pixel; on weak GPUs the fill cost shows. DPR is capped at 1.6.
- A tesseract has fewer edges than a 24-cell, so the cage is more legible but
  less overwhelmingly dense — the intensity comes from the kaleidoscope and
  saturation rather than sheer edge count.
- Tilt steering integrates a rate, so aggressive tilting can wind up a lot of
  accumulated w-rotation; it always keeps melting but "home" is not recoverable
  without releasing back to ghost drift.
