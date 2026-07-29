# 3576-bloom — a struck resonant surface (non-linear modal synthesis)

## The one question

**What if you could strike a real resonant surface — a gong, a plate, a drum
membrane — and hear it ring with _genuine non-linear physics_: hit it harder and
the pitch glides sharp and blooms, energy sloshing between its modes into an
evolving shimmer, exactly like a real struck plate — while you WATCH the
vibration modes draw themselves as living Chladni nodal patterns?**

This is a hands-on physical-modelling instrument. There is no score, no
win/lose, no fail-state. You excite a material; it sings back with real acoustic
behaviour, and the picture on the surface _is_ the sound.

## How the non-linear modal synthesis works here

Linear modal synthesis models a struck object as a sum of decaying sinusoids
("modes"), each at `f_i = f0 · ratio_i` with its own decay time `tau_i` and gain.
That alone sounds static — a fixed chord that fades. The point of this prototype
is the **non-linear extension** (the current research frontier). Two effects are
added on top of the linear bank:

1. **Tension modulation — the "bloom".** The instantaneous total vibrational
   energy `E(t)` (the sum of the live mode amplitudes) stiffens the surface,
   raising _every_ mode's effective frequency:

   ```
   f_i_eff(t) = f_i · (1 + beta · tanh(E(t)))
   ```

   So a hard strike starts sharp — the pitch blooms _up_ — then glides back down
   toward `f_i` as the sound decays and `E` falls. This is the signature "pyow"
   of struck plates, gongs and cymbals. `beta` is the per-material nonlinearity
   depth (highest for the gong). The `tanh` bounds a very hard strike so it can't
   run away.

2. **Mode coupling — the "shimmer".** Energy transfers between neighbouring
   modes over time via a discrete diffusion term evaluated every frame:

   ```
   e_i += kappa · dt · (e_{i-1} + e_{i+1} − 2·e_i)
   ```

   This conserves energy (only the per-mode decay removes it) but continuously
   redistributes it, so the spectral centroid drifts during the decay and the
   timbre evolves rather than sitting still — the shimmer of a cymbal or gong.
   `kappa` is the per-material coupling rate.

### Realisation on the main-thread Web Audio graph

No AudioWorklet (that is a sibling prototype's job). Instead:

- A fixed pool of 12 always-on `OscillatorNode`s, each through its own
  `GainNode` envelope, summed into a bus → gentle master **lowpass** → `tanh`
  **WaveShaper** soft-limiter → **DynamicsCompressor** → master gain (kept at
  0.16 — many summed sines get loud).
- A small **JS energy model** (`Float32Array`, one live amplitude per mode) is
  integrated every animation frame using deltas from `audioCtx.currentTime`:
  exponential decay, then the coupling diffusion, then the tension-modulation
  frequency term. The model is mirrored onto the audio graph with short
  `setTargetAtTime` ramps (gain = per-mode loudness, frequency = `f0 · ratio_i ·
  bloom`). The **same array** drives the Chladni visual, so sound and picture are
  one object.
- Each strike injects energy across the modes with a spectral tilt set by
  hardness (soft → energy in the low modes; hard → flatter, brighter), plus a
  short deterministic **filtered noise burst** as the exciter "thunk" (bandpass
  centre scales with pitch and hardness).

## Material / geometry presets (5)

| Material          | Ratios                             | Decay    | Bloom `beta` | Coupling |
| ----------------- | ---------------------------------- | -------- | ------------ | -------- |
| **Plate**         | inharmonic 2D flat-plate           | medium   | medium       | medium   |
| **Gong / Tam-tam**| dense inharmonic                   | long     | **high**     | **high** |
| **Membrane / Drum**| ideal-membrane (Bessel zeros: 1, 1.593, 2.136, 2.295, …) | fast | low-mid | mid |
| **Bar / Marimba** | free-free bar (1, 2.756, 5.404, 8.933, …) | short | low | low |
| **String / Piano**| near-harmonic with inharmonicity `i·√(1+B·i²)` | long | low | low |

The autopilot cycles Plate → Gong → Membrane so a hands-off reviewer hears the
range immediately.

**Continuous pitch (protected rule):** the fundamental `f0` is set continuously
on a musical log scale across ~55–440 Hz by the horizontal strike position and
by the pitch slider. Pitch is **never** quantised to a scale or chord.

## The Chladni mapping (Canvas2D only)

A rectangular plate's out-of-plane displacement is a superposition of standing
waves over the unit square:

```
u(x,y) = Σ a_i · cos(n_i·π·x) · cos(m_i·π·y)
```

Each audio mode is assigned an integer pair `(n_i, m_i)`, ordered by `n²+m²` so
low modes are simple figures and high modes are busy ones. The amplitudes `a_i`
are the engine's live mode energies (√energy for readability). `u` is evaluated
on a 200×200 grid: near-zero `|u|` (the **nodal lines**, where sand collects) is
drawn as bright violet filaments; large `|u|` (antinodes) gets a dim violet
glow; all on a near-black field. As the sound rings, blooms and the coupling
reshuffles energy, the nodal pattern visibly blooms on strike then reorganises
and settles. A strike ripple marks the origin, and a slow breath drifts the
vignette. `prefers-reduced-motion` dims the flashing and drops the ripple/breath;
nothing strobes.

## Input & self-demo

- **Strike:** pointer/touch/click on the surface. `x` → fundamental (left low,
  right high), `y` → hardness (top hard/bright, bottom soft). Drag to scrub
  (throttled). Sliders set pitch and hardness; a "Strike at these settings"
  button works with no pointer.
- **Seeded autopilot:** on Start (the AudioContext is created only inside the
  Start gesture), a `mulberry32` autopilot strikes on a slow evolving rhythm,
  varying material, pitch and hardness, so a hands-off reviewer immediately hears
  the ring + bloom + shimmer and sees the Chladni figure evolve. The first human
  interaction hands over control (an `AUTO` → `YOU` badge flips).
- **Determinism:** no nondeterministic RNG, no wall-clock time calls. All
  randomness comes from `mulberry32(seed)`; all time comes from `requestAnimation
  Frame` timestamps and `audioCtx.currentTime`.

## References

- L. Diaz, R. Constanzo & M. Sandler, **"nlm: Real-Time Non-linear Modal
  Synthesis,"** arXiv:2603.10240 (2026).
- Jean-Marie **Adrien**, the modal-synthesis formalism (exciter → resonator
  bank of decaying sinusoids).
- Ernst **Chladni**, _Entdeckungen über die Theorie des Klanges_ (1787) — the
  nodal-line plate figures.

## What's not yet verified

- The modal ratios are plausible idealisations (Bessel/bar/plate textbook
  values), **not measured** from real instruments — timbres are in the right
  family but not calibrated to a specific gong or drum.
- The tension modulation and mode coupling are **parameter-automation
  approximations** of the true non-linear plate PDE. A per-sample AudioWorklet
  integrator (as in the nlm paper) would be more faithful, especially for very
  fast, energetic transients; here the model updates at frame rate (~60 Hz) and
  is smoothed onto the graph.
- The Chladni `(n,m)` assignment is a legibility mapping, not a physical
  eigenmode decomposition of the exact material — the figures read as "the sound
  reshaping" rather than being the literal eigenfunctions of that preset.
- No formal perceptual or spectral A/B validation (linear vs non-linear) has
  been run; the audible difference is asserted from the model design, not
  measured.
```
