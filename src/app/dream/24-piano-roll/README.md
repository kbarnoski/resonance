# 24 — Piano Roll

**Route**: `/dream/24-piano-roll`  
**Cycle**: 28 (2026-05-19)  
**Status**: demoable

## What it is

A live scrolling piano roll from mic pitch detection. Play piano or sing — each note appears as a colored horizontal bar scrolling left, placed at its MIDI pitch on a vertical axis (C2 bottom, C7 top). The same representation every DAW and notation editor uses, rendered in real time from live audio.

Demo mode plays Bach Invention No.1 (BWV 772) silently via OscillatorNodes and renders its own detected pitch — the roll paints itself from the score with zero human interaction.

## Triptych context

Three representations of the same musical event:

| Prototype | Input → Output |
|---|---|
| `13-piano-canvas` | Playing → abstract painting (subjective, affective) |
| `22-code-score` | Written score → canvas + audio (notation → art) |
| `24-piano-roll` | Playing → scrolling notation (objective, analytical) |

The piano roll is the most analytical — it shows *what* you played precisely, not how it felt. A pianist reading the roll back can reconstruct the melody.

## Technical notes

**Pitch detection**: Same McLeod autocorrelation algorithm as `13-piano-canvas` (fftSize=4096, no smoothing). RMS gate at 0.012 prevents false triggers in silence. Confidence threshold 0.82 on normalized autocorrelation peak. Works well for monophonic piano/voice; picks dominant pitch on chords.

**Demo mode trick**: Instead of running autocorrelation on synthesized oscillator output (which works but adds one-frame lag), the demo sequencer stores the current note's known frequency in `demoFreqRef` and uses it directly in the render loop while the note is sounding. Cleaner bars, faster response. The oscillators still feed the analyser so the architecture is identical to mic mode.

**Scroll speed**: `pxPerBeat × BPM/60`. At 72 BPM default: 96 px/sec. BPM slider adjusts live — the note bars stretch or compress proportionally (since bar width = elapsed time × px/sec).

**Note bar rendering**: Additive blending (`"lighter"`) for the glow fill. A brighter core rectangle inside. Active notes get a glowing leading-edge pulse (2px bright strip). Rounded rects for a modern DAW feel.

**Memory management**: Bars that scroll more than 200px off-screen left are removed from the array. At 96 px/sec this is ~2 seconds of trailing history discarded silently. The visible window holds ~5 seconds of bars at default BPM.

**Piano key sidebar**: 44px column on the left. White keys (natural notes) rendered as pale rectangles; black keys as narrow dark ones. Active key highlights in the note's hue — you can watch the key depress as the bar appears.

## What makes it different from other prototypes

Every other prototype in the sandbox uses audio as a trigger for *abstract* visual material — particles, fluid, paint strokes, 3D mesh deformation. This is the first that renders *recognizable musical notation*. A musician who has never seen this page will immediately understand what they're looking at. The abstract prototypes reward sustained watching; this one rewards analytical listening — you can spot wrong notes, rhythmic drift, range patterns.

## Polish ideas

- **Quantize mode**: snap detected note starts to the nearest 16th-note grid — makes the roll look like actual notation.
- **Chord detection**: when multiple strong partials are detected, render stacked bars (same midi position, different hue per harmonic).
- **Export MIDI**: accumulate note events and offer a `.mid` download. This would be the first prototype that produces a music file artifact.
- **Playback mode**: reverse — click a bar to hear the note replayed through an oscillator.
- **Color by duration**: shorter notes = more saturated, longer = more translucent, to convey rhythm visually.
- **26-score-follow integration**: overlay the expected score bars in grey; detected bars in color. Green when matched, red when missed.
