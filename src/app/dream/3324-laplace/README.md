# 3324 · Laplace Groove

**One question:** What if building a stable 3-body Laplace resonance chain WAS composing a groove — and letting real gravity run could tear it apart?

A star and exactly three worlds. You tune the three orbital periods trying to
reach the **4:2:1 Laplace chain** — the orbital-period lock of Jupiter's moons
Io, Europa and Ganymede, and the backbone of the seven-world TRAPPIST-1 system.
Each world strikes a percussive voice at perihelion. When the three lock into
4:2:1, the strikes interlock into a self-sustaining nested polyrhythm (4 : 2 : 1
hits per outer period). When mistuned, they stumble into arrhythmia. A prominent
**Release gravity** control lets a first-order three-body perturbation actually
run: a locked chain survives and keeps its groove; a mistuned one drifts, the
resonance argument circulates, and one world eventually destabilizes and is
ejected — its voice bends up, screeches, and dies.

**Composing the groove = finding the lock. Releasing gravity on a wrong tuning
tears it apart.**

## The Laplace argument (the mechanism)

The lock is governed by the **Laplace argument**

```
φ_L = θ₁ − 3·θ₂ + 2·θ₃
```

built from the three mean longitudes θᵢ. In a true 4:2:1 resonance the mean
motions satisfy `n₁ − 3·n₂ + 2·n₃ ≈ 0`, so φ_L does not drift — it **librates**
around 180°, rocking inside a potential well. Mistune the chain and φ_L instead
**circulates**, sweeping through every angle. The on-screen dial visualizes this
directly: the needle spins when unlocked and rocks about the 180° mark when
locked.

### How the sim runs (real-feeling but cheap)

- Kepler: period `T ∝ a^(3/2)`, mean motion `n = 2π/T`; mean longitudes advance
  each frame. A world strikes when its longitude crosses the perihelion
  reference direction.
- `proximity` (0–1) measures how near the two period ratios are to 2:1.
- A damped-pendulum **restoring torque** on φ_L (toward 180°), gated by
  proximity, is distributed onto the worlds along the `(1, −3, 2)` weights. Faint
  before release (the resonance "well"), it strengthens as gravity is released.
  A near-locked tuning is **captured** into exact resonance and holds — why the
  real Laplace chain is stable.
- When mistuned **and** released, that torque is ~0; instead a secular
  divergence pushes the worlds apart, `instability` accumulates, and past a
  threshold the least-stable (most-detuned) world is ejected.

It is not scientifically exact: it is tuned so a lock **reads** as "holds &
grooves" and a mistuned release **reads** as "drifts & falls apart."

## Audio (rhythm-first, generative)

- Each world = a percussive mallet voice struck at every perihelion passage. The
  interlocking of the hits **is** the music. Locked 4:2:1 → a clean nested
  polyrhythm; mistuned → stumbling.
- Each world also holds a quiet sustained undertone whose pitch is derived
  **continuously** from its orbital frequency (`log(period) → pitch`), never
  quantized to a comfort scale — the pitch is the physics. (In a 1:2:4 lock the
  undertones fall an octave apart, which is why a locked chain also sounds
  consonant.)
- Ejection: that world's undertone bends up, a noise screech rises, and the voice
  fades over ~2s; the groove loses its layer.
- Master: light convolver reverb + feedback delay for a warm cosmic space.

## Render

Fullscreen three.js (WebGL) — a warm star, three emissive violet/magenta worlds
with fading trail ribbons on a low cinematic angle, and the φ_L dial floating
above the system. WebGL is feature-detected; without it the piece shows a
`text-destructive` notice instead of crashing. Renderer, geometries, materials
and the AudioContext are all disposed on unmount.

## Reference

The idea of hearing orbital resonances as music is central to **Matt Russo and
SYSTEM Sounds** (system-sounds.com), whose sonifications of the Galilean moons
and the resonant chain of **TRAPPIST-1** turn celestial mechanics into rhythm and
harmony. This prototype is a playable homage to that idea — you don't just listen
to a resonance, you compose one.

## Next-cycle deepening

- Real eccentric orbits with true (not mean-anomaly) perihelion timing.
- The full TRAPPIST-1 ladder — a longer resonant chain to tune (8:5:3 …).
- Libration amplitude driving reverb depth and pad brightness.
- A proper resonance-argument phase portrait (φ_L vs dφ_L/dt) beside the dial,
  so capture into the well is visible as a spiral collapsing to a point.
