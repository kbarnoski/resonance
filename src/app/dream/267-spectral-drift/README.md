# 267 · Spectral Drift

**"What if MY OWN MUSIC became a flowing river of light I drift through — where each frequency is a stream of glowing particles that ADVECTS and meanders forward through space as the song plays?"**

This is the **flowing-particle-field / advection** reading of "fly through your music" — the most atmospheric of three sibling explorations. Instead of a frozen wall of bins, the spectral content *drifts*: particles spawn at the far horizon carrying their frame's frequency + energy and advect forward (and meander laterally) so you fly through a living current of your music. Ikeda data-stream meets Anadol nebula.

## Concept

A large pool of additive `THREE.Points` (24,000) is arranged into a forward-flowing corridor you sit inside. There is exactly **one** `THREE.BufferGeometry` with a custom `ShaderMaterial` (additive blending, soft round gaussian sprite, per-point `position` / `color` / `aSize` attributes). All buffers are allocated **once**; each frame we rewrite only a contiguous *slice* of the arrays (a "sheet") and integrate every live particle's motion.

## The emission + advection model

### Emission (a fresh sheet per frame)
- The live FFT (`fftSize 4096`) is folded to **160 perceptual bins** with a power-law (`t² `) fold, so bass gets resolution rather than being crammed into the first couple of FFT bins.
- The pool is divided into `SHEETS = 200` emission slices (`POOL / SHEETS ≈ 120` particles/frame). A ring-buffer cursor `writeSheet` advances each frame, so we reuse the pool with **zero reallocation** and the freshly-written sheet always starts life at the far end.
- For each emitted particle: **bin → lateral X** (`(b/BINS)*2-1` across the corridor width) and **bin → hue**; **bin energy → brightness + point size + emission probability**. Quiet bins (`energy < ~0.06`) emit *nearly nothing* and are parked dark off-screen — so **silence reads as empty space ahead of you**, not a dim wall.

### Advection (the NSTR reframe — the whole point)
Every live particle, every frame:
- drifts **forward toward the camera** (`z += speed*dt`),
- **meanders laterally** through a cheap curl-like flow field:
  `vx += sin(y*0.07 + t*0.3 + z*0.02)*k*dt; vy += cos(x*0.06 - t*0.25 + z*0.02)*k*dt;`
  with light damping (`*0.985`) so velocities stay bounded — the streams **swirl and braid** as they travel rather than running on rigid rails.
- recycles to the far end once it passes the camera (`z > CORRIDOR_NEAR`), dimmed so recycled ghosts don't pile up.

Each particle keeps the hue/energy it was *born* with, so you fly through a record of the song that is gently deforming as it flows.

### The NSTR frequency-transport reframe (honest framing)
This borrows the **idea** from **NSTR — "Neural Spectral Transport Representation for Space-Varying Frequency Fields"** (arXiv [2511.18384](https://arxiv.org/abs/2511.18384), Nov 2025): that a spectrum is not a static stack but a *frequency field that flows / transports through space*. Our flow field embodies that reframe **aesthetically** — a hand-written sinusoidal pseudo-curl advection, *not* the neural transport model from the paper. It is an artistic borrowing of the "spectrum-as-transported-field" framing, not an implementation of NSTR.

## Audio-reactive mappings

| Signal | Mapping |
| --- | --- |
| **bin index** | lateral X position of the stream + base hue |
| **bin energy** | particle brightness, point size, and whether the slot lights up at all |
| **spectral centroid** (smoothed) | overall hue temperature — bass-heavy → deep violet/indigo; bright → cyan→rose; also biases per-particle hue |
| **total energy** | flow **turbulence** — busier/louder music swirls more |
| **spectral-flux onset** | burst of extra-bright + bigger particles, a forward **speed surge**, and subtle **camera shake** |
| **median inter-onset interval** | **BPM** readout, folded to 60–180 |
| depth | `FogExp2` into near-black so distant streams dissolve into the dark |

**Onset detection:** positive magnitude-delta sum across bins (spectral flux), adaptive threshold = `mean + 1.5·std` over a ~0.7 s (43-frame) window, with a ~100 ms refractory gate.

## Audio source (tri-modal — never silent)

1. **File drop / file picker** — `decodeAudioData` → looping `AudioBufferSourceNode` → `AnalyserNode`.
2. **Load a Resonance track by ID** — `fetch('/api/audio/<id>')`. Handles **both** a direct audio byte response **and** JSON `{ url: "..." }` (checks `content-type`, follows `.url` when present). Read-only; this prototype creates no API route. Lets Karel paste his real "Welcome Home" piano recordings.
3. **Synthesized demo fallback** — pressing Start with zero input runs a slow detuned-saw pad drone + periodic plucked pentatonic notes, so onsets fire and the river flows immediately for a reviewer who just clicks Start.

A visible **Start** button always appears first (audio needs a user gesture).

## Degradation

| Condition | Behaviour |
| --- | --- |
| No WebGL / context creation fails | Amber notice; **audio keeps playing** (engine sets `noWebGL`, still marks running) |
| Audio file fails to decode | `text-rose-300` message; previous audio (or demo) keeps flowing |
| Track-load by ID fails | `text-rose-300` message; falls back to the synthesized demo current so it's never silent |
| Window resize | Renderer + camera aspect updated live |
| Unmount | rAF cancelled, geometry/material/renderer disposed, listeners removed, demo oscillators stopped, source stopped, `AudioContext` closed |

## References
- **NSTR — Neural Spectral Transport Representation for Space-Varying Frequency Fields**, arXiv [2511.18384](https://arxiv.org/abs/2511.18384) (Nov 2025) — the frequency-as-transported-field reframe.
- **Ryoji Ikeda** — data-stream / data.flux aesthetic (dense, luminous data as moving fields of points).
- **Refik Anadol** — data-as-particle "machine hallucination" nebulas; the drifting-luminous-cloud look.

## Honest limitations
- The flow field is a hand-tuned trio of sines, **not** a true divergence-free curl-noise field — close-up you can occasionally see mild convergence/divergence rather than perfectly volume-preserving swirl.
- Advection runs on the **CPU** over 24k particles; on low-end hardware the per-frame loop can drop frames. The `dt` is clamped (≤ 50 ms) so it survives tab-stalls without exploding.
- Bin → energy is read from `getByteFrequencyData` (8-bit, post-smoothing), so it's perceptual rather than precise.
- Emission samples bins by sheet position rather than weighting by loudness, so very sparse spectra still scatter a few dark slots before gating them out.
- It's an *aesthetic* borrowing of the NSTR transport idea, not the neural model.

## Next-cycle deepening
- Swap the sinusoidal pseudo-curl for a **true curl-noise** field (3D simplex → analytic curl) for genuinely divergence-free, volume-preserving swirl.
- Move advection to a **GPU compute / ping-pong FBO** pass so the pool can grow to hundreds of thousands of particles.
- **Stereo split** — left/right channels advect on opposite sides of the corridor.
- **Per-bin streak trails** (motion-blurred line segments per particle) so each frequency reads as a continuous ribbon rather than discrete points.
