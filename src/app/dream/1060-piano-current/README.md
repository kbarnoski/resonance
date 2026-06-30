# 1060 · piano-current

**Stir a luminous river of thousands of particles flowing through a
divergence-free noise field with your hand — and where the flow pools,
accelerates and braids, it re-voices Karel's own piano into a cosmic drift.**

`state: meditative cosmic drift · pole: cosmic-ambient`

## How to play it

1. Press **Stir the current**. This gesture starts the AudioContext and loads
   Karel's piano (or the offline felt-piano fallback) into a grain corpus.
2. **Move / drag your pointer or finger** across the canvas to *stir*. The cursor
   injects a swirling vortex into the flow; the rotation sign follows the
   direction of your gesture and decays when you lift off.
3. Listen. The piece is **quiet and near-still when idle** — it is an
   instrument, not a screensaver. It only sings when you stir it:
   - a **coherent current** rings focused, JI-locked grains,
   - **turbulence near the cursor** opens a detuned bright shimmer cloud,
   - a **forming pool** swells a sustained pad,
   - a **sudden stir** fires an onset burst,
   - two **merging vortices** fire a deliberate harmonic fifth (a *confluence*),
   - **idle** drops to a sparse twinkle.
4. **Drag-drop any audio file** onto the canvas to swap the grain corpus and
   re-voice the river with your own sound.

## Technique

### Curl-noise flow field (`flow.ts`)

Particles are advected through a 2D velocity field that is the curl of a scalar
*stream function* ψ:

```
v = ( ∂ψ/∂y , −∂ψ/∂x )
```

Taking the curl of a potential guarantees `∇·v = 0` exactly — the field is
**divergence-free**. Physically this means it has **no sources or sinks**:
particles are never created or destroyed, so the flow can only swirl, braid and
pool. This is the Bridson et al. construction.

ψ is built from **~2 octaves** of dependency-free gradient (Perlin-style) noise.
We evaluate the curl with central finite differences, and evolve ψ along a
**slowly drifting 3rd noise axis** so the river keeps breathing even when no one
is stirring it. Particle positions wrap toroidally, which keeps the frame full
without introducing visible boundary sources.

The **stir** adds a local rotational vortex term `(-dy, dx)·strength` with a
Gaussian falloff around the cursor; `strength`'s sign is the gesture's rotation
direction and it **decays each step** unless you keep stirring.

**Audio → flow feedback:** the instrument's smoothed output RMS gently scales
ψ's amplitude, so the river visibly *breathes with its own sound*.

### Flow-stats → CataRT mapping (`instrument.ts`)

Each step the field reports emergent stats — `meanSpeed`, directional
`coherence`, near-cursor `vorticity`, `poolDensity`, energy centroid
`(energyX, energyY)`, and a `confluence` flag. At ~30 Hz these become **target
descriptors** for corpus-based concatenative synthesis (CataRT): we select the
grain whose pitch + brightness best match the target and play it as an
`AudioBufferSourceNode` slice through a raised-cosine `GainNode` envelope and a
`StereoPannerNode` (panned to where the on-screen energy is), into a master
`DynamicsCompressor` limiter → destination.

| Emergent flow state | Target descriptor / gesture |
| --- | --- |
| mean speed + coherence | focused grains, pitch locked to a JI pentatonic |
| high vorticity / turbulence near cursor | brighter target, random detune, more grains |
| forming pool (high local density) | longer grains, slower rate → sustained pad |
| sudden stir (large input delta) | onset burst |
| idle (no stir, low speed) | sparse twinkle |
| two vortex lobes merging (confluence) | a deliberate two-grain fifth |

The flock-of-particles *is* the agent navigating the corpus — the river decides
what to play.

## Output / constraints

- **Canvas2D only** — deliberately not WebGL / WebGPU / a fragment shader, so it
  runs on every device and is fully verifiable. Additive `lighter` particle
  streaks colored **violet→cyan→gold** by speed, over a per-frame semi-transparent
  indigo wash (ghost trails — never cleared to pure black).
- **Web Audio API only.** No new npm dependencies.
- ~3,200 particles.

## Graceful degradation

- **No piano network / fetch failure / decode error:** `fetchPianoBuffer` returns
  null and we render the `renderFallbackBuffer` felt-piano with an
  `OfflineAudioContext`, so the grain corpus always has real harmonic +
  percussive content. The notice turns **amber** ("synth piano (offline)")
  instead of emerald ("♪ Karel's piano") — never a dead screen.
- **Touch:** pointer events are used throughout, so stir works on touch devices.
- **Audio blocked:** all audio is gated behind the Start gesture; a clear error
  message appears and the user can retry.
- **Unmount:** rAF, all audio nodes, and the AudioContext are fully torn down.

## Named references

- Robert Bridson, Matthias Müller-Fischer et al., *Curl-Noise for Procedural
  Fluid Flow*, SIGGRAPH 2007.
- Diemo Schwarz, *CataRT* / corpus-based concatenative synthesis, DAFx 2006.
- *The Concatenator* (arXiv:2411.04366) and *MACataRT* (arXiv:2502.00023) —
  corpus navigation framed as an agent.

## Next-cycle deepening

- Spectral-flux onset detection on grains for tighter rhythmic re-voicing.
- A second, counter-rotating ψ layer so braids cross and form true vortex
  streets.
- Pitch-grid quantization that follows the dominant register of the current
  pool, so the harmony drifts as the river reshapes.
- Per-grain convolution reverb send keyed to pool size (bigger pool → longer
  tail) for a deeper sense of cosmic space.
- Multi-touch: one vortex per finger, so two hands can braid two currents into a
  duet.
