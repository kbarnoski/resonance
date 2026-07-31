# 4360 · Cymatic

## The question

**What does a pitch look like?**

A driven Chladni plate. A square plate is excited at a chosen frequency; thousands
of "sand" grains migrate off the vibrating antinodes and settle onto the
standing-wave **nodal lines**, drawing the exact geometric figure of that pitch.
Drag the drive frequency and the pattern reorganises live into the next mode's
figure while the plate audibly sings that tone. Sound is made into visible form —
the direct "resonance" thesis of the app.

## The mechanism

The plate displacement is modelled as a superposition of square-plate eigenmodes

```
Φ_mn(x,y) = cos(mπx)·cos(nπy) ± cos(nπx)·cos(mπy)      x,y ∈ [0,1]
A(p)      = Σ_k w_k(f) · Φ_k(p)
```

where each mode's weight `w_k(f)` is a **Lorentzian resonance response** peaked at
that mode's natural frequency `f_k` (proportional bandwidth, so every resonance has
a similar Q). The drive frequency `f` therefore selects which modes ring: near a
peak a single clean figure appears; between peaks two modes blend and the figure
morphs. Every "sand" particle does a **damped Newton descent onto the nodal set**
`A(p)=0` (step `p -= rate·A·∇A / |∇A|²`, clamped), plus a **jitter proportional to
local displacement `|A|`** — sand bounces where the plate moves most and is still
where it is at rest (the node). Over ~1–2 s the cloud collapses onto the nodal
figure; changing `f` reshuffles the weights and it re-forms.

## Reference

Ernst **Chladni**, *Entdeckungen über die Theorie des Klanges* (1787) — the
original bowed-plate sand-figure experiments this simulates. See also Hans **Jenny**,
*Cymatics* (1967).

## Controls

- **Pointer** — drag horizontally to sweep the drive frequency (scrub the pitch).
- **Keyboard** — `A S D F G H J K` jump to the 8 named modes that give clean
  figures (cross → saddle → grid → fan → lattice → ribs → mesh → weave); `Space`
  agitates the plate (shakes the sand off the nodes, then it re-settles).
- **Slider** — a touch-draggable frequency control (70–620 Hz).
- On load a seeded autopilot sweeps the first clean modes hands-free so the plate
  sings and the figure reorganises within ~1 s; the first gesture resumes the
  AudioContext and hands control over.

## GPU / CPU

The shipped-primary path is a **WebGPU compute-shader** particle simulation:
`@compute @workgroup_size(64)` integrates ≈100k particles, rendered as additive
points on the violet ramp (`#4c1d95 → #8b5cf6 → #ede9fe`). When `navigator.gpu` is
absent (or the adapter/device request fails), it falls back to a **Canvas2D** path
running the identical model at ≈4k particles. Both paths are driven by the same
eigenmode field evaluator (`modes.ts`) and the same additive-synth audio
(`audio.ts`). A badge shows which path is live.

## Subsystems

WebGPU compute particle sim (`gpu.ts`) · eigenmode field evaluator + resonance
mapper (`modes.ts`) · Canvas2D fallback (`cpu.ts`) · additive/modal audio synth
(`audio.ts`) · WebGPU render pipeline (`gpu.ts`). Five subsystems; named physical
reference (Chladni).

## Next-cycle deepening

1. **Anisotropic / non-square plates.** Add plate geometry (circular membrane
   Bessel modes, or a rectangle with an aspect ratio) so the figures change family,
   and let the visitor bow at a chosen *edge point* — driving position selects which
   symmetric combination (`+` vs `−`) dominates, as on a real plate.
2. **True readback-coupled loudness.** Read the settled-particle density back from
   the GPU (async map) to measure how sharply the sand has locked onto the node, and
   feed that "figure crispness" into the audio — a well-formed figure rings louder
   and purer, a transitional blend sounds unstable, closing the sight↔sound loop.
