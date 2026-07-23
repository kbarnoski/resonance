# 2422-chladni

**What are the hidden shapes of a vibrating surface, and can you play them?**

A Chladni plate. A square plate is driven at a frequency and settles into a
standing wave. Sand sprinkled on top is thrown off the parts of the surface
that move and piles up on the **nodal lines** — the places that stay still —
revealing the vibration mode as a crisp geometric figure. Turn the dial (or drag
across the plate) and the resonant mode changes: the figure reorganises and the
sand re-migrates. A gentle driving tone plays at the same frequency, so you hear
the plate being driven as you watch the sand respond.

This is a physics toy/tool: an honest little instrument for _seeing_ resonance.

## The math (done for real)

The plate's standing-wave displacement over the unit square (x, y ∈ [0,1]) is
the classic Chladni figure function for integer mode numbers (n, m):

```
f(x, y) = cos(nπx)·cos(mπy) − cos(mπx)·cos(nπy)
```

The **nodal lines** — where the sand collects — are the curves where
`f(x, y) ≈ 0`. (Note `f ≡ 0` when `n = m`, so the modes always use `n ≠ m`.)

Each of ~6,500 sand grains is a particle in a `Float32Array`. Every frame it:

1. Evaluates `f` and its analytic gradient `∇f` at the grain's position.
2. Takes a **Newton step toward the level set `f = 0`**:
   `p ← p − LR·f·∇f / (|∇f|² + ε)`. This is gradient descent on `|f|`: the grain
   slides straight downhill toward the nearest nodal line.
3. Adds a **jitter proportional to `|f|`**. Grains over high-motion regions (far
   from a node) get kicked around; grains that reach a node have `|f| → 0` and
   settle. That's exactly the physical mechanism — the moving surface shakes
   loose grains toward the still lines.
4. Guards against NaN/Inf and reflects back into the unit square.

Over ~1–2 seconds the cloud snaps onto the nodal lines.

**Frequency → mode.** A small ordered table maps specific frequencies to clean,
recognisable resonances (like a real plate). Between table entries the field is
_blended_ (`f = (1−t)·f_A + t·f_B`, gradients blended the same way), so the
pattern morphs continuously as you sweep — clean figures at the table values, a
living hybrid in between.

**Rendering.** Grains deposit brightness into a `512×512` density buffer; each
frame the buffer is tone-mapped (`1 − e^(−d·exposure)`) through a
plate → violet → warm-sand colour ramp and faded slightly, leaving soft
migration trails. One `putImageData` pass per frame — no per-grain draw calls.

## How to play it

- **Drag left/right across the plate** to scrub the driving frequency.
- **Slider** for precise control; the readout shows the current `(n, m)` mode
  and flags when it's morphing between two.
- **Play the plate** starts the Web Audio driving tone (a soft sine plus a faint
  triangle partial, low master gain, soft attack). Its pitch _is_ the plate
  frequency; a shimmer swells during re-migration.
- **Idle self-demo.** On load the plate auto-sweeps deterministically through a
  handful of gorgeous modes, dwelling on each figure then morphing to the next,
  so a silent glance already shows sand forming and reforming. Any manual change
  takes over; "Resume auto-sweep" hands control back.

## Reference

- **Ernst Chladni, _Entdeckungen über die Theorie des Klanges_ (1787)** — the
  origin of Chladni figures / cymatics.
- Hans Jenny, _Cymatics_ (1967) — the later photographic study of the field.

## Design notes & honest limitations

- The figure function is the **idealised** modal shape for a square membrane,
  not a finite-element solution of a real clamped/free steel plate — real plate
  resonances warp near the edges and the true resonant frequencies aren't the
  round numbers used here. The frequency→mode table is a curated mapping chosen
  so specific dial positions land on clean, recognisable figures, not a computed
  eigenvalue spectrum.
- Grains use a Newton step on `|f|`, which is a fast, stable stand-in for real
  granular dynamics — it produces the correct nodal geometry but not true
  bouncing/collision physics. Near saddle points of `f` the `+ε` guard keeps the
  step finite.
- The audio tone and the visual share one frequency by construction; it is a
  simple driving tone, not a physical model of the plate's own radiated sound.
- All client-side, self-contained: Canvas2D + Web Audio only, no three.js, no
  WebGL, no new dependencies. AudioContext is created only after a user gesture
  and fully torn down on unmount.

## Tags

- **INPUT** — frequency dial (slider) + pointer/tap scrub across the plate.
- **OUTPUT** — Canvas2D particle field + Web Audio driving tone.
- **TECHNIQUE** — Chladni standing-wave nodal-line simulation + gradient-descent
  particle migration onto the nodes.
- **VIBE** — physics / instructional / beautiful-geometry.
