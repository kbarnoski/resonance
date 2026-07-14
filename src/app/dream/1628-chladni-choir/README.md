# 1628 · Chladni Choir

**What if you could drive a physical vibrating plate with a tone and WATCH the sand
collect on the silent nodal lines — and the pattern you see IS the chord you hear,
in both directions?**

A sand-on-steel Chladni plate you play with your finger. Drag across the plate to
sweep the driving frequency; the sand reorganizes onto the silent nodal lines of
the resonant mode, and the modes that are ringing are additively synthesized into a
chord whose interval is named on screen. Sight and sound are the same physics, run
both ways.

## How to use

- **Start** — audio needs a user gesture; press Start (or just touch the plate).
- **Drag horizontally** — sweeps the driving frequency. Left = low modes / coarse
  patterns, right = high modes / fine patterns (higher `√(m²+n²)`).
- **Drag vertically** — up = more excitation. A wider resonance band rings more
  modes at once, so the plate settles into a richer chord and a denser figure.
- **Leave it alone** — a deterministic, seeded frequency sweep keeps the plate
  singing and the sand migrating on its own (headless-review friendly). The status
  badge shows `IDLE SWEEP` vs `TOUCH`, the current dominant mode `(m,n)`, its Hz,
  and the named interval between the two loudest modes.
- Respects `prefers-reduced-motion` (the sweep and grain motion nearly freeze).

## The physics

**Idealized square-plate Chladni figure.** For a bounded square plate the classic
symmetric/antisymmetric standing-wave field is

```
f(x,y) = Σ a_k · [ cos(mπx)·cos(nπy) − cos(nπx)·cos(mπy) ]
```

with `x,y ∈ [0,1]`. **Nodal lines are where `f = 0`** — the plate is momentarily
still there, so sand driven by the antinodes settles onto them (Chladni's original
observation). Higher driving frequency selects higher `(m,n)`, giving finer figures.

**Sand migration (the money shot).** ~6500 GL-point grains each take a damped
**Newton step down the gradient toward the nearest zero** of the field:
`Δp = −relax · f · ∇f / |∇f|²` (clamped per frame so the motion is visible, not
instantaneous), plus a tangential wander along the nodal line and a tiny seeded
jitter. The value and analytic gradient `∇f` are evaluated in closed form per grain.
As the driving frequency sweeps, `f` morphs continuously and the sand visibly flows
from one figure into the next.

**Bidirectional sonification.** A Gaussian window around the target modal number
`q = √(m²+n²)` assigns a weight to every mode in the table. The full weighted bank
is an **additive synth** — one sine partial per mode at `f = 55·q` Hz (plate modal
scaling), so a clean two-mode figure sounds like a nameable interval. The ratio of
the two loudest partials is matched to the nearest just interval (unison … octave,
folded by octaves) and displayed. The same top-weighted modes drive the shader field
and the sand, so the figure on the plate and the chord in the air are one object.

**Rendering.** A WebGL2 fragment shader draws `|f|` as brightness over a
brushed-steel base (bright antinodes, dark nodes); a second additive point pass
draws the warm-white sand on top. Monochrome bone/graphite on dark steel throughout.

## Named references

- **Ernst Chladni**, *Entdeckungen über die Theorie des Klanges* (1787) — the sand
  figures on a bowed plate that started the field.
- **Kirchhoff–Love plate theory** — the thin-plate flexural model whose square-plate
  eigenfunctions the `cos·cos − cos·cos` combination idealizes.
- **arxiv 2605.09846**, *ChladniSonify: A Visual-Acoustic Mapping Method for Chladni
  Patterns in New Media Art Creation* (May 2026) — the bidirectional pattern ↔
  frequency mapping this prototype makes interactive in the browser.
- **Hans Jenny**, *Cymatics* — the modern tradition of visible sound this belongs to.

## Design notes

- **Deterministic.** No `Math.random` / `Date` in executable code. A `mulberry32`
  PRNG on a constant seed sets the initial sand scatter, per-grain jitter phases, and
  the idle-sweep LFO phase offsets; all time comes from `performance.now()` and the
  audio clock.
- **Audio safety.** Master gain 0.14 (≤ 0.15) into a `DynamicsCompressor` before
  `destination`; per-partial gains are smoothed with `setTargetAtTime`.
- **Cleanup.** On unmount it cancels the rAF, deletes buffers / VAOs / programs,
  forces `WEBGL_lose_context`, stops and disconnects all oscillators, and closes the
  `AudioContext`. Degrades to a `text-destructive` notice without WebGL2.
- **House style.** Dark theme, semantic tokens for all chrome; the sand/steel
  monochrome lives only inside the shaders.
