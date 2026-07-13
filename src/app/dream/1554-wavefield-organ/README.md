# 1554 · Wavefield Organ

**The one question:** *What if you could tilt your phone to steer real physical
wave-sources across a vibrating plate — and see (and hear) a genuine 2D
wave-equation field bloom into Chladni / cymatics interference patterns you play
with your whole body?*

Tilt (or WASD / arrow keys) walks six continuously-forced wave sources across a
clamped plate. A real finite-difference wave equation runs on the plate; the
sources build standing waves whose interference **nodes** are Ernst Chladni's
cymatic figures, and a point-field of ~48k particles drifts down the wave-energy
gradient to pool on those nodes — exactly as dry sand does on a real Chladni
plate. Each source rings one just-intonation organ pipe; the ripple you *see* is
the amplitude envelope of the tone you *hear*.

## The math — a true 2D wave PDE (not a warp)

The plate is a discretised, damped 2D wave equation:

```
d²u/dt² = c² ∇²u          (continuous)
u_next = ( 2·u_curr − u_prev + c²·∇²u_curr ) · damping    (leapfrog step)
∇²u ≈ u(x−1,y) + u(x+1,y) + u(x,y−1) + u(x,y+1) − 4·u(x,y)   (5-point Laplacian)
```

- **Boundaries** are Dirichlet (`u = 0` on the rim) — a *clamped* membrane, so
  energy stays on the plate and continuous sinusoidal forcing builds true
  **standing waves**. That superposition is the only thing that produces the
  nodal lines; nothing about the figure is drawn or faked.
- **Forcing:** each source adds a gaussian-weighted `A·sin(2π·f·t)` into the
  field every frame. `c²` (the coupling, i.e. the propagation speed) is steered
  by how hard you tilt — faster waves → shorter wavelength → tighter figures.
- **Chladni advection:** each particle feels `−∇(u²) = −2u·∇u`, i.e. it is pushed
  *down* the wave-energy gradient toward the still nodal lines, with light
  brownian jitter so a stale figure keeps breathing. This is the physical reason
  sand collects on nodes and flees the antinodes.
- Stability & bounding: `c²` is kept in `[0.10, 0.26]` (CFL needs `< 0.5`), and
  the forcing amplitude / damping (`0.993`) were tuned numerically so the driven
  standing wave settles to a bounded `max |u| ≈ 1.8` instead of running away to
  resonance on the reflecting plate.

This is deliberately **not** a "breathing-field / log-polar warp." A log-polar
warp is a screen-space remap of a texture and carries no physics — no
propagation speed, no interference, no nodes. Here the figures emerge only from
wave superposition on the grid.

## Named references

- **Ernst Chladni / cymatics** — standing waves on a bowed/driven plate, sand
  migrating to the nodal lines to draw the modal figures.
- **The 2D wave equation** — `d²u/dt² = c²∇²u`, solved by explicit
  finite-difference leapfrog with a 5-point Laplacian.
- **TouchDesigner POP (Point Operator) wavefield component libraries (2025)** —
  GPU point-based, audio-reactive wave fields. This piece takes the same
  "wavefield as a GPU point cloud" idea and builds it from first principles on
  the raw PDE, with the points advecting to the physics' own nodal lines.

## See = hear weld (one scalar per source)

For each of the six sources, the CPU shadow field's **energy at that source**
is a single scalar that simultaneously:

1. sets the loudness (envelope) of that source's sustained just-intonation pipe
   (ratios `1, 9/8, 5/4, 4/3, 3/2, 5/3` over a 110 Hz root), and
2. sets the brightness of that source's glow on screen.

So the halo you watch pulse *is* the volume curve you hear. Separately, tilt
magnitude → propagation speed `c` → the shared drone bank's low-pass cutoff, so
leaning harder both tightens the figures and opens the drone. Antinode amplitude
drives the interference wash's brightness.

Audio chain (per the house limits): six pipes + drone → shared cavern reverb →
master `GainNode` (≤ 0.18) → `DynamicsCompressor` → destination. Voices are a
fixed six sustained pipes (well under the 14-voice cap, no stealing needed). The
`AudioContext` is created only on the Start gesture and fully torn down on Stop /
unmount.

## WebGPU / Canvas2D robustness

The **primary** surface is WebGPU compute: four passes per frame — wave step,
source forcing, particle advection, then a full-screen interference wash plus
instanced additive violet point sprites (`webgpu.ts`, grid 356², 48k points).

If `navigator.gpu` or the adapter is missing (the reviewer runs headless with no
GPU, and many browsers still lack WebGPU), `initWebGpu` returns `null` and the
page runs the **identical model** on the CPU (`wave.ts`, grid 140², 2.4k points)
into a Canvas2D surface — same wave equation, same Chladni advection, same violet
point-field, same audio weld. A header badge reads which path is live
("WebGPU compute" vs "Canvas 2D fallback"). The plate is never blank: a seeded
Lissajous idle demo drifts the sources from first paint, before any gesture.

On both backends the audio envelope + source glows are driven by the same small
CPU shadow field (a per-frame GPU read-back would stall the pipeline), so the
weld is identical everywhere.

## Safety

No stroboscopic luminance. The visual forcing frequencies are all `< 1 Hz`, so
the brightness envelope (which follows `|u|`, pulsing at 2×) never approaches the
3 Hz photosensitive floor, and there are no full-screen luminance flips. A smooth
`~0.35 Hz` global drift is the only whole-frame modulation. `prefersReducedMotion`
slows the sim, softens the damping/jitter, and halves the drift.

## Honest knocks

- On the WebGPU path the particles read the large GPU field while the audio /
  source-glow scalar comes from the smaller CPU shadow field — same forcing, but
  the two grids have slightly different modal structure, so the particle figure
  and the glow-driven audio are *tightly correlated*, not bit-identical. On the
  Canvas2D path they are literally the same field.
- Chladni sand collects at nodes, so the point-field mostly traces *dark* lines;
  the drama comes from the bright interference wash behind it and the glow pulses,
  not from the particles' own luminance.
- Desktop `deviceorientation` often never fires (no sensor); the keyboard +
  idle-demo path is the real desktop experience.
- The forcing is a soft continuous drive, not a bowed edge, so the figures are
  smoother and more fluid than a razor-sharp physical Chladni plate.
- Amplitude is bounded by tuned damping rather than a hard limiter; extreme
  parameter combinations could still over-brighten a region.
