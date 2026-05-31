# 223 — Fourier Paint

**Route**: `/dream/223-fourier-paint`  
**Cycle**: 257 (2026-05-31, adult build)  
**Status**: demoable

Draw any closed shape. The Discrete Fourier Transform decomposes the path into N rotating arms (epicycles), each at a different frequency. The tip of the chain traces your shape while additive synthesis sounds each epicycle's harmonic — so the *shape of the drawing* determines the *timbre of the tone*.

## The math / why it's surprising

Every closed curve can be written as a sum of rotating circles:

```
z(t) = Σ_k  c[k] · exp(2πi·k·t/N)
```

Each `c[k]` is a complex Fourier coefficient. Its **magnitude** = the radius of epicycle k. Its **argument** = the initial angle. The chain of epicycles, each rotating at a different rate, traces out the original shape.

The same coefficients map directly to audio: epicycle k plays a sine tone at `k × 55 Hz`. The amplitude is `|c[k]|` (normalized). So:

- **A circle** → only k=1 dominant → pure 55 Hz sine tone  
- **A square** → k=1, 3, 5, 7... dominant (odd harmonics) → sounds like a square wave  
- **A star with N points** → k=1 and k=N dominant → fundamental + Nth harmonic  
- **An asymmetric scribble** → many harmonics → buzzy, complex timbre  

The Terms slider lets you hear the Fourier series approximation: at Terms=1 you get a pure tone and a circle; at Terms=64 the path reconstructs faithfully and the timbre is rich.

## Interaction model

1. **Draw shape** → freehand stroke on canvas (mouse or touch)  
2. **Animate + sound** → DFT computed (O(N²), N=256, ~3ms); epicycle chain starts rotating; audio begins  
3. **Terms slider** → live: adjusts how many epicycles spin + how many harmonics play. Slide from 1 to 64 to hear the harmonic series build up  
4. **New shape** → draw again; **Clear** → return to idle  

## Technical notes

- **DFT**: complex input z[n] = (x[n] + i·y[n]) centered on path centroid. N=256 resampled points.  
  `c[k] = (1/N) Σ_n z[n] · e^{−2πikn/N}`. Sorted by |c[k]| descending; top 64 kept.
- **Path normalization**: drawn path is arc-length resampled, centered, then scaled to 36% of the smaller canvas dimension. Ensures the animation always fits onscreen regardless of how large or small the user drew.
- **Audio**: each non-DC epicycle (k > 0, k × 55 Hz ≤ 14 kHz) → a sine OscillatorNode at k × 55 Hz. Individual gain = `amp_k / Σ_active amp`. Master gain = 0.32. WebAudio `setTargetAtTime` provides smooth gain transitions on slider changes.
- **Trace buffer**: ring buffer of 2 × RESAMPLE_N tip positions → the purple path builds up over time, converging to the original shape as the trace completes one full revolution.

## What's new in the prototype space

223 prior prototypes use audio as *input* (mic → viz) or *output* (synthesis → viz). This is the first where **a geometric drawing IS the audio program** — the shape fully specifies the harmonic spectrum. It's the reverse direction of `13-piano-canvas` (music → painting) and `219-waveshape-draw` (1D waveform → sound). Here: 2D closed path → 2D epicycle decomposition → harmonic tone.

Inspired by 3Blue1Brown's Fourier series visualization (YouTube, 2019) and the general Fourier epicycle tradition in mathematical visualization. The browser implementation here is novel in coupling the visual epicycle animation directly to real-time Web Audio synthesis.

## Polish ideas for future cycles

- **Shape library**: pre-drawn shapes (circle, square, triangle, heart, star) so the user can compare timbres without drawing  
- **Spectrogram strip** below canvas showing the live harmonic spectrum as the terms slider moves  
- **Phase coloring**: each epicycle arm colored by its frequency (violet=low, red=high), matching `1-live` palette  
- **Mic mode**: record a mic signal's time-domain buffer as the "shape", then decompose it — the circular path becomes the waveform  
