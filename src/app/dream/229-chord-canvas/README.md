# Chord Canvas

**For**: pianists, musicians, anyone who wonders "what chord is that?"  
**Route**: `/dream/229-chord-canvas`  
**Cycle**: 263

---

## What it does

Play any chord on piano (or any instrument) and watch the detector name it in real time.

- **Mic input** → 4096-point FFT → 12-bin chromagram → template match against 24 major/minor chord templates → chord name in large monospace type
- **Timeline strip** scrolls left: each chord you played becomes a colored rectangle. Width = duration. Color = root note.
- **Chromagram bar graph** at the bottom shows energy per pitch class continuously.
- **Demo mode** plays a ii–V–I progression (Dm → G → C) so the system demonstrates itself with no mic required.

---

## How chord detection works

1. **FFT** at 4096 samples, `smoothingTimeConstant = 0.65`
2. **Pitch-class accumulation**: for each FFT bin in the piano range (60–5000 Hz), compute its pitch class via `round(12 × log₂(f / 440) + 9) mod 12`, add its linear magnitude to that class's bucket
3. **L1 normalize** the 12 chroma bins
4. **Template match** against 24 templates (12 × major + 12 × minor), each defined by 3 set bits (root + quality intervals). Score = dot-product. Pick the highest-scoring template above threshold 0.28.

The detection is purely signal-processing — no ML, no server, no API. It works on any harmonic instrument: piano, guitar, voice, synth.

**Limitations**: 
- Works best with sustained chords (not staccato hits)
- Monophonic detection: picks the strongest chord, doesn't detect polychords
- Open voicings spread across the spectrum read better than close voicings
- Jazz extensions (7ths, 9ths) confuse the 3-note template — the root triad often wins anyway

---

## Visual design

- **Chord name**: Huge monospace text, colored by root note (chromatic hue wheel: C = red, D = yellow, E = green, A = violet). Major = vivid; minor = desaturated.
- **Timeline**: Scrolls at 100px/sec. Each block is labeled with the chord name when wide enough.
- **Chromagram**: Live 12-bin energy display at the bottom, same hue mapping.
- **Confidence bar**: Thin strip below the chord name showing template match score.

---

## Polish ideas

- Add dominant 7th templates (root + M3 + P5 + m7 = 4 tones) — requires 4-note templates
- Inversions: detect whether root, 3rd, or 5th is in the bass
- Show chord on a virtual piano keyboard (light up the chord notes)
- History list: text record of chords played with timestamps
- Export timeline as a chord chart (PNG)
- Mic gain slider (quiet rooms vs. loud environments)
- Root-note transpose: re-report chords relative to a chosen tonic (e.g., all relative to C)

---

## Technical notes

- `fftSize = 4096` → binWidth = 44100/4096 ≈ 10.8 Hz. Accurate enough to distinguish adjacent semitones across the piano range.
- `smoothingTimeConstant = 0.65` on the `AnalyserNode` + `SMOOTH = 0.72` on the chroma vector = double smoothing, intentional: the first removes frame-to-frame FFT flicker; the second gives the chord a moment to "settle" before a switch is detected.
- The `extractChroma` function runs in the rAF loop (every ~16ms). At 4096 bins, this iterates ~2000 bins per frame (limited to 60–5000 Hz). Very fast.
- Demo mode: three `OscillatorNode` triangles per chord (root + 3rd + 5th, octave 3). Routed through the same `AnalyserNode` that processes mic input. The chord detector sees the demo audio as if it were mic input.
