# Oscilloscope Composer

**Question**: what if you designed the visual shape first, and the audio that draws it was the artifact?

Route: `/dream/46-osc-composer`

---

## What it does

Two sine oscillators — one routed to the left audio channel, one to the right — generate a
stereo audio signal. When fed into an oscilloscope in XY mode (L→X, R→Y), the signal traces
a closed geometric figure called a Lissajous curve.

The prototype inverts the usual direction: instead of visualizing audio, you design the shape
and download the stereo WAV that encodes it.

- **L freq / R freq sliders**: set the frequency multiplier for each channel (1–5×, base 220 Hz)
- **Phase slider**: rotate the figure continuously (0–359°). At 0° a 1:1 ratio is a diagonal
  line; at 90° it's a circle; at 180° a diagonal in the other direction.
- **Preset buttons**: five named figures with their musical interval relationship
- **↓ Download WAV**: renders a 5-second stereo WAV directly in the browser (~900KB). Play
  this file on a real oscilloscope in XY mode and the figure appears on screen.
- **Puzzle mode**: shows a target figure alongside yours — tune the sliders to match.

---

## The oscilloscope music genre

"Oscilloscope music" is a real genre. Artists like Jerobeam Fenderson and Hansi3D compose
stereo audio whose visual content on an XY oscilloscope is the primary artistic output.
The constraint is strict: the audio must sound good AND draw recognizable shapes simultaneously.
`20-scope` (the vectorscope prototype) shows incoming audio as a Lissajous figure; this
prototype inverts the workflow.

---

## Musical intervals as geometry

The frequency ratio determines the figure's topology:
- **1:1** — same frequency, unison interval → circle (at 90°) or line (at 0°)
- **1:2** — octave → figure-8 (∞ symbol)
- **2:3** — perfect fifth → trefoil (3-lobe figure)
- **3:4** — perfect fourth → 4-leaf rose
- **3:5** — major sixth → 5-pointed starburst

The number of lobes is `max(rL, rR)` for figures where the ratio is in lowest terms.
Phase rotation preserves the lobe count but changes the figure's orientation and "tilt."

---

## WAV encoding

The download is computed in pure JavaScript (no OfflineAudioContext):
```
for each sample i at time t = i/44100:
  L[i] = 0.72 * sin(2π * rL * 220 * t)
  R[i] = 0.72 * sin(2π * rR * 220 * t + phaseRad)
```
5 seconds × 44100 Hz × 2 channels × 2 bytes = ~882KB. Rendered synchronously in ~10ms.

The WAV file encodes the exact Lissajous shown on canvas: loading the WAV in an oscilloscope
(or in `20-scope`) reproduces the figure.

---

## Polish ideas

- Amplitude balance slider: let L and R have different amplitudes (creates tilted/squashed figures)
- Waveform selector (sine / triangle / sawtooth): triangle harmonics add overtone loops; sawtooth
  creates complex multi-trace figures that look like spirograph art
- Slow auto-rotate: animate phase from 0→360 over N seconds, export as a WAV that "spins" on
  the oscilloscope
- 3D Lissajous: add a third oscillator (Z channel) — some oscilloscope displays support XYZ mode
- More puzzle levels: the "Starburst" shape is hard to match without knowing the 36° phase trick
- Real-time waveform display below the canvas: show L and R as separate time-domain traces so
  the user can see how two sine waves become a shape
- Inharmonic ratios: allow fractional multipliers (e.g. 1.5:1) for open, non-closing figures
