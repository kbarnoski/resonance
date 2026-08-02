# 5224-covenant

**The one question:** *What if the autonomous "beings" of a DMT breakthrough were
real physics — the self-propelled topological defects of an **active nematic** —
rendered as luminous volumetric entities drifting in a deep dark space, each a
voice, that you gather with a boundary until their chaos locks into an eternal
three-body "golden braid" that sings a repeating canon?*

A drug-free psychedelic **entity-contact** piece. State: DMT entity-contact →
ordered sacred-braid. Pole: intense, calm braid resolution. Screen and sound do
all the work.

---

## The physics (`nematic.ts`)

An **active nematic** is the coarse-grained director field of a dense suspension
of energy-burning rods — the living liquid crystal filmed by Sanchez & Dogic. It
is stored as a headless orientation θ(x,y) with θ ≡ θ+π, encoded as the
**doubled-angle vector** `U = (cos2θ, sin2θ)` on two `Float32Array` grids
(112×112), which bakes the nematic symmetry straight into the arithmetic.

Each step:

1. **Elastic relaxation** — `U ← U + κ∇²U` via the 5-point Laplacian, then
   renormalize `U` per cell (`κ ≈ 0.06`).
2. **Active self-advection** — the active flow
   `v = A·(∂ₓUₓ + ∂ᵧUᵧ , ∂ₓUᵧ − ∂ᵧUₓ)`; `U` is advected semi-Lagrangian by
   back-sampling at `pos − v·dt` (bilinear, periodic, displacement clamped for
   stability).
3. **Nucleation** — seeded micro-rotations keep birthing ±½ defect pairs so the
   turbulence self-sustains; suppressed inside the confinement. A population
   floor also injects genuine +½/−½ dipoles.

**Defect detection.** For every plaquette we sum the *wrapped* winding of
`φ = atan2(Uᵧ, Uₓ)` around its four corners. `≈ +2π` → a **+½** defect
(comet-shaped, **self-propelled**); `≈ −2π` → a **−½** defect (three-fold,
passive). Near-duplicate detections are merged.

**Defect tracking.** Each frame we match detections to the previous ones by
nearest same-sign within a radius, giving **persistent IDs** with smoothed
position, velocity, heading, age and a trajectory trail. Unmatched previous =
death (annihilation); unmatched new = birth. Population capped at ~40.

**Confinement → golden braid (2025 payload, arXiv:2503.10880).** Dragging places
a soft confinement disk. Inside it, activity is quenched and nucleation
suppressed, and the interior is coaxed toward the **analytic three-defect
director field** — the exact superposition of three +½ disclinations whose cores
ride a periodic three-body braid (its radial proportion set by the golden ratio).
The result is **exactly three real, tracked +½ defects** orbiting inside a still
sea, surrounded by open turbulence. **"Braid locked"** is detected genuinely from
the tracked data: three persistent +½ inside, alive, with a sum-of-pairwise-
distances that oscillates over a rolling window. Release the boundary and the
field falls back into turbulent chaos.

The core is CPU-only and light (~3 ms/step) so defect extraction is reliable at
60 fps. It was validated headlessly (transpiled with esbuild): sustained chaos of
14–22 defects, a clean lock to exactly 3 interior +½ with stable IDs, and a clean
return to chaos on release.

## Entities as the instrument (`audio.ts`)

- **Each +½ defect is a spatial VOICE** — an oscillator whose pitch is snapped to
  a just-intonation pentatonic slot by its persistent ID, stereo-panned by its
  x-position, amplitude swelling with age, vibrato depth driven by dart speed.
- **−½ defects → a low passive drone pad** whose level thickens with the −½
  population.
- **Birth** = a soft rising attack (pitch glides up, gain swells). **Annihilation**
  = the dying voice glides into its nearest neighbour's pitch and cancels.
- **Turbulent** = a dense, detuned, darting atonal cloud (voices capped at 12).
- **Braid-locked** = the three interior voices snap to a consonant **just-major
  triad** (root · 5/4 · 3/2) over a **repeating three-pulse canon** clocked to the
  braid's orbital period — the hypnotic reward.
- A quiet bed drone underlies everything; the sum runs through a
  `DynamicsCompressor` limiter. Autoplay-gated — sound joins on the first tap /
  **Begin**.

## The luminous volume (`scene.ts`, three.js)

A dark volume with a slow auto-orbiting camera and a parallax star-veil. A faint
field of short segments traces the director. **The defects are the stars:** a +½
is a bright violet-white head trailing a **comet** of its recent path; a −½ is a
dimmer, cooler **three-fold** form that only drifts. Depth comes from type and
age. Everything is piped through **UnrealBloomPass** (jeweled glow) and a light
**AfterimagePass** (slow tracers). When the braid locks, the three +½ brighten,
their trails weave a mandala, and the bloom rises gently.

## Interaction / degradation

- **Hands-free demo** runs the full chaos → gather → braid → release arc on load,
  cycling, until you take over. Deterministic from seed `0x5224` (seeded
  `mulberry32` for *all* randomness; timing from `performance.now()` /
  `AudioContext.currentTime`).
- **Drag** anywhere to place/move the boundary and gather the beings;
  **Release boundary** returns them to chaos.
- **No WebGL** → an on-brand notice; the physics and voices still run.
- **No Web Audio** → the visuals run with a notice.

## Safety

No strobe or flicker. Every luminance change is a slow lerp (≤ a few Hz); bloom
and afterimage never produce high-frequency full-screen flashing.
`prefers-reduced-motion` damps the bloom, shortens the tracers and slows the
orbit.

## References

- T. Sanchez, D. Chen, S. DeCamp, M. Heymann, Z. Dogic, *Spontaneous motion in
  hierarchically assembled active matter*, **Nature** 491, 431 (2012).
- A. Tan, J. Roberts, et al., *Topological turbulence in the membrane of a living
  cell / active nematics*, **Nature Physics** 15 (2019).
- *Confinement of active nematics into a golden three-defect braid*,
  **arXiv:2503.10880** (2025).
- R. Strassman, *DMT: The Spirit Molecule* (2001); T. McKenna, accounts of DMT
  entity-contact — the phenomenology this piece reframes as physics.
