# Chord Canvas — design notes

**Route**: `/dream/141-chord-canvas`  
**Cycle**: 167 (adult build)  
**Status**: `demoable`

## What it answers

*What if Resonance could name the chord you're playing?*

140 prior prototypes visualize audio signal properties — energy, spectrum,
pitch, tempo. None name the musical structure. Chord Canvas is the first
bridge from signal analysis to music theory.

## How it works

**Chroma extraction**: sum FFT magnitude squared into 12 pitch-class bins
(C, C♯, D … B), using only the piano range C2–A♯6 (65–1800 Hz). Energy
outside this range is excluded so bass resonance and cymbal noise don't
confuse the detector.

**Template matching**: 24 chord templates (12 major + 12 minor triads).
Each template is a 12-element binary vector indicating the chord tones.
Dot-product correlation with the normalized chroma vector gives a score;
highest score wins. Major template `[1,0,0,0,1,0,0,1,0,0,0,0]` rotated
to each root covers the full major triad family; same for minor.

**Stability filter**: a chord must be detected consistently for 5
consecutive frames (~83 ms at 60 fps) before it commits. This prevents
flickering during transitions. The display shows the *last committed*
chord while a new one accumulates stability — no "detecting..." flicker
during normal playing.

**Timeline**: a 30-second scrolling strip. Each chord block is a colored
rectangle — hue from the root pitch class (C=violet, cycling outward),
saturation from quality (major=vivid, minor=desaturated). Block width =
hold duration. A cursor mark at the right edge is "now." Named labels
appear in blocks wide enough to fit text.

**Chromagram**: 12 pitch-class bars at the bottom, heights proportional
to EMA-smoothed chroma energy. Active chord tones (root, third, fifth)
highlight brighter. Note names label each column.

## Demo mode

A ii–V–I progression in C major repeating: Dm (D3, F3, A3) → G7 (G2,
B2, D3, F3) → C (C3, E3, G3), each chord 2 seconds. G7 includes the F
(7th), which slightly confuses the triad detector — it registers as G or
Gm depending on which notes dominate the analysis. This is a known
limitation of triad-only templates; adding 7th templates would fix it.

## Known limitations

- Polyphonic piano: works best with clear block chords. Rapid melody notes
  over a sustained chord register as the wrong root (the melody notes add
  chroma energy to non-chord pitch classes).
- Minor vs. relative major: Am and C share two of three tones (C, E). The
  detector usually distinguishes by root weight but may slip near boundaries.
- No 7th, suspended, or augmented chords — 24 templates only.

## Polish ideas

1. Add 7th chord templates (12 dom7 + 12 maj7 + 12 min7) → 48 templates.
   Dom7 differentiates G7 from G. Maj7 covers Cmaj7.
2. Display the detected pitch class weights as a bar chart overlay on the
   chord name — show *why* the chord was detected (how much C vs E vs G).
3. Confidence meter: if the top template score is close to the second-best,
   show both candidates (e.g. "C / Am").
4. Session export: download the chord timeline as a text transcript
   (timestamp → chord name).
