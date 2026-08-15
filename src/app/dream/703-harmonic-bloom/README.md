# 703 · Harmonic Bloom

**The one question:** *What if you could SEE Karel's harmony — watch each chord
change re-bloom a mandala, and feel the form move underneath?*

Pick a piece. Its real chord progression (from the track's musical analysis)
drives a slow rose:

- **Root** note → hue around the circle of fifths.
- **Minor / diminished** → cooler, dimmer color.
- **Richer chords** (7ths, 9ths, 11ths, add-tones, slash voicings) → more petals.
- Each change nudges rotation and sends a **bloom** pulse that decays.
- The prose **section** summary tints the whole field, so the form is felt.

All eased, never cut — transitions stay smooth.

## How it works

- `loadTrackAnalysis(id)` (`_shared/trackAnalysis.ts`) → `chords[]` + parsed
  `summary.sections` (timestamp ranges pulled from the section labels).
- Playback position (`ctx.currentTime − startedAt`) walks the chord list; the
  active chord sets the visual targets, which the render loop eases toward.
- `chordRoot` / `chordIsMinor` / `pitchClassHue` helpers do the harmony→color map.
- Audio → `createSafeMaster` → speakers. Canvas2D rose curve, additive layers.
