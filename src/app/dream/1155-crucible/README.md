# 1155 · The Crucible

**Route:** `/dream/1155-crucible`

## The one question

*What if Karel's real solo-piano recording were the **heat** driving matter
through its phases — could you watch his music melt a crystal and freeze it
again?*

## What it is

Karel's "Welcome Home" piano plays. Its moment-to-moment **energy** is the
**temperature** of a genuine 2D **molecular-dynamics gas**. ~900 particles
interact through the **Lennard-Jones potential**, integrated with
**velocity-Verlet**, in a bounded box with reflecting walls. A thermostat sets
the target temperature from the audio, so the music alone drives matter through
its phases:

- **Quiet** → low T → the cluster settles into a **hexagonal crystal** (order
  you can see emerge; coordination number → 6).
- **Loud / dense** → high T → the lattice **melts** to a liquid drop, then
  **vaporises** to a gas that fills the box.
- **Onset spikes** (spectral flux) inject a burst of kinetic energy — a visible
  shock through the medium.

Particles are rendered as glowing three.js `THREE.Points` with an additive
shader. Colour maps local kinetic energy and coordination: cold, well-ordered
crystal = **crystal-cyan** (`#38bdf8` → `#5eead4`); hot gas = **plasma-magenta**
(`#e879f9` / `#f0abfc`). A live readout shows the phase (SOLID · LIQUID · GAS),
the instantaneous and target temperatures, and the mean coordination number.

## How to use it

1. Press **"Play — heat the crucible"** (creates the AudioContext inside the
   gesture and starts Karel's recording).
2. Watch the crystal melt and re-form as the music swells and settles. The piece
   is stateful and long-form — minute 1 looks nothing like minute 3.
3. **Drag on the field** to stir heat into a region by hand and melt it locally.
4. Use the **Cooling** slider to offset the thermostat and force
   re-crystallization *against* the music.
5. Audio source: Karel's Path recording (default id), drop/choose a local file,
   or — if the network fetch fails — a gentle offline-rendered synth-piano
   arpeggio, so the demo is never silent or blank.

The simulation also runs on mount with a gentle "idle warmth" so the screen
shows a slowly breathing crystal before you press Play.

## The physics (real, in reduced LJ units ε = σ = m = kB = 1)

- **Pair potential** (John Lennard-Jones, 1924):
  `U(r) = 4ε[(σ/r)¹² − (σ/r)⁶]`, force
  `F(r) = 24ε[2(σ/r)¹² − (σ/r)⁶]/r`, evaluated to a **2.5σ cutoff** using an
  **O(N) cell (neighbor) list** rebuilt each step.
- **Integrator** (Loup Verlet, velocity form, 1967):
  `v += ½a·dt ; x += v·dt ; recompute a ; v += ½a·dt` — symplectic, energy-stable.
  10 substeps of `dt = 0.004` per animation frame.
- **Thermostat:** Berendsen velocity-rescale toward the audio-set temperature
  (`λ = √(1 + (dt/τ)(T_target/T − 1))`, clamped for stability).
- **Temperature from equipartition** (2D): `T = KE_total / N`.
- **Phase detection:** combined instantaneous temperature + mean first-shell
  coordination number.
- **Stability guards:** reflecting walls keep the gas bounded; a soft-core clamp
  (force capped at r = 0.8σ) prevents blow-ups in violent gas collisions.

## Subsystems (≥3)

1. Real-audio decode + realtime analysis (RMS energy, spectral flux, centroid).
2. Lennard-Jones molecular-dynamics physics (velocity-Verlet + cell list).
3. GPU point-cloud render (three.js additive `THREE.Points` shader).
4. Audio-driven Berendsen thermostat coupling music → temperature.
5. Phase-detection readout (temperature + coordination → SOLID/LIQUID/GAS).

## Named references

- **John Lennard-Jones** — the Lennard-Jones interatomic potential (1924).
- **Loup Verlet** — the (velocity-)Verlet integration scheme (1967).

## Honest notes — verified vs not

- **Verified:** the LJ force, velocity-Verlet update, cell-list neighbor search,
  Berendsen thermostat, and 2D equipartition temperature are all standard and
  implemented for real (not faked). At low target T the cluster reproducibly
  forms a hexagonal lattice with coordination ≈ 6; at high T it disperses into a
  gas. TypeScript + ESLint clean.
- **Simplifications:** the sim is **2D** (a hex lattice is the clearest possible
  "order emerging"); it is rendered as a **thin 3D slab** in a real three.js
  scene (each particle gets a small static z-thickness plus a gentle camera sway
  for depth/parallax) — the z coordinate does not participate in the physics.
  Units are reduced/arbitrary, not calibrated to a real substance. The soft-core
  force clamp slightly softens the hardest collisions for numerical stability.
- **Not claimed:** this is not a research MD code (no long-range corrections, no
  Nosé-Hoover / Langevin dynamics, no periodic minimum-image — walls are
  reflecting). It is a physically honest, demoable illustration.
- **Safety:** phase changes are smooth colour/motion drift; brightness only
  swells gently with heat. No hard strobe or full-frame luminance flashing.
