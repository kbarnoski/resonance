# 198 — Oscilloscope Composer

Design a Lissajous figure and download the stereo WAV file that draws it on a real oscilloscope.

## What it does

Two sine-wave oscillators at frequencies `f·n` and `f·d` (base A3=220 Hz) are routed to separate
stereo channels via `ChannelMergerNode`. On a real oscilloscope in XY mode, the left channel drives
the horizontal beam and the right drives the vertical — tracing the Lissajous figure shown on screen.

Controls:
- **Ratio** — frequency ratio n:d maps to a musical interval (Octave, Perfect 5th, etc.)
- **Phase** — phase offset on the X oscillator; sweeps the figure through its family of shapes
- **X/Y balance** — relative amplitude of the two channels (aspect ratio of the figure)
- **Presets** — Circle, Figure-8, Trefoil, Rose, Starburst
- **↓ WAV** — generates a 5-second 44100 Hz 32-bit float stereo WAV with exact math; no browser Audio API
- **Puzzle mode** — shows a ghost target figure; match it by ear and eye

## Technical notes

- Canvas renders `computeLissajous()` with 3000 points per frame; no per-frame recompute (state via refs)
- WAV encoding is pure JS/TypeScript IEEE float32 PCM — no external deps, works offline
- Phase applies only to the X oscillator; the canvas and WAV both use the same formula
- Balance normalization: `mbMax = max(bal, 100-bal)`, so max(xAmp, yAmp) = 1 always fills the canvas
- Traveling dot position is a time-based parametric index, not locked to audio phase
- Ratios are all coprime pairs, so each traces a complete closed figure in one period T = 2π

## Musical intervals ↔ Lissajous shapes

| Ratio | Interval     | Shape            |
|-------|-------------|------------------|
| 1:1   | Unison       | Ellipse/Circle   |
| 1:2   | Octave       | Figure-8         |
| 2:3   | Perfect 5th  | Trefoil          |
| 3:4   | Perfect 4th  | Pretzel          |
| 3:5   | Major 6th    | 5-lobe           |
| 4:5   | Major 3rd    | 4-lobe           |
| 5:7   | Minor 7th    | Complex star     |
