# 706 · Keys of Light

**The one question:** *What if Karel's playing arrived as light out of the dark —
every note his hands played, streaming past as a filament of warmth?*

A piece's real note roll (every MIDI note, with time / pitch / length / velocity,
from the track analysis) flows across the screen like an aurora:

- **Pitch** → vertical position (low deep-amber near the floor, high pale-gold up top).
- **Duration** → length of the filament.
- **Velocity** → brightness and thickness.
- A still **now-line** left-of-center: a filament flares as it crosses — that's
  the note sounding right then.

It's the LED "reveal out of darkness" Karel likes, but the light is literally his
notes.

## How it works

- `loadTrackAnalysis(id)` → time-sorted `notes[]`. A cursor advances past notes
  fully behind the window; the loop draws only notes within `[t−2.5s, t+6.5s]`.
- `x = nowX + (note.time − t) · pxPerSec`, so notes flow right→left through the
  now-line at playback speed.
- Audio → `createSafeMaster` → speakers. Canvas2D, additive glow, rounded filaments.
