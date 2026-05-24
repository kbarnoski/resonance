# Mood XY — design notes

**Route**: `/dream/139-mood-xy`
**Built**: Cycle 165 · 2026-05-24 UTC
**Status**: demoable
**Dependencies**: zero deps · zero API · zero permissions

## What

Russell's circumplex model of affect maps emotions onto a 2D space:
- **X axis** — valence: sad (left) → happy (right)
- **Y axis** — arousal: calm (bottom) → energetic (top)

Drag the dot anywhere on the canvas. The music updates in real time.

## Audio mapping

| Axis | Range | Parameter |
|------|-------|-----------|
| Arousal ↑ | 40 → 140 BPM | Tempo |
| Arousal ↑ | 3.0 → 0.24 s note duration | Sustain / staccato |
| Arousal ↑ | 0.42 → 0.01 s attack | Pad → percussive |
| Arousal ↑ | C2 → E3 root | Register |
| Arousal ↑ | 150 → 4500 Hz filter | Brightness |
| Valence → | 0–33% diminished · 33–68% minor · 68–100% major | Chord quality |

## Quadrant aesthetics

Each quadrant has a distinct background color and accent. The background bilinearly
interpolates — dragging from any corner to another smoothly morphs the canvas.

| Quadrant | Color | Music character |
|---|---|---|
| Calm · sad | Deep indigo | Sparse diminished drone, 40 BPM |
| Calm · happy | Dark emerald | Warm major pad, 40 BPM |
| Energetic · sad | Dark rose | Fast diminished arpeggio, 140 BPM |
| Energetic · happy | Dark amber | Bright major arpeggio, 140 BPM |

## Why this

Russell's circumplex is the most evidence-backed model for mapping emotional state
to music. MIR research consistently validates it: tempo, mode, brightness, and
attack collectively predict perceived valence and arousal with high accuracy.

Most Resonance prototypes respond *to* audio input. This one goes the other direction:
the composer sets an emotional intent and the music shapes itself. Potential onboarding
question for Resonance: "Where do you want to be tonight?" — drag once, the journey
arc could begin from that emotional coordinate.

The trail accumulates the session's emotional journey as a glowing path — the shape
of the cloud after 30 minutes of exploration IS the session's emotional narrative.

Inspired by AffectMachine-Pop and ACM IMX 2025 semantic visualization research
(RESEARCH.md §§43, 58).

## Implementation notes

- Triangle oscillators + lowpass filter. Low arousal = heavily filtered, all 4 chord
  tones ring simultaneously (chord). High arousal = bright filter, fast arpeggio.
- BPM-driven scheduling: beats are scheduled 120ms ahead in AudioContext time.
  `setTargetAtTime` for filter smoothing (no clicks on parameter changes).
- `canvas.setPointerCapture` keeps the dot tracking if the finger moves off the canvas.
- Trail uses `performance.now()` timestamps, decaying over 9 seconds.

## Polish ideas

- Add a second "harmonics" dimension — click to toggle a 5th or 7th voice
- Log the session's emotional path as a downloadable SVG
- MIDI output: send CC values for valence (CC70) and arousal (CC71)
- Start at the user's "current" position derived from camera image color (hook to
  `124-image-chord` logic: warm image → high valence, bright image → high arousal)
