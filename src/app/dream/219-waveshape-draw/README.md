# 219 — Waveshape Draw

**Route**: `/dream/219-waveshape-draw`  
**Cycle**: 253 (2026-05-30)  
**Status**: `demoable`  
**Tags**: audio synthesis, Web Audio, interactive, zero deps, zero permissions

---

## The question

What if you could sculpt a sound the way you sculpt a curve — by drawing it?

## What it does

- A canvas shows one complete period of a waveform (X = time, Y = amplitude ±1).
- Drag any finger or mouse across the canvas to redraw the waveform.
- A continuous oscillator plays the drawn waveform in real time via `AudioContext.createPeriodicWave`.
- The timbre changes live as you draw: round → sine-like. Angled → triangle. Jagged → buzzy/rich.
- Below the waveform: a 32-bar harmonic chart shows the relative strengths of each partial.
- Violet = drawn waveform. Amber = actual oscillator output (from AnalyserNode) overlaid on top.
- Presets: Sine, Square, Triangle, Sawtooth — each loads instantly and plays its classic timbre.

## Technical architecture

### Waveform → timbre via DFT

`createPeriodicWave(real, imag)` accepts Fourier series coefficients, where:
- `real[n]` = cosine amplitude of the n-th harmonic
- `imag[n]` = negative-sine amplitude of the n-th harmonic

The drawn waveform (128 sampled points) is converted via a real DFT:

```
real[n] = (2/N) × Σₖ wave[k] × cos(2π·n·k/N)
imag[n] = (2/N) × Σₖ wave[k] × −sin(2π·n·k/N)
```

This is 128 × 64 = 8,192 iterations — runs in ~0.3ms. Throttled to ~30fps on pointer move.

### Rendering

Single RAF loop reads from refs (no React re-renders during drawing):
- Top 62% of canvas: waveform zone
- Next 28%: harmonic bar chart (colored with 1-live frequency→hue palette)
- Bottom 10%: pitch label + harmonic count label

The amber analyser overlay on the waveform zone is the browser's actual output — it should closely match the drawn waveform, confirming that the DFT→PeriodicWave pipeline is faithful.

### Drawing

Pointer events write amplitude values into a `Float32Array[128]`:
- X position → sample index
- Y position → amplitude (center = 0, top = +1, bottom = −1)
- Between events: linear interpolation fills gaps from fast drags

## Design notes

This is the inversion of `20-scope` (which shows audio as a waveform) — here you draw a waveform and hear it as audio. Karel's love of `153-paint-compose` ❤️ signals that the drawing-as-music axis is promising; this prototype explores the same axis from the other direction (drawn shape → synthesized timbre rather than played notes → painted canvas).

The harmonic chart is educational: a sine shows only harmonic 1. A square shows odd harmonics only (1, 3, 5, 7...) at decreasing amplitudes (1/n). A sawtooth shows all harmonics. Drawing a jagged waveform populates many harmonics, producing a buzzy/metallic timbre.

## What's genuinely new

1. **First timbre-drawing prototype.** 218 prior prototypes visualize audio as light. This is the first where you draw light (waveform shape) and it becomes audio timbre.
2. **DFT as the bridge.** The Fourier transform in both directions: audio → spectrum (every other prototype) and now spectrum → audio (this prototype). The harmonic chart makes the bridge visible.
3. **Continuous synthesis from a drawn curve.** No note events, no MIDI, no presets required — just a drawn line that becomes a sustained tone.

## Polish ideas for future cycles

- **Additive mode**: instead of drawing the waveform directly, draw the harmonic envelope (amplitude vs. harmonic number) and hear the additive synthesis result. Inversion of the current approach.
- **Micro-detuning**: multiple detuned oscillators (2–4) using the same periodic wave, giving chorus/ensemble effect. +3 lines.
- **AM/FM modulation**: a second smaller canvas for a modulator waveform; apply it to the carrier. Shows FM synthesis interactively.
- **Export**: `OfflineAudioContext` → render 2 seconds at the current pitch → download as WAV.
- **Glide between presets**: tween `waveRef.current` between two preset arrays over 500ms — hear the timbre morph smoothly.
