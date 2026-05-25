# 148 — Spatial Palette

**Route**: `/dream/148-spatial-palette`
**Built**: Cycle 175 · adult build
**Status**: demoable

## What it answers

"What if arranging voices in 2D space was the instrument?"

## Interaction model

Each colored dot is a sustained synthesis voice. The canvas is a two-axis
musical space:

- **X axis** — stereo pan (left edge = hard left, right edge = hard right,
  center line = center)
- **Y axis** — pitch in semitone rows (top = C6, bottom = C2, equally spaced
  per MIDI number so every row is one semitone)

Additional controls per dot:
- **Drag** — repositions the voice; pitch and pan update continuously with
  150ms exponential smoothing so glides are smooth
- **Mouse wheel / pinch** — adjusts brightness+reverb: scroll up = brighter
  (higher lowpass cutoff, less reverb send), scroll down = darker and wetter
- **Double-click** — cycles timbre: sine → triangle → sawtooth → square
- **Long-press** (600ms) — removes the voice with a fade-out
- **Click empty canvas** — adds a new voice at that pitch/pan position
  (up to 8 voices total)

## Audio graph

One shared ConvolverNode reverb (procedural IR: white noise × exponential
decay, 2.5s, stereo). Per voice:

```
OscillatorNode(type, freq)
  → BiquadFilter(lowpass, fc = 200 + bright×7800 Hz)
  → GainNode(0.22 main)  → StereoPannerNode → destination
  → GainNode(wet send)   → ConvolverNode → GainNode(0.5) → destination
```

Filter cutoff range (200–8000 Hz) deliberately avoids both the muddiest
sub-bass and the harshest air band. Wet send = `(1 − bright) × 0.4`, so a
fully dark voice is 40% wet; a fully bright voice is dry.

## Chord detection

Since voice frequencies are known precisely (no FFT analysis needed), chord
detection computes a 12-bin chroma vector from voice pitch classes, then
template-matches against 24 major/minor triad templates using dot-product
correlation normalized to √3. The top-right display updates on every drag.

## Demo preset

Three voices placed at start: C4 (center), E4 (right ≈ +0.38), G4 (left ≈
−0.38) — a C major triad in a slightly spread stereo image. Drag E4 down one
row → C minor. Drag G4 up two rows → C aug. Move all three voices to the
right side → same chord, all sound from the right.

## Design notes

Inspired by CHI 2026 6DoF gesture mixing research: spatial layout conveys
musical meaning that sliders don't. When you look at a widely-spread chord
(voices far apart on the Y axis) you immediately know it's an open voicing.
When voices cluster you can see the harmonic density. The canvas IS the score.

Scope strip at the bottom shows the composite waveform synthesized
analytically from the current voice frequencies — not from audio output, so
it's always accurate to the current state and doesn't require an analyser tap.

## Polish ideas

- Pitch portamento mode: disable semitone snap for smooth glide
- Velocity layer: drag speed on release → velocity accent for a moment
- Show interval labels between pairs of dragged voices
- Export current voice state as a JSON patch preset
- MIDI out: voice positions → CC values for external synth control
