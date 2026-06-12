# Motion Loom — design notes

**Route**: `/dream/545-motion-loom`
**Cycle**: 2 of `514-polytempo-loom`
**Status**: demoable
**Input**: camera optical-flow / frame-difference motion energy, NO ML
**Output**: three.js WebGLRenderer — five glowing woven threads
**Zero ML · Zero API · No deps added**

---

## The one question

> "What if the MOTION IN A ROOM conducts a Nancarrow polytempo canon — the left side
> of the camera and the right side each carry their own moving rhythm, extracted with
> NO machine learning, just optical motion energy — and because two real-world motions
> never lock to a clean tempo ratio, the canon drifts forever and cannot be made to agree?"

---

## The idea + Nancarrow lineage

Conlon Nancarrow's *Studies for Player Piano* — especially Study No. 40 "Transcendental"
(a two-voice canon at the ratio e:π) and his √2 canons — established that irrational tempo
ratios produce canons that "probably never align" (Kyle Gann, ganntrax.com). Because both e
and π are transcendental, their ratio has no rational period; the voices approach each other
at 3:30 in the score, only to drift away permanently.

Motion Loom takes this further: the tempo ratio is not fixed at design time. Instead, two
"conductors" are extracted in real time from the room itself — left-half and right-half
camera motion energy. Each conductor's BPM is derived via autocorrelation of its motion-energy
signal over a ~6-second window. Because real human motion is not metronomic, the ratio B/A
varies continuously and essentially never forms a clean rational number. The canon drifts
for reasons that are physical, not mathematical — the room cannot keep steady time.

Five voices are driven by the two conductors:

| Voice | Conductor | Sub-ratio | Approximate function |
|-------|-----------|-----------|----------------------|
| 0 | A (left)  | ×1       | base tempo A |
| 1 | A (left)  | ×1/√2    | sub-beat of A (irrational) |
| 2 | B (right) | ×1       | base tempo B |
| 3 | B (right) | ×1/φ     | sub-beat of B (golden ratio) |
| 4 | B (right) | ×φ/2     | composite of B |

Even if A and B happened to momentarily align, the sub-ratios within each conductor group
(1/√2 and 1/φ) are mutually irrational and irrational against the base. Alignment is
structurally impossible by the same argument as Nancarrow Study 40.

---

## No-ML motion → tempo method

### Subsystem 1: Motion extraction (frame-difference energy)

`getUserMedia({video:true})` streams into a hidden `<video>`. Each frame, the video is drawn
downscaled (64×48) into a hidden offscreen `<canvas>` (analysis only — never rendered) and
pixels read via `getImageData`. For each pixel, luma is computed as `0.299R + 0.587G + 0.114B`.
The absolute luma difference vs the previous frame is accumulated separately for the left half
(x < 32) and right half (x ≥ 32), then normalized to [0,1]. This produces one motion-energy
scalar per half per frame — no neural network, no MediaPipe, no WASM.

### Subsystem 2: Tempo extraction by autocorrelation

For each half, a ring buffer of ~360 samples (~6s at 60fps) accumulates the motion-energy
signal. The signal is mean-subtracted, then the autocorrelation is computed for all lags in
the plausible tempo band (period 0.35–1.5s → 40–170 BPM). The lag with the peak autocorrelation
value is taken as the dominant period; the BPM is `60 / period_seconds`. A first-order
exponential smoother with τ=1.5s prevents jitter. The BPM is never quantized — it stays
continuous so the two halves' tempi form an irrational ratio by default.

This is the classic onset/tempo-induction self-similarity method (autocorrelation of a
feature function), applied here to optical motion rather than audio onset energy.

### Ghost motion (auto-demo)

On load, before any camera permission, two simulated "ghost conductors" inject synthetic
motion-energy at incommensurate rates: A ≈ 72 BPM (left), B ≈ 72×√2 ≈ 101.8 BPM (right).
The ghost is a compound sinusoidal signal rich enough for the autocorrelator to find a peak.
Audio plays after the Start gesture; before Start, the threads weave using `performance.now()`.
When real camera motion is detected, the room takes over. After 4s of no motion, ghost resumes.

---

## three.js loom renderer

Five `THREE.Line` objects with `BufferGeometry` serve as the threads. Each frame, all 201
positions per thread are recomputed as sinusoidal waves in XYZ, phase-driven by the voice's
running BPM — so threads that share a tempo are synchronized, while threads on different
conductors drift. The visual drift IS the tempo drift: watching the threads weave is watching
the phase relationship evolve.

Beat-onset events spawn `NodePulse` objects — each is a glowing sphere that rises quickly
(5ms) then decays over ~1.8s. A pool of `MAX_NODES_PER_VOICE × N_VOICES = 160` pre-allocated
`THREE.Mesh` objects is reused each frame; no GC pressure from new allocations. The camera
performs a slow orbit (period ~90s) so depth reads. The palette is Ikeda-clinical:
violet / blue / emerald / cyan / purple on near-black (#020208).

A plain `WebGLRenderer` (NOT WebGPU, NOT Canvas2D) is used throughout. The offscreen pixel
sampling canvas is hidden — only the three.js canvas is visible.

---

## Audio design

- **Scheduler**: Chris Wilson "A Tale of Two Clocks" (2013) — `setInterval` 25ms, 120ms
  lookahead into `AudioContext.currentTime`, sample-accurate note scheduling.
- **Pitch set**: D pentatonic across 2 octaves (D4–B5). Zero harmonic tension; every pitch
  combination is consonant. Drama lives entirely in metric drift.
- **Timbre**: sine fundamental (decay ~1.6s) + inharmonic partial at 2.756× fundamental
  (decay ~0.7s) = bell/kalimba character.
- **Master bus**: `GainNode → DynamicsCompressor` brick-wall limiter (20:1 ratio, −12 dBFS
  threshold, 3ms attack, 150ms release) → destination.
- **iOS unlock**: `AudioContext` created inside the Start click handler.

---

## References

- Conlon Nancarrow, *Studies for Player Piano* — tempo canons at irrational ratios.
  Study No. 40 "Transcendental" (e:π) — Kyle Gann: "probably never aligns"
  (ganntrax.com annotated catalogue).
- Ryoji Ikeda — data/grid clinical aesthetic; the visual register targets his
  near-monochromatic precision.
- Classic onset/tempo-induction by self-similarity (autocorrelation of feature function),
  applied here to optical motion energy rather than audio.

---

## What's unverified

1. **Autocorrelation on real motion**: The autocorr will find a BPM even for nearly-random
   motion; whether the extracted "tempo" is musically meaningful depends on the room.
   Low-motion scenes (still room) fall back to ghost correctly, but moderate-motion scenes
   may yield erratic BPMs until the 6s buffer fills.
2. **three.js line width**: `linewidth` > 1 is not supported on WebGL (only WebGL2 / some
   drivers). Lines will render at width 1 on most platforms.
3. **Node pool mesh reuse**: Pool indices wrap around when more than 160 nodes are active
   simultaneously. At very fast tempos (170 BPM × 5 voices) this could cause visual
   artifacts (older pulses snapping to new positions).
4. **iOS Safari AudioContext**: Standard iOS WebAudio gesture-unlock pattern used, untested.
5. **Autocorr performance at 60fps**: The O(n²) autocorr over 360 samples runs every video
   frame. At 60fps this is ~21M multiplications/s — fine on desktop, may cause frame drops
   on very low-end mobile. The BPM estimate could be batched to every 5th frame if needed.
