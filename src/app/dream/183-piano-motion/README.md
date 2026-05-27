# 183 · Piano Motion

**What if you could watch a piano being played?**

Two cartoon hands float above a 61-key keyboard (C2–C7). As music plays, each
hand springs to the position of the current note in its register — left hand
tracks bass (below C4), right hand tracks treble (C4 and up). Keys glow when
pressed. The hands breathe at idle; they snap alive the moment a note sounds.

## Modes

| Mode | How | Audio |
|---|---|---|
| **Bach demo** | Click ▶ Bach demo | BWV 772 fragment, two-voice invention |
| **Mic** | Click 🎤 Use mic | Play piano live — hands follow you |
| **Paths recording** | Paste a recording UUID | Karel's Welcome Home tracks via `/api/audio/[id]` |

## How hands track notes

**Demo mode**: note events are pre-scheduled exactly as `[time, midi, duration]` tuples.
The animation loop checks which notes are active at the current `AudioContext.currentTime`
and moves each hand to that key's normalized X position.

**Mic / recording mode**: real-time FFT from an `AnalyserNode`. Two frequency windows:
- Left hand: 37–262 Hz (A1–C4 bass register) — finds the peak bin
- Right hand: 262–2093 Hz (C4–C7 treble register) — finds the peak bin

Each window's dominant bin maps to a MIDI note → a key X position. Both windows run
every animation frame (~60fps). This works for polyphonic piano recordings because the
windows are separated by middle C — the bass and treble peaks are independent.

## Spring physics

Hand positions use a spring-damper: `k = 0.12`, `damping = 0.60`. At 60fps this gives a
~200ms settle time — fast enough to track melodies, smooth enough to look like a real hand
sliding across the keys rather than teleporting.

## Keyboard layout

61 keys, C2 (MIDI 36) to C7 (MIDI 96). MIDI-standard layout: 36 white keys, 25 black keys.
White key positions precomputed into a lookup table at module load. Black keys drawn after
white keys to sit visually on top. Octave labels at each C (C2–C7).

## Polish ideas

- **Two-hand chord spread**: when multiple simultaneous notes detected in the treble range,
  show two right-hand fingers at different key positions
- **Velocity → press depth**: louder notes = key sinks deeper (key height shrinks briefly)
- **Replay animation from session**: accumulate note events during mic session, replay as
  "ghost" hands when playback is requested
- **Offline batch analysis**: use OfflineAudioContext to analyze a full recording before
  playback for precise two-voice note detection (slow for long tracks but accurate)
- **Hand posture variants**: the current hand is a simplified oval + 4 fingers. Realistic
  piano hand posture (curved fingers, thumb tucked) would be distinctive
