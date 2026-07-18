# 1922 · Chladni Plate

**What if you could STRIKE and BOW a real physical plate and watch its Chladni
nodal figures form while hearing its true inharmonic modal voice?**

A playable physical instrument. Silent and still until a human strikes or drags
it — no autoplay, no self-playing demo loop.

## Play

- **Tap / click** the plate to **strike** it. The impact point matters: a mode
  is excited in proportion to its mode shape `sin(mπx)·sin(nπy)` there, so
  striking an antinode makes that mode loud and striking a node leaves it
  silent. Both the sound and the figure depend on where you hit.
- **Press and drag** to **bow** it — a sustained, slightly rough excitation of
  the modes under the pointer, the singing voice of a bowed plate edge. (Bowing
  a sand-strewn plate is exactly how Ernst Chladni first revealed these
  figures.)

## Technique — 2D modal / physical-modeling synthesis

The plate is synthesized as a bank of ~28 damped sinusoidal modes. A stiff
plate's flexural modes scale as the **square** of a membrane's, so

```
f(m,n) ∝ (m/a)² + (n/b)²
```

directly (not its square root). This yields a genuinely **inharmonic** spectrum
— not a harmonic series, and deliberately **not** a pentatonic or tempered
scale. Each mode has a precomputed frequency, intrinsic amplitude, and decay
time. A strike adds a spatially-weighted impulse to every mode; a bow feeds a
continuous noisy excitation. Rendering uses a persistent bank of exactly one
`OscillatorNode` per mode behind per-mode `GainNode`s whose levels follow a
JS-integrated modal-amplitude state, so **polyphony is bounded** and never runs
away. Master chain: sum → trim → lowpass → `DynamicsCompressor` → output. The
`AudioContext` is created and resumed on the first strike gesture.

## Visual — WebGL2 fragment shader

A full-screen quad sums the active modes into the standing-wave field
`u(x,y) = Σ Aₖ·sin(mπx)·sin(nπy)` and renders sand accumulating where `|u| ≈ 0`
(nodal lines → bright sand) while antinodes darken to bare oxidized metal. The
figure blooms on strike and morphs as modal energies decay at different rates.
A brief expanding ring marks the strike point. If WebGL2 is unavailable, an
on-brand notice is shown instead of a broken canvas.

Palette: graphite `#14181c`, sand `#e8d5a8`, brass `#c9962f`, hot strike
`#ffe6a0` (warm, non-violet — art layer only).

## References

- **Ernst Chladni**, plate figures (c. 1787) — the visual and physical
  antecedent.
- **"Differentiable Modal Synthesis for Physical Modeling of Planar String
  Sound and Motion Simulation"**, arXiv:2407.05516 —
  <https://arxiv.org/abs/2407.05516> — the 2D modal-synthesis reference for the
  frequency and mode-shape formulation.
