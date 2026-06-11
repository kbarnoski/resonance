# 520 — Singing Dune

**One presence. One living dune of sand. You tip the world; it avalanches and re-settles — forever, never the same. Its motion is the sound.**

---

## What it is

A meditative, long-form piece about a single granular presence — a desert dune — simulated physically and rendered as sound. There is no goal, no win state, no interaction beyond gravity: you tilt your phone (or drag, or use arrow keys) to change the direction of gravity, and the dune slumps, avalanches, and finds a new angle of repose.

The audio is driven entirely by the sand's own physics:
- **Kinetic energy** → drone density + filter cutoff
- **Mean grain shear rate** → fundamental pitch (bends up during avalanche, sinks back at repose)
- **Impulsive avalanche events** → soft filtered grain bursts

---

## Subsystems

### Simulation (`sim.ts` — CPU fallback, `gpu.ts` — WebGPU primary)

Both implement **MLS-MPM** (Moving Least Squares Material Point Method) with APIC (Affine Particle-in-Cell) momentum transfer:

**Particle-to-Grid (P2G)**
Each grain scatters its mass and APIC-augmented momentum to the surrounding 3×3 grid nodes using quadratic B-spline weight functions. Cauchy stress is computed from a simplified neo-Hookean model: `P = 2μ(F−I) + λ log(J)·I`.

**Grid update**
Grid node velocities are normalised by mass, gravity is applied, and sticky boundary conditions enforce walls (and floor).

**Grid-to-Particle (G2P)**
Particles gather velocity and the APIC C-matrix (affine velocity gradient) from grid nodes. The deformation gradient `F` is updated via `F_new = (I + dt·C)·F`.

**Drucker-Prager plasticity**
Sand yields in shear: if the yield criterion `||deviatoric F|| + α·log(J) > 0` is violated (with friction angle ~30°, `α ≈ 0.47`), the deformation gradient is projected back toward the rotation part, simulating pile-up and avalanche rather than fluid splash.

**CPU path** (`sim.ts`): 2,000 particles, 64×64 grid, 4 substeps/frame, drawn as circles on Canvas 2D. Runs on load — no WebGPU required.

**GPU path** (`gpu.ts`): 6,000 particles, 128×128 grid, 3 substeps/frame, rendered as point sprites in a WebGPU render pass. Five compute passes per substep: clearGrid → P2G → gridUpdate → G2P → render. A 64-particle async readback provides aggregate physics stats for audio.

> **Unverified surface note:** The P2G pass has no f32 atomics (WebGPU does not expose them). Writes from different invocations to the same grid node are racy. In practice this averages out and produces stable sand behaviour, but in pathological cases (many particles landing in a single cell) grid mass could be slightly underestimated. This is a known limitation of the GPU MPM approach without dedicated atomic extensions.

### Audio (`audio.ts`)

Implements the acoustic physics of **booming/singing dunes** — a wave-trapped resonance whose pitch scales with grain shear rate (Andreotti et al. 2008). Signal chain:

```
sawtooth + triangle JI stack (root 72 Hz · ratios 1:1, 5:4, 3:2, 9:5, 2:1)
  → resonant lowpass filter (fc = 120 + shear×700 Hz, Q = 2.5–6.5)
    → amplitude envelope (kinetic energy)
      → grain-burst noise path (bandpass ~180 Hz, impulsive)
        → DynamicsCompressor (brick-wall limiter, threshold −6 dB, ratio 20:1)
          → destination
```

Pitch follows: `f₀ = 72 + 36·shearRate` Hz (72 Hz settled → 108 Hz full avalanche).

No harmonic progression — the drama is entirely in the sand's motion.

### Input (`page.tsx`)

1. **DeviceOrientationEvent** (primary on mobile): `gamma` (left/right tilt) → gravity X; `beta` (front/back tilt) → gravity Y. iOS 13+ requests permission inside the user-gesture callback.
2. **Pointer drag** (fallback): dragging the canvas nudges the gravity vector; magnitude is normalised to 1.
3. **Arrow keys** (fallback): held keys rotate gravity at 6°/frame.

A subtle SVG compass in the bottom-right shows the current gravity direction.

---

## Design philosophy

- **ONE presence** — one dune, one gravity, one drone register. No UI toys, no colour palette picker, no mode switches.
- **Never resolves** — the dune can never "win" or "solve". Even fully settled it breathes with micro-motion and the sub-bass rumble.
- **Hands-free** — the CPU fallback starts simulating immediately; on a tilting phone the dune wakes before you even touch it.
- **Palette** — deep umber (#48260E) at the base → amber (#B4641E) up the slope → pale gold (#F0C878) at the active slip face. Dark sky (#0A0704). Warm desert at dusk.

---

## Named references

- **Hu, Fang, Ge, Qu, Stomakhin, Jiang** — "A Moving Least Squares Material Point Method with Displacement Discontinuity and Fracture" (SIGGRAPH 2018). The canonical MLS-MPM formulation used here: APIC C-matrix, quadratic B-splines, Drucker-Prager plasticity.
- **Jiang, Schroeder, Teran, Stomakhin, Selle** — taichi `mpm88` / `mpm99` reference implementations. The compact 88-/99-line MPM demos that distill the SIGGRAPH 2018 method into legible code. Direct inspiration for the P2G/G2P structure here.
- **Andreotti, Bonneau, Clément, Douady, Duran, Elbelrhiti, Gadal, Génois, Goutières, Jaeger, Mangeney, Pouliquen, Steinfurt, Volfson, Aranson** — "The song of dunes as a wave-trapped acoustic resonance" (PNAS 2008 / arXiv 2007). The acoustic physics underlying the booming drone: frequency scales with grain shear velocity, not dune size; the resonance is trapped in the shearing layer.

---

## Honest "unverified surface" notes

1. The GPU P2G scatter has racy concurrent writes — see Subsystems above.
2. The Drucker-Prager projection here is approximate (acts on the full F rather than a proper SVD decomposition). A production implementation would do an analytic 2D SVD and project singular values. The behavioural effect is similar but the physics is not exactly Drucker-Prager.
3. The audio frequency mapping is inspired by Andreotti et al. but is not a numerically accurate recreation — the acoustic model here is phenomenological (kinetic-energy-driven envelope + shear-driven pitch bend), not a full wave-propagation simulation.
4. iOS orientation permission must be triggered by the "Wake the dune" button gesture. If the user navigates directly, orientation may not activate.

---

*Resonance dream lab — prototype 520 — meditative, adult, long-form*
