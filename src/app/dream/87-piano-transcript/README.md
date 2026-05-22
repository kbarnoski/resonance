# Piano Transcript (`87-piano-transcript`)

**Question**: what if Resonance wrote down every note you played, in real time?

## What it does

Play piano into your mic → YIN pitch detection → scrolling piano-roll canvas.
Each note is a filled rectangle: x = time, y = pitch (MIDI), width = duration.
The canvas scrolls leftward, keeping the last 20 seconds visible. Phrases (≥2 s
of silence between them) are outlined with a subtle violet bracket.

"Save PNG" exports the entire session to a timestamped image (at 64 px/second).

Color gradient (C2 → C7):
- C2–C3 (MIDI 36–47): warm amber
- C3–C5 (MIDI 48–71): Resonance violet
- C5–C7 (MIDI 72–96): cool cyan

## Algorithm: YIN (de Cheveigné & Kawahara 2002)

~35 lines in `page.tsx`. Four steps:

1. **Difference function** `d(τ)`: sum of squared differences between the
   signal and its τ-shifted copy, over a half-window W=1024.
2. **CMNDF**: cumulative mean normalization so the function bottoms out near 0
   at the true fundamental period.
3. **Absolute threshold**: find the first τ where CMNDF < 0.10. Walk forward
   to the local minimum.
4. **Parabolic interpolation**: refine τ between integer samples → sub-sample
   frequency accuracy.

YIN runs every 3rd RAF frame (~20 Hz). fftSize=2048 → W=1024 → detectable
range: ~54 Hz (A1) to ~2100 Hz (C7).

Pitch is median-smoothed over a 5-reading rolling window before committing to
a note, suppressing octave-error frames.

## Known limitations

- **Monophonic only** — detects the dominant partial. Chords latch onto the
  strongest harmonic and may jump between notes.
- **Pedal sustain**: as the note decays below the silence threshold (~0.007
  RMS), the note is closed even if the pedal holds it open.
- **Room reverb** confuses the algorithm — closer mic placement = more accurate.

## Polish ideas for future cycles

- Color-code by velocity (louder = fully opaque, softer = semi-transparent)
- MIDI export (download `.mid` from `notesRef.current`)
- Polyphonic extension: run YIN in parallel on bass / mid / treble filtered
  sub-bands and render three simultaneous tracks in different colors
- BPM-snap: quantize note starts to the nearest 16th-note grid at detected BPM
- Horizontal zoom slider (change `VISIBLE` from 20 s dynamically)
