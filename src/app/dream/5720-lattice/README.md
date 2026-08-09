# 5720 · Lattice

**The one question.** What if you could *see* the harmonic space your playing
moves through — a rotating 3D crystal where every note lights a point in a
helical pitch-space, chords snap into solid geometric shapes, and your melody's
voice-leading traces a glowing path through tonal space?

Analytical, not visionary: the piece is a real-time tonal microscope built on
Elaine Chew's **Spiral Array**.

## The Spiral Array geometry

Pitches are laid out along the *line of fifths* and wound into a helix. Node `k`
sits at

```
x = R·sin(k·π/2)   y = k·h   z = R·cos(k·π/2)     (R ≈ 1, h ≈ 0.4)
```

so consecutive `k` are a perfect fifth apart and every four steps completes one
full turn. The winding is what makes harmony *visible*:

- A **major triad** — root, fifth, major third — lands at `k`, `k+1`, `k+4`. The
  `k+4` third is one full turn up, directly above the root, so the three notes
  form a small, compact triangle.
- A **minor triad** is `k`, `k+1`, `k-3` — equally compact.
- A **dissonant cluster** spreads its vertices around the helix into a stretched
  polygon.

The demo makes this legible on purpose: the ii–V (Dm7, G7) draw spread
four-note shapes, then the resolution to C snaps into a compact major triangle.

Each pitch class is a small glowing sphere, color-coded around the circle of
fifths within the violet accent family and labelled with its note name. A note
is drawn at the helix representation of its pitch class **nearest the current
center of effect**, which keeps voice-leading local and chords compact — the way
Chew's model resolves a pitch to its nearest spelling.

## The center of effect

The bright drifting marker is Chew's **center of effect (CE)**: the weighted
centroid of the pitches sounding over roughly the last two seconds, with older
notes decaying exponentially (τ ≈ 1.1 s). It is an actual tonal-analysis device
— where the CE settles estimates the tonal region / key you are in, shown live
as the "center of effect" readout. As you play it glides through the crystal.

## Input modes (degrade gracefully)

1. **Web MIDI** (primary) — "Connect MIDI" requests `navigator.requestMIDIAccess()`
   behind the user gesture; note-on lights a node and plays a voice, note-off
   releases it. Hidden if the browser has no Web MIDI.
2. **Microphone pitch** (fallback) — "Use microphone" opens the mic, runs
   normalized-autocorrelation pitch detection, and lights the nearest MIDI note.
   Monophonic. On denial it shows an on-brand notice and the demo keeps running.
3. **Seeded self-playing demo** (always) — a ii–V–I in C under a walking melody,
   driven by a fixed `mulberry32(0x5720)` PRNG so it is identical every run. It
   auto-starts on the first "Start" click (browsers require a gesture to unlock
   the AudioContext). Before Start, the crystal renders statically rotating.

Audio is a clean Web Audio synth: soft plucked triangle voices through a lowpass
and a short delay tail, summed into a master gain (≤ 0.2) and a
DynamicsCompressor, so the piece makes real sound with no MIDI device attached.

Drag the crystal to reorient it; it reads fine untouched. Auto-rotation is gentle
(~6°/s) and there is no strobe or flicker.

## Reference

Elaine Chew, *Mathematical and Computational Modeling of Tonality: Theory and
Applications* (Springer, 2014) — the Spiral Array model and its center-of-effect
tonal-analysis device.

## Honest known rough edges

- Mic pitch detection is **monophonic** and can octave-jump on noisy or quiet
  input; it will not resolve chords.
- Because a note is placed at the representation nearest the moving center of
  effect, a lone repeated pitch can settle onto a *different* helix node as the
  harmonic context drifts.
- Key estimation is a **nearest-node heuristic** on the CE, not Chew's full
  key-finding (which compares the CE against precomputed key centers).
- The chord polygon is a centroid fan of the currently-sounding pitches, so a
  melody note landing over a sustained chord adds a vertex — honest, but it can
  briefly widen an otherwise-compact triangle.
