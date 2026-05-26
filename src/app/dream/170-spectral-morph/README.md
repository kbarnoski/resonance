# Spectral Morph

**Route**: `/dream/170-spectral-morph`  
**Cycle**: 199 (2026-05-26 UTC)  
**Status**: demoable

## What it does

40 sine partials are tuned to harmonics of C3 (130.81 Hz). Each
partial's amplitude is governed by the harmonic series formula for
Source A and Source B. The morph slider (0→1) linearly interpolates
every partial's amplitude simultaneously.

Result: genuine spectral morphing. At t=0 you hear Source A; at t=1
you hear Source B; at t=0.5 you hear a waveform that occupies the
midpoint of the two harmonic series — not a crossfade (which just
lowers volume) but a reshaped spectrum that is acoustically distinct
from either source.

## Why it matters

Prototypes 1–169 use FFT for **analysis** (AnalyserNode read-out).
This is the first to synthesize audio FROM the spectral domain — the
harmonic amplitude vector is the compositional parameter, not a
visualization output.

## Source amplitudes

| Source   | Formula          | Timbre character       |
|----------|------------------|------------------------|
| Sawtooth | 1/k all k        | Bright, buzzy          |
| Triangle | 1/k² odd k only  | Softer, hollow         |
| Square   | 1/k odd k only   | Bold, reedy            |
| Sine     | k=1 only         | Pure, thin             |

Amplitudes are normalized to [0, 1] per source so all four start at
the same perceived volume.

## Visualization

Three stacked bar charts (same violet→magenta palette as `1-live`):
- **Top** — Source A spectrum (dim)
- **Middle** — Blended spectrum (bright, updates live with slider)
- **Bottom** — Source B spectrum (dim)

X axis = harmonic index 1–40. Y axis = normalized amplitude.

## Polish ideas

- Pitch control: move the base frequency (C2–C5)
- Mic mode for Source A: extract harmonic content from live piano, morph toward synthetic waveforms
- ADSR envelope on the output
- Save a "snapshot" of any blend position as a custom waveform
- Animate morph automatically over time (slow LFO sweep)
