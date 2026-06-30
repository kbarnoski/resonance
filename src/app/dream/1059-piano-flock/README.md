# 1059 · Piano Flock

`state: psilocybin / cosmic drift · pole: cosmic-ambient`

## The one question

**What if you could *conduct* a luminous GPU particle flock with your hand/pointer,
and the flock's living emergent shape re-voiced Karel's *own* piano into a cosmic,
drifting psychedelic instrument?**

You move your pointer; the flock chases it like a school of light. The *shape* the
flock takes — how tight, how aligned, how fast, where its centre sits — is read
every frame and used to navigate a grain corpus carved out of Karel's real piano
recording. The flock is not decorated by the audio; the flock *is the instrument*.

## How the flock → piano mapping works

Each frame we compute four emergent statistics of the flock and feed them to a
CataRT-style concatenative granular synthesizer:

| Flock statistic | Musical meaning |
| --- | --- |
| **centroid.y** | target register — a high centroid voices high notes |
| **centroid.x** + **dispersion** | stereo position + stereo width of grains |
| **order / alignment** | just-intonation *lock*: a tight, aligned herd snaps target pitches onto a 7-limit JI scale (focused, consonant); a disordered flock leaves them freely detuned |
| **dispersion** | grain density, detune spread, shimmer — scattered = a wide cosmic cloud |
| **speed** | grain rate + target brightness |
| **sudden contraction** (falling dispersion while aligned) | fires an *onset burst* of grains — the flock "inhaling" becomes a chord-like attack |

For each grain we pick the corpus grain whose analyzed pitch + brightness best
match the flock-driven target (the concatenative *selection* step), retune it by
playback rate toward the just-intonation target, and play it through a
raised-cosine gain envelope and a stereo panner. Everything sums into a master
bus → a cosmic convolution reverb (algorithmic decaying-noise IR) → a
`DynamicsCompressor` limiter → destination. Master gain follows flock energy, so
idle drift is quiet and active conducting is present.

The grain corpus itself is built by slicing the piano buffer into ~220 ms
overlapping windows and tagging each with a rough autocorrelation pitch (MIDI/Hz),
RMS loudness, and a zero-crossing brightness proxy.

## WebGPU / Canvas2D fallback split

- **Primary — WebGPU compute.** A WGSL compute pass (`@workgroup_size(64)`)
  implements Reynolds' three rules + the pointer attractor over storage buffers,
  ping-pong double-buffered between two boid buffers each frame. A second WGSL
  pass renders each boid as an additively-blended glowing quad sprite
  (`srcFactor: one, dstFactor: one`). Emergent statistics are read back from the
  written buffer on a ~12 Hz cadence via `mapAsync` (downsampled on CPU). ~14 000
  boids.
- **Fallback — Canvas2D CPU flock (required).** Detected when `navigator.gpu` is
  absent or WebGPU init fails at runtime. A spatial hash gives O(n) neighbour
  queries; the *same* three rules + attractor + idle swirl run on ~2 400 boids,
  feeding the *same* audio mapping. Rendering uses a translucent dark wash (motion
  trails) plus `globalCompositeOperation = "lighter"` additive points with a
  warm→cool cosmic-drift hue band and a glowing attractor cursor. This is the
  demo-on-any-device path and is meant to be genuinely beautiful, not a stub.

A fresh `<canvas>` element is mounted per substrate (React `key`) because a canvas
permanently locks to its first context kind; if WebGPU init throws after the
context is taken, we remount cleanly into the Canvas2D path.

## Named references

- **Craig Reynolds, *Boids* (1987)** — cohesion / alignment / separation; the
  emergent-flock model both substrates implement.
- **Diemo Schwarz — CataRT / corpus-based concatenative synthesis.** "The
  Concatenator" (arXiv 2411.04366) and MACataRT (arXiv 2502.00023) frame
  concatenative synthesis as an *agent navigating a corpus of grains*. Here the
  flock's emergent statistics ARE that navigating agent.
- **The WebGPU canonical "Compute Boids" sample** — the structural model for the
  WGSL storage-buffer ping-pong used in the GPU path.
- `_shared/psych/logpolar.ts` (Bressloff–Cowan / Klüver form constants) is
  available for an optional log-polar bloom warp; left as a next-cycle hook to
  keep the focus on flock + piano.

## Known limitations

- WebGPU and Web Audio cannot be exercised in this headless container, so the GPU
  compute path, the per-frame stat readback timing, and the audibility of the
  granular mapping are **type-checked and lint-clean but not runtime-verified**.
  TypeScript (`tsc --noEmit`) and `next lint` on this folder are both clean.
- Pitch estimation is monophonic autocorrelation; on dense piano chords the
  per-grain pitch tag is approximate — acceptable for register-level retrieval.
- GPU stat readback is ~12 Hz and one frame behind; fine for musical control,
  not for sample-accurate triggering.
- The convolution reverb IR is generated, not measured — a cosmic wash rather than
  a real room.

## Next-cycle deepening

- Route the additive point render through `cortexToScreen` (log-polar warp) so the
  flock blooms into tunnels/spirals at high dispersion — psychedelic geometry that
  tracks the same statistics already driving the audio.
- Replace the per-grain nearest-pitch selection with a true kNN over the full
  descriptor space (pitch, brightness, RMS) and a kd-tree, closer to MACataRT's
  agent navigation, with grain-to-grain concatenation cost for smoother lines.
- Multiple sub-flocks (split by a long-press) → polyphonic counterpoint, each
  sub-flock voicing an independent line of the same corpus.
- **(Folded from the de-selected sibling `piano-current`, a curl-noise flow-field
  take on the same concept — cycle 604 DEEP):** close the loop by feeding the
  audio's own RMS back into the simulation so the music subtly re-conducts the
  flock in return; and detect *confluence events* (two clusters merging / a sudden
  contraction between two sub-flocks) to trigger a deliberate two-grain harmonic
  interval rather than a statistical average — a real harmonic event instead of an
  emergent texture.
