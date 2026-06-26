# 954 · Sync Bloom

**What if a CHORD could GROW itself?** Instead of looking harmony up from a
chart, you grow it: a field of hundreds of phase-coupled oscillators runs on the
GPU, and when you nudge them they spontaneously phase-**lock** into clusters —
and each locked cluster becomes a real consonant pitch. So the chord you hear is
literally the field reaching consensus.

This is the lab's first **Kuramoto coupled-oscillator synchronization** piece,
and a direct answer to two standing critiques: the heavy work runs on **raw
WebGPU compute (WGSL `@compute`)**, not three.js; and real **harmony** is the
playable idea, not a deliberately-dumb drone.

## The mechanism (the soul of the piece)

The **Kuramoto model**: N oscillators (here N = 1024, a 32×32 field), each with a
phase θ and a natural frequency ω. Every step:

```
dθ_i/dt = ω_i + (K/N) · Σ_j sin(θ_j − θ_i)
```

Using the mean-field identity `r·e^{iψ} = (1/N)·Σ_j e^{iθ_j}` (the **order
parameter** r ∈ [0,1], the degree of sync) this collapses to

```
dθ_i/dt = ω_i + K_i · r · sin(ψ − θ_i)
```

— O(N) per step instead of O(N²). When coupling K is high enough relative to the
spread of natural frequencies, sub-populations spontaneously **phase-lock**. That
locking is, physically, what musical consonance *is*: simple frequency ratios
phase-lock; dissonance never settles and beats.

### On the GPU

The integration is a raw WGSL `@compute` shader on storage buffers:

1. **reduce pass** — a tree reduction folds the field into per-workgroup partial
   sums of (cos θ, sin θ); the CPU folds those into the order parameter (r, ψ).
2. **advance pass** — every phase steps toward the mean field using (r, ψ) cached
   from the previous frame's fold.
3. **render pass** — instanced glowing points; hue encodes phase, brightness and
   bloom scale with r.

**Harmony readback:** every few frames we async `mapAsync` the phase buffer back,
bin phases into a histogram, detect phase-locked **clusters** (peaks above an
r-scaled density threshold), and snap each cluster's effective frequency to the
nearest **just-intonation** partial of a slowly drifting root
(1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2). The set of currently-locked clusters = the
current chord.

### Sound

Each locked partial is voiced as a warm **additive** tone (sine fundamental + a
quiet triangle octave-partial for body) with a gentle **FM** vibrato, over a root
drone bed. As coupling rises more clusters lock and the chord fills in toward
consonance; as it falls, voices thin to a hum. **Not** granular, **not** samples
— pure synthesis. Master chain: gain ≤ 0.24 → lowpass ~7 kHz → DynamicsCompressor
→ destination, so it can never get harsh.

### Interaction

- **Pointer brush** — dragging across the field drips coupling K into a soft
  circular region (`brushKLocal`), so you scribble energy in and watch that patch
  crystallize into sync and hear its pitch lock.
- **Global K slider** — low K → scattered, beating, unresolved; high K → clusters
  lock and the chord resolves.
- **Autonomous breathing** — K self-modulates on a slow sine, so an idle glance
  still sees and hears the field self-organize within ~1 s.

## Visual

A luminous, bioluminescent phase-field: each oscillator a glowing point whose hue
encodes its phase, so phase-locked clusters read as coherent colour-bands blooming
out of noise; the global order parameter drives overall bloom and contrast. Aiming
for Ikeda precision warmed by Anadol flow — and deliberately *not* a cosmic
nebula. The emerging consonance is visible sound-off.

## Tags

- **INPUT:** pointer-couple (autonomous + pointer brush)
- **OUTPUT:** raw-WebGPU `@compute` (WebGL2 + CPU fallback)
- **TECHNIQUE:** Kuramoto coupled-oscillator synchronization → emergent
  just-intonation harmony
- **VIBE:** luminous self-organizing sync-field

## How it degrades

- **No WebGPU** → a hand-written **WebGL2** render pass running the *same*
  Kuramoto math on the CPU (`kuramoto.ts::cpuStep`), plus a `text-rose-300`
  notice. Phase data lives CPU-side here, so chord readback is free.
- **No WebGL2** → a rose error notice (no third Canvas2D path was built; WebGL2 is
  effectively universal).
- AudioContext is created and resumed inside the Start gesture; full teardown on
  unmount (oscillators stopped, rAF cancelled, audio closed, GPU buffers
  destroyed and context unconfigured).

## References

- **Y. Kuramoto (1975)** — the coupled-oscillator model of collective
  synchronization.
- **Steven Strogatz, *Sync* (2003)** — the popular synthesis of synchronization
  phenomena.
- **"Kuramoto oscillatory Phase Encoding" (KoPE), arXiv 2604.07904 (2026)** — the
  deep-learning revival of Kuramoto sync that prompted re-reading synchronization
  as a generative primitive.

## Honest warts

- The cluster→JI mapping is a **heuristic** (phase-bin density + nearest-ratio
  snap over a normalized ω→pitch map), so the exact voicing wanders and isn't a
  rigorous spectral analysis. It reads as "the field choosing a chord," which is
  the intent, but a musicologist would call it impressionistic.
- The GPU order parameter **lags one frame** behind the advance pass (we fold it
  asynchronously to avoid stalling the pipeline). Harmless at these timescales but
  not physically exact; the CPU/WebGL2 path is exact since it reduces inline.
- Coupling is **mean-field** (effectively all-to-all via the order parameter), not
  a sparse adjacency `A_ij`. The brush biases coupling spatially via a per-
  oscillator multiplier, and the natural-frequency layout is spatially smooth so
  locked clusters are contiguous colour-bands — but it is not a true local-
  topology Kuramoto network.
- Pointer→grid mapping ignores the shader's aspect/0.94-margin transform, so the
  brush is a few percent off near the edges on non-square viewports.
