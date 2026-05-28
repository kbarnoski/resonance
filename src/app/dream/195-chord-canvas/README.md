# 195 · Chord Canvas

**For**: pianists, composers  
**Cycle**: 227 · 2026-05-28  
**Route**: `/dream/195-chord-canvas`

## What it does

Real-time chord detection from mic or demo audio. Six chord quality types (major, minor, dominant 7th, minor 7th, major 7th, diminished) identified via 12-bin chroma + dot-product template matching.

Three panels:
- **Hero**: large chord name at the top, colored by pitch class and quality
- **Timeline**: scrolling strip — each chord = a colored block, width proportional to how long you held it, older blocks fade left
- **Chromagram**: 12 pitch-class energy bars at the bottom; root pitch class highlighted

Color encoding:
- Pitch class → hue (chromatic wheel: C=0°, C#=30°, ..., B=330°)
- Major: high saturation
- Minor: desaturated
- Dominant 7th: warm hue shift (+18°)
- Diminished: near-grey
- Major 7th: slightly cool hue shift (−10°)

## Design notes

This is the first prototype that names musical structure explicitly — 194 prior prototypes visualize signal properties (spectrum, pitch, timbre, onset). A pianist playing in D minor sees "Dm" immediately; a jazz musician playing Dm7 → G7 → Cmaj7 sees each chord named and colored as it scrolls past.

Chroma extraction: sum FFT magnitude bins (linear scale from dB) into 12 pitch classes, C2–C8 range. EMA smoothing (α=0.11) prevents rapid flickering. Chord selection by dot-product against 72 precomputed binary templates (12 roots × 6 qualities). Template matching scores the presence of chord tones in the current chroma without penalizing extra tones — reasonable for piano where overtones contribute to the chromagram.

Demo sequence: Dm7 → G7 → Cmaj7 → Bdim, 3 reps. Shows all six quality types across the session.

## Polish ideas

- Add aug (augmented) and sus4 templates
- Sharps vs flats: show "Bb" instead of "A#" for keys that prefer flat notation
- Confidence indicator: when the top template score >> others, show brighter display
- Export chord sheet: download the session's chord sequence as plain text
- Chord tone overlay: show which notes of the chord are active in the chromagram
