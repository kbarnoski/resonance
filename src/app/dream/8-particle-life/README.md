# /dream/8-particle-life — design notes

## What question does this ask?

Can an audio-reactive system produce complex collective behavior that nobody
explicitly programmed? And can a Resonance journey reshape that behavior mid-song?

## How it works

**Particle Life** (Jeffery Ventrella / lenia-adjacent) is deceptively simple:
- N particles, S species
- A random S×S matrix: `matrix[i][j]` = attraction (+) or repulsion (−) of
  species i toward species j (−1 to +1)
- For each particle, sum weighted forces from all others within radius R_MAX.
  Inner repulsion zone (R_MIN) prevents collapse.
- Apply friction, advance positions with toroidal wrap.

No explicit flocking rule, no goal, no predator/prey logic. The behaviors
emerge purely from the matrix. Common emergent patterns:
- **Clusters**: species attracted to itself, ignored by others
- **Predator-prey spiral**: A chases B, B chases C, C chases A
- **Orbiting pairs**: strong mutual attraction + repulsion at close range
- **Worms/chains**: species attracted ahead, repelled behind
- **Explosions**: all mutual repulsion, particles scatter

## Audio integration

Six species map 1:1 to Resonance's six frequency bands (sub-bass → high). Two
coupling mechanisms:

1. **Velocity noise**: each frame, energy from band `i` injects random velocity
   perturbation into species `i` particles. Louder band = more turbulent species.
   This creates visible texture differences between quiet vs. loud frequencies.

2. **Onset → reshuffle**: when the mic detects a percussive transient (kick,
   snare, piano hit), the attraction matrix is randomized. The particles
   re-organize into a completely different emergent pattern, mid-song, instantly.
   2.5s cooldown prevents double-fires.

## Performance notes

900 particles × O(N²) brute-force with early exit (~8% of pairs within R_MAX).
Effective inner-loop iterations: ~900 × 900 × 0.08 ≈ 64k full computations
+ ~730k early exits. At V8 JIT speeds this runs in ~2–5 ms/frame, leaving
comfortable headroom at 60fps.

`Float32Array` typed arrays avoid GC pressure in the hot loop.

## What to try next

- WebGPU compute path (50k+ particles) — possible now that 70% of browsers support it
- Let Karel drag matrix cells (slider per cell) to sculpt behavior by hand
- Show a force-graph overlay: colored arrows showing which species attract which
- "Freeze" mode: lock the matrix at a beautiful moment and let the particles
  reach equilibrium before reshuffling
- Map matrix cells to MIDI CCs for live performance control of emergent behavior
