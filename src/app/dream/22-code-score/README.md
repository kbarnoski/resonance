# Code Score — design notes

**Route**: `/dream/22-code-score`  
**Cycle**: 25  
**Question**: What if a Resonance session started with a written score?

## What it does

Two panels: left is a score editor (textarea), right is a Canvas2D painting.

Press **▶ Play** — the score is parsed, audio is scheduled via Web Audio API, and each note paints
itself onto the canvas at the moment it sounds. Strokes accumulate as the melody plays. Press ↓ to
download the painting as PNG.

## DSL syntax

Tokens are whitespace-separated on each line. `//` comments strip the rest of the line.

```
C5 E       // C5 eighth note
D#4 Q      // D-sharp4 quarter note
Bb3 H      // B-flat3 half note
rest Q     // quarter rest (advances cursor, no stroke)
[C4 E4 G4] Q   // C-major chord, quarter duration
```

**Note names**: `[A-G][#b]?[octave]`. A4=440 Hz anchor; MIDI formula: `freq = 440 × 2^((midi−69)/12)`
where `midi = 12×(octave+1) + semitone`.

**Durations**: `W`=whole, `H`=half, `Q`=quarter, `E`=eighth, `S`=sixteenth.
Duration in seconds = beats × (60/BPM).

## Painting algorithm

Stroke positions are **precomputed** before playback starts — the path cursor is deterministic
from the score, with no mutable state shared between timeout callbacks.

For each non-rest note:
- **Hue** = `freqToHue(freq)`: A4=0°, rotating ~60° per octave. Same as `13-piano-canvas`.
  Bass notes → blues/greens, treble → oranges/reds.
- **Horizontal advance** = `duration × PX_PER_SEC` where `PX_PER_SEC ≈ 10% of canvas width per second`.
- **Vertical drift** = log-pitch delta × 28px, damped each note (factor 0.80). Rising melody arcs
  upward; descending phrases drift down. The melodic contour IS the stroke's shape.
- **Line wrap** at 93% of canvas width, stepping down by 13% of canvas height.
- **Rendering**: additive blending (`"lighter"`) + `shadowBlur` glow. Identical to `13-piano-canvas`'s
  `commitStroke()` but as a single segment (straight stroke) rather than a multi-point path.
- **Chord notes**: root paints the main stroke (weight 2.5px). Each additional chord tone paints
  a shorter parallel stroke 5px above (weight 1.5px) in its own pitch color. At a glance, a
  bright double bar = chord; a single bar = melody note.

## Audio

`OscillatorNode` (triangle wave — warmer than sine for Bach) with Hann-windowed `GainNode` envelope:
- Attack: `min(25ms, 10% of duration)`
- Sustain: holds to 70% of duration
- Release: 70% → 95%, then silence
- Peak gain: `0.10 / chord_length` (chords stay the same perceived volume as single notes)

All notes pre-scheduled at `actx.currentTime + 0.05s` to avoid event-loop jitter on the
first note. Painting timeouts use the same offset so audio and visuals stay synchronized.

## The interesting thing

With `13-piano-canvas`, you play and the painting appears immediately — no anticipation.  
With `22-code-score`, you see the whole score in the textarea before pressing play. The score
is a promise; the canvas is its fulfillment. The ascending/descending phrases trace visible arcs
even before you listen — you read the melodic structure in the stroke geometry.

## Polish ideas

- Dotted duration syntax: `Q.` = 1.5 beats
- Dynamic markers: `<p>` `<f>` before a note to set gain
- Spiral layout option (strokes spiral inward toward center)
- Color scheme: pitch → wavelength color (ROYGBIV instead of hue rotation)
- Playhead line showing current position on the canvas
- Two-voice support: `V1: C5 E | V2: E4 Q` — two paths, two colors
