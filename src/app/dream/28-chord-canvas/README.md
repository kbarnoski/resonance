# 28-chord-canvas — design notes

**Question**: what chord are you playing?

**Shipped**: Cycle 32, 2026-05-19

---

## Algorithm

**Chroma extraction**: 2048-sample FFT → 1024 frequency bins. Each bin's frequency is converted
to a MIDI note number, pitch class extracted (`round(midi) mod 12`). Magnitude (`byte/255`) is
accumulated into 12 chroma bins (C through B). The chroma is L1-normalized (sum = 1) so that
uniform broadband noise produces a low, uniform score while a clean chord concentrates energy
into 3 pitch classes.

**Chord matching**: 24 templates (12 roots × {major, minor}). Each template has three non-zero
weights: root=1.5, third=1.0, fifth=0.8 (root emphasized since it's perceptually dominant).
Score = weighted dot product of template and normalized chroma. Highest-scoring template wins if
score ≥ 0.60. A perfect clean chord scores ≈1.1; broadband noise scores ≈0.275.

**Why 0.60 threshold**: halfway between noise floor (0.275) and perfect chord (1.1). Allows
slightly noisy piano chords while rejecting ambient room noise.

## Color mapping

Root pitch class → hue: C=0°, C♯=30°, D=60°, … B=330° (30°/semitone).
Major = high saturation (72%) + lighter (58%).
Minor = lower saturation (48%) + darker (46%).

The hue wheel is deliberately different from `1-live`'s band→hue mapping — here it encodes
*music theory* (which root note), not acoustic energy (which frequency band).

## Timeline strip

Each detected chord accumulates as a horizontal block: block width = time held. When chord
changes, a new block appears at the right edge. All blocks scroll left at 40 px/sec.
Below-threshold gaps are empty (dark background showing on the right). This gives an instant
visual record of the harmonic rhythm.

## Demo mode

ii–V–I in C major (Dm7 → G7 → Cmaj7, 2.5s each), triangle oscillators at the exact chord
frequencies. Audio goes to both the AnalyserNode (for detection) and the AudioContext destination
(so it's audible). With only the 3–4 notes active and no overtone noise, the detection is clean:
Dm is always detected as "Dm", G7 as "G", Cmaj7 as "C". The 7th of each chord (C in Dm7, F in
G7, B in Cmaj7) doesn't change the detection — the strongest three notes in the chroma still
point to the correct triad.

## Limitations

- **Polyphony**: only detects one chord at a time (the best-matching template). Two chords
  played simultaneously → whichever has clearer energy wins.
- **7th chords, extended chords, suspensions**: detected as their nearest major/minor triad.
  Dm7 → "Dm", Gsus4 → likely "G" or "C" depending on energy.
- **Bass notes**: low-frequency notes have more energy in FFT but span fewer bins. A strong bass
  C note may dominate the chroma even if the melody chord is G major.
- **Noise**: above-average ambient noise (e.g. fan, HVAC) may produce false detections. The
  gain=2.0 in mic mode favors instruments over room ambience.

## Polish ideas

- **Dominant 7th template**: add 7th chord templates (root, M3, P5, m7) for G7→"G7" detection.
- **Show the matching chromagram overlay**: outline the detected chord's pitch classes in the
  chromagram bars (root in bright color, third slightly less, fifth faint) so the match is
  visible.
- **Key detection**: accumulate 4–8 seconds of chord history → infer key from the most common
  pitch classes. Show "Key: C major" alongside the chord name.
- **Chord progression history**: save the last 8 chords (time-stamped) in a scrolling log below
  the timeline. Export as simple chord chart.
- **Sensitivity slider**: allow adjusting the CONF_MIN threshold live (currently hardcoded 0.60).
