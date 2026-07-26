# 2768 · faraday

**The one question.** What if sound could pour into a dish of water and the
water answered back — a real Faraday-wave fluid whose emergent standing-wave
pattern re-voices the sound that shook it?

## The Faraday physics

A fluid surface under **vertical vibration** answers **subharmonically**: it
oscillates at *half* the drive frequency, and above a threshold set by viscosity
it self-organises into standing-wave cells (stripes → squares → hexagons). This
is the **Faraday instability** (Faraday, 1831).

Mode by mode, the surface height obeys the **Mathieu equation**. Writing one
spatial mode `h_k(t)` under a vertical drive `a(t) = A·cos(Ω t)`, the field
equation reduces to

```
ḧ_k + γ ḣ_k + [ ω₀(k)² − F·A·cos(Ω t) ] h_k = 0
```

a damped Mathieu equation. Its principal **parametric (subharmonic) resonance**
grows a mode when its natural frequency `ω₀(k) ≈ Ω/2`, once the forcing `F·A`
crosses the Mathieu threshold (∝ the damping `γ`). So the dish self-selects a
preferred wavenumber `k*` with `ω₀(k*) = Ω/2`. The dispersion relation

```
ω₀(k) = √( c²·k² + β·k⁴ )
```

carries a gravity-like term `c²k²` and a **capillary** stiffness `β k⁴`; the
latter, plus viscous loss, gives a finite preferred cell size (pattern
selection — cf. Kudrolli & Gollub, 1996).

## How the field implements it

`field.ts` integrates the **real PDE** on a 160×160 grid:

```
∂²h/∂t² = c²∇²h − β∇⁴h − γ ∂h/∂t + F·a(t)·h − (nonlinear saturation)
```

- `∇²` and `∇⁴` are 5-point Laplacians (the biharmonic is the Laplacian applied
  twice), with a semi-implicit damping update for stability and ping-pong
  scratch buffers.
- The `F·a(t)·h` term **is** the parametric Faraday mechanism — forcing
  multiplied by the local height. This is what produces the subharmonic response
  and pattern growth; it is not a noise texture.
- A cubic **Landau** term `−h³` saturates the runaway into clean, finite-
  amplitude cells.
- A circular damping mask makes the domain read as a round **dish**.

Constants were tuned by a headless numerical sweep so that the drive amplitude
`a(t)` sits usefully around the threshold: below `a ≈ 0.5` the dish is glassy;
`a ≈ 0.55–0.95` grows a clean pattern whose measured dominant wavenumber lands
right at `k*`; over-driving tips it into whole-dish sloshing — all genuine
Faraday regimes.

## The see≈hear weld

Each frame `field.analyse()` estimates the dish's **radial power spectrum**
(Hann-windowed slice DFTs averaged over rows and columns) and bins it into 7
bands. `audio.ts` voices those bands as an **inharmonic additive partial bank**:

- each band → one sine oscillator,
- its **gain** = the band's spatial energy (so the emergent pattern *is* the
  timbre — denser ripples brighten the higher partials),
- its **frequency** = `ω₀(k)` of the band's centroid wavenumber, mapped
  logarithmically into 62–1480 Hz.

### Why pitch is continuous, never scale-snapped

Every partial frequency is `ω₀(k)` — a direct readout of the fluid's own
dispersion relation. As the cells coarsen or sharpen the wavenumbers glide, and
the partials glide with them (`setTargetAtTime`, never stepped). Nothing is
quantised to a diatonic, pentatonic or just-intonation grid. The intervals are
whatever the water dictates — the physics is the score.

## Input model & fallbacks

- **Primary — microphone.** On a user gesture we open the mic; its short-window
  RMS is the vertical shake amplitude `a(t)`. Louder sound swells `a(t)` above
  threshold, so speaking or playing music grows the pattern.
- **Fallback — seeded carrier.** With no mic (denied or headless) a
  deterministic seeded swell drives `a(t)` across the threshold, so the dish
  blooms and calms on its own — the piece self-demos on load, silent until the
  audio gesture, then sounding on the carrier.
- **Rendering — WebGPU detection + Canvas2D fallback.** We detect
  `navigator.gpu`. This build ships the **Canvas2D** path as primary: the same
  PDE on typed-array grids, shaded via an `ImageData` buffer (height + surface-
  gradient caustics, all phase-insensitive so the subharmonic sign-flip never
  strobes the frame). It always runs, GPU or not.

## Determinism

All randomness (initial ripple noise, reverb impulse, carrier phases) comes from
a `mulberry32(0x2768)` PRNG. No `Math.random`, no `Date.now()`, no `new Date()`.
`performance.now()` is used only for animation timing. Two runs are identical.

## Next-cycle deepening

Move the stepping and shading into a **WebGPU compute pass** (a WGSL storage
buffer stepped by a compute shader, then a shading pass) for a 512² dish at
120 fps, and tune the pattern selection toward true **hexagons** near the
bicritical drive.

## References

- M. Faraday, "On the forms and states of fluids on vibrating elastic
  surfaces," *Phil. Trans. R. Soc. Lond.* 121 (1831).
- The **Mathieu equation** / parametric resonance (the linear stability theory
  of the vibrating surface).
- A. Kudrolli & J. P. Gollub, "Patterns and spatiotemporal chaos in
  parametrically forced surface waves," *Physica D* 97 (1996) 133–154.

## Files

- `page.tsx` — client component: sim/render loop, seeded carrier, mic drive,
  WebGPU detection + UI.
- `field.ts` — the Faraday PDE, dispersion relation, radial-spectrum analyser,
  seeded PRNG.
- `audio.ts` — additive partial-bank engine and mic RMS input.
- `viz.ts` — Canvas2D caustic shading of the height field.
