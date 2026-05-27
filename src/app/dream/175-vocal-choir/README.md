# 175 — Vocal Choir

**Route**: `/dream/175-vocal-choir`  
**Status**: `demoable`  
**Built**: Cycle 205 (2026-05-27)  
**Size**: ~3.2 kB

## What it does

Sing or hum a pitch into the mic. Three harmony voices automatically appear around you
in 3D space:

- **Major third** (+4 semitones) — upper-left, violet, azimuth −45° elevation +20°
- **Perfect fifth** (+7 semitones) — upper-right, teal, azimuth +45° elevation +20°
- **Bass octave** (−12 semitones) — lower-center, rose, azimuth 0° elevation −20°

The harmony voices track your pitch continuously with 50ms portamento — smooth glides,
no jumps. With headphones, the four voices form a complete SATB-style choir arc around
your head. On speakers you hear a clean chord bloom.

## Technical approach

**Pitch detection**: autocorrelation on a 4096-sample time-domain buffer at ~30 Hz.
Minimum lag-normalized-correlation threshold 0.9 for confident pitches. Tracks voice
range 60–1400 Hz (roughly B1–F6). Stable on sustained vowels; noisy on consonants.

**HRTF spatialization**: each voice uses `PannerNode` with `panningModel: 'HRTF'`.
The HRTF database is browser-native (no external SOFA file). Positions set once; only
oscillator frequencies update per frame.

**Visual**: four glowing orbs on a dark canvas. The center user orb (white) and three
harmony orbs (colored) are connected by dim lines. Each orb radius scales with the
current amplitude via EMA smoothing — they breathe with the sound. A small note name
(e.g. "C3") labels the currently detected pitch above the user orb.

**Demo mode**: a sine oscillator slowly cycles through a C pentatonic phrase (C3, E3,
G3, A3, C4 and back) so the choir is immediately audible without mic permission.

## Design notes

This is the first prototype in the sandbox where the listener is the "lead" in a
spatial ensemble. All 174 prior prototypes either react to audio (visualizers) or
generate audio (synthesizers). Vocal Choir does both: your voice IS the input, and the
output wraps back around you spatially.

The SATB formation (soprano upper-left, tenor upper-right, bass below) mirrors how
a real choir sounds from the front row. The bass voice at −20° elevation gives the
low octave a slight "from below" quality that anchors the listener spatially.

## Polish ideas

- Add a second harmonic in each voice (2nd OscillatorNode at 2× frequency, gain 0.08)
  for a richer choral timbre rather than pure sines.
- Add reverb: a `ConvolverNode` with a short church-hall impulse response would make
  the spatial effect much more convincing.
- Pitch quantization mode: snap detected pitch to nearest chromatic semitone before
  generating harmonies — the choir would "correct" slightly off pitches.
- Vibrato: a slow LFO (5 Hz, ±15 cents) on each harmony oscillator gives a more human
  choral quality.
