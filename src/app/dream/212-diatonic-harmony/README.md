# Diatonic Harmony

**For**: pianists / composers  
**Route**: `/dream/212-diatonic-harmony`  
**Built**: Cycle 245 (2026-05-30 UTC)

## What it does

Play a melody into the mic. Every detected note is immediately joined by two
companion voices: the diatonic third above and the diatonic fifth above, both
tuned to the key you're playing in. The three voices scroll left as a three-lane
piano roll — THIRD (light blue, top), YOU (orange, middle), FIFTH (deep blue, bottom).

The key is detected in real time via the Krumhansl-Kessler tonal hierarchy: a
12-bin chroma vector accumulates from detected pitches, then dot-products against
24 major/minor key templates (one per root × mode combination). The highest-scoring
template is the key. Once 4+ notes are detected, a key label appears in the footer.

## Audio architecture

- **Melody**: 3-partial sine piano (1 + 0.28 + 0.09 of fundamental), panned center
- **Third voice**: same 3-partial piano, panned +0.28 (soft right), gain 0.22
- **Fifth voice**: same 3-partial piano, panned -0.28 (soft left), gain 0.22
- **Reverb**: exponential white-noise IR, 0.85s, 35% wet on all three voices
- Each note envelope: 15ms linear attack → 0.85s exponential decay

The panning is subtle (±0.28, not hard left/right) — enough to give the harmony
spatial separation without breaking the blend on mono speakers.

## Key detection

Standard MIR approach: Krumhansl-Kessler (1990) tonal hierarchies. The 12-bin
chroma vector counts pitch-class activations across the session; a dot product
against each of 24 rotated major/minor templates gives a similarity score. The
highest score is the current key. This updates live as you play — if you shift
from C major to A minor, the key label and harmonization both update naturally.

## Diatonic harmonization

Given a note `m` in key `{rootPc, mode}`:
1. Compute pitch class relative to root: `pc = ((m - rootPc) % 12 + 12) % 12`
2. Find nearest scale degree (Euclidean distance mod 12 — handles chromatic notes
   by snapping to the closest diatonic step)
3. Add `stepsUp = 2` for the third, `stepsUp = 4` for the fifth
4. Wrap octave: `Math.floor(newDeg / 7)` gives the octave offset; `newDeg % 7`
   gives the scale position within the octave

This produces correct diatonic intervals at every scale degree:
- Degree I (C): third = E (major third, +4st), fifth = G (perfect fifth, +7st)
- Degree VII (B): third = D (minor third, +3st), fifth = F (diminished fifth, +6st)

## What's new about this prototype

26 existing prototypes visualize audio signal properties — FFT bands, chroma,
pitch trajectories. None add *musical theory output* to a live performance. This is
the first prototype that knows what key you're in and generates scale-correct
companion voices automatically. A pianist can play any melody and hear a complete
three-voice texture without any theory knowledge.

Different from `23-pitch-harmonize` (that one pitch-shifts the raw mic signal by a
fixed interval — always a fifth, always the same). This generates *diatonic* intervals:
the third above B in C major is D (minor third, 3 semitones), not D♯ (major third,
4 semitones). The harmonization is musically aware, not mechanically shifted.

## Polish ideas

- **Chord detection overlay**: display the current chord name (e.g. "Cmaj" / "G7")
  from the 3-voice combination using `28-chord-canvas`'s template matching
- **Voice count selector**: 2 voices (melody + third) / 3 voices (melody + third +
  fifth) — simpler texture option
- **Voice transposition**: option to put the third/fifth in a different octave
  (e.g., third below the melody instead of above — parallel tenths)
- **Key override**: a manual key picker for when the auto-detector hasn't gathered
  enough notes (useful for short phrases)
- **Non-Western modes**: Dorian, Phrygian, Mixolydian — diatonic thirds/fifths in
  those modes have different flavors (Dorian sixth has a characteristic raised sixth)
