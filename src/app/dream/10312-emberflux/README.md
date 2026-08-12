# 10312 · Emberflux

**Route:** `/dream/10312-emberflux`

## The one question

**What if you could tilt a warm molten surface and conduct where it BOILS — a real
Rayleigh–Bénard convection layer that self-organizes into overturning cells,
reorganizes over time, and SINGS its own overturning?**

This is lane A of a three-lane DEEP race on one concept (conducting a boiling
convection layer). This lane's realization is a **true 2D thermal fluid** — a
Boussinesq Rayleigh–Bénard layer — run on **WebGPU compute shaders**, with a
solid WebGL2 fragment-shader fallback. The **cell structure is the art**: legible
plumes, up- and down-welling, and cool cell-boundary lanes, not a soft nebula.

## How the convection sim works

The fluid is solved in **vorticity–streamfunction** form on a 256×160 grid. Three
scalar fields — temperature `T`, vorticity `ω`, streamfunction `ψ` — are stepped
every frame:

1. **Advect + diffuse temperature.** Semi-Lagrangian back-trace along the flow,
   plus a small Laplacian diffusion (κ). The bottom row is pinned hot (`T=1`),
   the top row cold (`T=0`) — the temperature difference across the layer is what
   drives everything.
2. **Advect + diffuse vorticity**, then add the **buoyancy source**
   `β·(g × ∇T)_z = β·(gₓ·∂T/∂y − g_y·∂T/∂x)`. Wherever hot fluid sits beneath
   cool fluid, this injects the vorticity that becomes an overturning roll.
3. **Poisson solve** `∇²ψ = −ω` by Jacobi iterations (24/frame).
4. **Reconstruct velocity** `u = ∂ψ/∂y`, `v = −∂ψ/∂x` — divergence-free by
   construction, so the flow doesn't compress.

Above the critical Rayleigh number the flat conducting layer is unstable: a tiny
seeded perturbation grows into a honeycomb of convection cells that keep
**reorganizing** rather than freezing. Horizontal edges wrap (cells drift
sideways under tilt); top/bottom are free-slip walls (`ψ=0`, `ω=0`).

**Tilt is the conductor.** `DeviceOrientationEvent` gamma rotates the gravity
vector `(gₓ, g_y)`, so the plumes lean and the boil drifts toward the low side.
iOS motion permission is requested from inside the Start tap handler.

**Rendering.** Temperature maps to a warm molten ramp (basalt → oxblood → copper
→ amber → gold → white-hot). A little shading is reconstructed from the
temperature gradient so it reads as a 3D-ish molten surface; rising plumes are
brightened by the vertical velocity, sinking lanes darkened, and cell boundaries
picked out with a cool oxblood rim. Never a flat heatmap, never Canvas2D.

## Audio (inharmonic, physics-driven)

- A warm low **convective drone**: two deliberately inharmonic oscillators
  (ratio ≈ 1.505, off the just fifth) plus a brown-noise **boil bed**. Its level
  and brightness track total kinetic energy read back from a coarse GPU probe.
  Never silent once started.
- **Overturn chimes:** when a plume tip punches upward through a cell (rising-edge
  threshold on the probe's vertical velocity where the fluid is hot), a struck
  free-bar tone rings on **inharmonic partials 1 : 2.76 : 5.40 : 8.93**,
  octave-stretched and per-hit detuned, panned by the cell's x-position, voice-
  capped at 16. No 12-TET, no pentatonic, no pure just-intonation.
- Everything routes through the shared `createSafeMaster` bus. Audio starts only
  after the first gesture (the Start tap).

## Degrade ladder

1. **WebGPU compute** (primary) — storage-buffer ping-pong, one compute pass per
   stage, coarse probe copied to a staging buffer read back via `mapAsync`.
2. **WebGL2 fragment-shader ping-pong** — the identical math on R32F float
   textures (`EXT_color_buffer_float`), manual bilinear via `texelFetch` so it
   doesn't depend on float linear-filtering; coarse probe packed into RGBA8 and
   read back with `readPixels`. This is the workhorse (WebGPU is untestable in
   the build environment: no `navigator.gpu`).
3. **Warm CSS notice** via `text-destructive` if neither substrate starts — the
   convective drone keeps playing.

## Muted-phone self-demo

With zero input and zero audio, a seeded `mulberry32(0x10312)` **auto-conductor**
drifts gravity and buoyancy so the convection visibly forms and reorganizes
within about a second on load. Badged **"no tilt — auto-conducting"**. Audio waits
for the first gesture. Seeded randomness only — never `Math.random`, `Date.now`,
or `new Date`; time comes from `performance.now()` / `requestAnimationFrame`.

## Safety

No strobe; all luminance motion is slow drift (convection is inherently slow).
`prefers-reduced-motion` slows the sim and the auto-conductor. On unmount:
`cancelAnimationFrame`, remove the orientation listener, destroy GPU
buffers/textures/pipelines (or delete GL programs/textures/FBOs and lose the
context), stop the oscillators, disconnect the safe master, close the
AudioContext. Pure client — no API route.

## Named references

- **Henri Bénard** (1900) — the original cellular-convection experiments.
- **Lord Rayleigh**, "On convection currents in a horizontal layer of fluid,"
  *Philosophical Magazine* 32, 529 (1916) — the linear stability theory and the
  critical Rayleigh number.
- **R. F. Stein & Å. Nordlund**, "Simulations of Solar Granulation I. General
  Properties," *The Astrophysical Journal* 499, 914 (1998) — the Sun's surface is
  convection you can watch; granules are overturning cells.

## Ambition self-assessment — honest 3/5

- **#1 novelty:** convection-as-conductable-instrument with tilt is a fresh
  framing, but Rayleigh–Bénard on the GPU is well-trodden. (~3)
- **#2 subsystems (≥3):** yes — a real fluid solver (advection + Poisson
  projection), device-orientation input with a seeded auto-conductor, and a
  physics-driven inharmonic audio engine with GPU readback. (3)
- **#3 named refs:** Bénard, Rayleigh, Stein & Nordlund — cited above. (3)
- **#4 degrade:** WebGPU → WebGL2 float ping-pong → CSS notice, all real. (3)
- **#5 research (§1101):** grounded in the classical RB literature and solar
  granulation; the vorticity–streamfunction formulation and free-slip/periodic
  boundary treatment follow standard 2D convection practice. (~3)

**Weakest link:** the WebGPU path is untestable in this environment, so the
WebGL2 fallback is the guaranteed-correct one; and with only 24 Jacobi iterations
the pressure projection is under-converged, so the flow is convincingly cellular
rather than physically exact.
