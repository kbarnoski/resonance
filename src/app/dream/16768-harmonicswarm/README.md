# 16768-harmonicswarm

**Status**: demoable

## The question

What if Karel's real chord progression were the *rules of attraction* for a
living swarm — so the harmony he played literally decides whether tens of
thousands of GPU particles cohere into glowing filaments or scatter into churn?

## What it does

Tens of thousands of particles (default 12k, dialable to 6k / 16k) are split
into six species and simulated entirely on the GPU with raw WebGPU — a compute
shader steps the physics, and additive point-sprites are drawn into an
`rgba16float` trail buffer that a Reinhard pass tone-maps to the screen. There
is no three.js and no Canvas2D surface.

The behaviour of the swarm is governed by a 6×6 inter-species **attraction
matrix** — the classic "Particle Life" rule set, where each cell says how
strongly one species is drawn to (or repelled from) another. In this piece that
matrix is not random or hand-tuned: **it is rewritten every time the sounding
chord in Karel's recording changes.**

## Technique

- **Audio**: one of Karel's verified catalog tracks (Welcome Home / Snowflake)
  is fetched + decoded via `loadRealTrackBuffer`, played through a single
  `AudioBufferSourceNode` into `createSafeMaster(...).input` — the ear-safe
  master bus, never `ctx.destination`, never a synth or oscillator. Bass / mid /
  treble bands are read from `safeMaster.analyser` and drive velocity and
  micro-turbulence.
- **Harmony → matrix**: `loadTrackAnalysis(id)` returns a time-sorted chord list.
  Each frame the playback position is binary-searched for the sounding chord;
  `chordRoot` / `chordIsMinor` parse it into a triad pitch-class set and a
  **consonance scalar** c∈[0,1] (major/simple → high; minor, diminished,
  altered, and extended 7/9/11/13 symbols → low). High c writes a mostly-positive
  matrix with same-voice clustering and a directed root→third→fifth chain, so the
  species knit into filaments; low c flips weights negative and the field
  scatters. The matrix and the per-species palette (tinted by `pitchClassHue`)
  morph smoothly over ~0.7s so a chord change reads as a transformation.
- **Physics**: workgroup-tiled particle interaction (shared-memory tiles of 64)
  with a repulsive core to prevent collapse; velocity is friction-damped and
  speed-clamped. Pointer/drag adds a gravity well; opt-in device-orientation tilt
  adds a gentle drift. DPR is capped at 2; trail textures are rebuilt on resize.

## References

- Craig Reynolds — *Boids* (emergent flocking from local rules).
- Jeffrey Ventrella & Tom Mohr — *Particle Life* (asymmetric inter-species
  attraction matrices producing lifelike structure).
- Codrops — *"Run Rob Run"* music-reactive WebGPU goo (2026-08-20).
- SYTHM — strange-attractor audio visualizer.

## Honest limitations

- **Not** the lab's first GPU-compute particle physics — `16-particle-life-gpu`
  predates it. The honest first here is putting a **real sounding chord
  progression in the driver's seat of the inter-species attraction matrix**.
- Interaction is workgroup-tiled O(N²) (radius-culled), not a spatial-hash grid,
  so 16k on a weak integrated GPU may dip below 60fps — hence the 6k/12k/16k
  control.
- Consonance is a heuristic from the chord symbol, not a psychoacoustic model;
  slash chords and unusual voicings can read a little brighter or darker than an
  ear would.
- If a track has no public chord analysis, the swarm degrades gracefully to a
  neutral, gently-drifting matrix (a `text-destructive` notice explains why).
- Headless container has no GPU/audio, so this was verified by code + `tsc`, not
  by running the piece.
