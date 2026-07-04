# 1142 · Orbital Cloud

*What if you could reach into a hydrogen atom and excite it between electron
orbitals — watching the real quantum probability cloud morph in 3D and hearing
the atom's actual spectral emission lines?*

A drug-free psychedelic instrument built on genuine quantum mechanics. The
phenomenology of psychedelic visuals — glowing probability clouds, superposed
shimmer, structure emerging from a haze — is rendered here as *literal physics*:
the real hydrogen wavefunction and its real emission spectrum.

## What it is

You play a single hydrogen atom. Drag on the cloud to pump it up and down the
energy ladder between (n, l, m) eigenstates. The glowing 3D point cloud is the
genuine probability density |ψ_nlm|², and it morphs smoothly on every jump. Each
downward transition fires a "photon" whose pitch is the Rydberg-formula emission
line — so the atom literally plays its own spectrum as a scale.

- **Drag up / down** → excite / relax the principal level n (1↔4). A downward
  jump emits a real spectral line (sound + a bright bell).
- **Drag left / right** → step through the l,m sublevels (reshape the cloud).
- **Tap** → reorient the orbital (cycle m).
- **Leave it alone** → the atom auto-plays, wandering the spectrum so there is
  always motion and sound within ~1 s.

## The mechanism (real physics)

**Wavefunction.** ψ_nlm(r,θ,φ) = R_nl(r) · Y_lm(θ,φ).
- `R_nl` is the true hydrogenic radial function: an associated Laguerre
  polynomial × ρ^l × e^(−ρ/2), ρ = 2r/(n·a₀), in Bohr-radius units, correctly
  normalised. Its radial nodes are physical.
- The angular part uses the **real spherical harmonics** (real combinations of
  the complex Y_lm), written as solid-harmonic polynomials in the direction
  cosines so the shapes come out right: **l=0 s → sphere · l=1 p → dumbbell ·
  l=2 d → cloverleaf / d_z² torus-lobe · l=3 f → multi-lobe**. m sets the
  orientation.

**Point cloud.** Points are placed by rejection / importance sampling of
|ψ|²·r² over the volume (dV = r² dr dΩ), so point density *is* the quantum
probability density. Each point carries the **sign (phase) of ψ**, which drives
its colour (the two lobes of a p orbital are opposite phase → opposite colour).
Rendered in **WebGL2** as additive `gl.POINTS` with a soft Gaussian sprite — no
three.js, no external deps. Clouds are auto-framed by their RMS radius so every
orbital reads at a comfortable size while the internal node structure stays
honest.

**Spectroscopy → sound.** Each downward transition's photon energy is the
**Rydberg / Bohr formula**

> ΔE = 13.6 eV · (1/n_f² − 1/n_i²)

folded into an audible register (higher energy → higher pitch), so the
Lyman/Balmer/Paschen series stack into an ordered scale and the Balmer lines
(Hα<Hβ<Hγ<Hδ) rise in pitch. Verified: the code reproduces the Balmer
wavelengths **656 / 486 / 434 / 410 nm** exactly. A sustained drone tracks the
current level's binding energy.

## Subsystems

| File | Purpose |
|------|---------|
| `page.tsx` | `"use client"` component: state machine, pointer "pump" controls, idle auto-play, morph loop, HUD, WebGL2↔Canvas2D branch, cleanup. |
| `orbital.ts` | Physics: `radialR`, real `angular` harmonics, `sampleCloud` (rejection sampling of |ψ|²), `rydbergEnergyEv`, `energyToAudibleHz`, `levelToDroneHz`. |
| `render.ts` | Dependency-free mat4 helpers + the WebGL2 additive point-cloud renderer, plus a Canvas2D projection fallback. |
| `audio.ts` | Web Audio: FM/additive photon bells + sustained drone → code-generated convolution reverb (`_shared/psych/convolutionVoid`) → DynamicsCompressor limiter. Full teardown on unmount. |

## Palette

Anchored to the actual hydrogen **Balmer emission wavelengths**, glowing on a
near-black cosmic ground: **Hα 656 nm red · Hβ 486 nm cyan · Hγ 434 nm blue ·
Hδ 410 nm violet**, with magenta accents. Phase-lobe colour pairs are chosen per
l from these anchors.

## Ambition-floor criteria hit

- **Audio-visual, not static:** real-time WebGL2 cloud + real Web Audio spectrum.
- **Played, not watched:** drag pumps the atom; every input reshapes the cloud
  and can emit a photon.
- **Real physics, faithful:** genuine wavefunctions, correct orbital shapes
  (numerically verified), exact Rydberg/Balmer lines.
- **Life within 1 s:** a first transition fires ~0.5 s after Begin; idle
  auto-play keeps it alive.
- **Degrades gracefully:** no WebGL2 → `text-rose-300` notice + Canvas2D
  projection + sliders that still drive the audio.

## Safety note

Photosensitive-safe: the piece is a **steady soft glow** — no strobe. Any
luminance oscillation is a slow breath routed through the shared
`createSafeFlicker({ maxHz: 8 })` engine (kept effectively off / gentle here),
and `prefers-reduced-motion` calms the rotation and breathing. Audio starts only
on the Begin gesture and is fully torn down (oscillators stopped, AudioContext
closed) on unmount.

## Named references

- **Hydrogen-atom wavefunctions** — spherical harmonics Y_lm × Laguerre radial
  functions R_nl (standard non-relativistic solution of the Schrödinger equation
  for the Coulomb potential).
- **Rydberg formula & Bohr spectral series** — ΔE = 13.6 eV·(1/n_f² − 1/n_i²);
  Lyman (n_f=1), Balmer (n_f=2), Paschen (n_f=3).
- **Balmer emission spectrum** — the visible hydrogen lines Hα 656 nm, Hβ 486 nm,
  Hγ 434 nm, Hδ 410 nm, used as the colour palette.
- **Conceptual license only:** the 2026 hypothesis paper *"Psychedelics and the
  quantum brain"* (PubMed 41988526) is cited **only** as speculative license for
  rendering the *phenomenology* of superposition (a shimmering probability
  cloud). This piece makes **no** claim that consciousness is quantum and does
  **not** endorse quantum-consciousness theories — it is a physics visualiser and
  spectral sonifier, nothing more.
```
