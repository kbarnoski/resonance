# 168 — Piano Roll

**Route**: `/dream/168-piano-roll`  
**Status**: `demoable`  
**Cycle**: 197

Real-time scrolling piano roll driven by microphone pitch detection. Every note you play appears as a glowing bar that scrolls left — pitch determines vertical position, color shifts from violet (C2, low) to red (C6, high).

## Interaction

- **Start mic** → play piano, sing, or hum any monophonic line
- **Demo** → 26-note C major passage plays automatically, filling the roll
- **BPM slider** → adjusts scroll speed (faster = more notes visible at once)
- **Stop** → clears everything and returns to idle

## Design

- MIDI range C2–C6 (48 semitones). Octave lines (C2–C6) are labeled on the left strip.
- Black-key rows are slightly darker, providing a familiar piano keyboard reference.
- The "now" cursor is the right edge of the roll. Historical notes trail off to the left.
- In mic mode, the current note extends as a live tail to the cursor — you see the note in real time as it's detected, not just after it ends.
- Note name (e.g. "F♯4") appears in the status bar while a note is held.

## Pitch detection

AMDF algorithm, same as `167-aria-companion`. Works well for monophonic piano, voice, and any instrument with a clear fundamental. Degrades gracefully on chords (picks the dominant pitch) and silence (shows nothing).

## What it answers

*"What if Resonance showed you what you played — as notation — in real time?"*

Unlike `13-piano-canvas` (abstract brush strokes) and `167-aria-companion` (two-voice dialogue), this is the first prototype that maps notes to their actual musical positions. A pianist can watch their phrase scroll by and immediately recognize intervals, scales, and rhythm.

Natural triptych with:
- `13-piano-canvas` — abstract painting from your playing
- `22-code-score` — write music, hear and see it play
- `168-piano-roll` — play music, see it as notation

## Polish ideas

- Add a click-track option (pulsed line at each beat position)
- Show multiple simultaneous voices (chords) — requires polyphonic pitch detection
- Export the session as a MIDI file
- Overlay with chord names from `28-chord-canvas` algorithm
