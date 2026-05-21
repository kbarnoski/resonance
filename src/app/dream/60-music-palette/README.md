# 60-music-palette

**Question**: what if your music had a color story?

## What it does

Mic input (or demo LFOs) → 6-band FFT → two emotion coordinates → 5-color HSL palette.

**Arousal** (bass + sub-bass energy, 0=calm → 1=energetic) → palette lightness (28–72%).
**Valence** (treble-to-total ratio, 0=sad → 1=happy) → hue anchor (250°=blue → 50°=warm yellow).
**Richness** (std dev of 6 bands, 0=sparse → 1=full spectrum) → saturation (32–80%).

Five swatches are generated at hue offsets [-60°, -30°, 0°, +30°, +60°] from the anchor,
each showing its hex code and HSL values. All five update together via a slow EMA
(~1.5s time constant) so the palette breathes rather than flickers.

The lower panel is the `1-live` bloom ring — same 6-band radial color field —
so you can see the raw audio energy that's driving the palette above.

Download SVG exports the current 5-color palette labeled with arousal/valence coordinates
and hex codes. Each download is a unique chromatic snapshot of that musical moment.

## Color design rationale

The hue axis follows the cross-modal alignment research (Music2Palette, ACM MM 2025):
happy/energetic music clusters in warm yellows and oranges; sad/introspective music in
cool blues and purples. The axis isn't arbitrary — it matches how listeners describe color
and music together across cultures.

Lightness from arousal is the most visually immediate variable: an energetic forte chord
lifts the palette toward bright pastels; a quiet pianissimo passage drops it toward deep,
muted tones. This makes the palette feel physically "heavy" or "light" in response to the
dynamics.

Richness from spectral spread: a single sine tone has zero richness (all energy in one band);
broadband noise has maximum richness (energy everywhere). The saturation tracks this — dense,
spectrally rich music produces vivid swatches; pure sustained tones produce muted, contemplative ones.

## Technical notes

- Zero external deps — Web Audio AnalyserNode + Canvas2D + CSS.
- EMA alpha = 0.011 → ~1.5s time constant at 60fps. Faster makes it flicker; slower makes
  it unresponsive. This value was tuned to feel like the palette is "listening" rather than
  "reacting."
- SVG export is client-side, instant, no backend.
- Demo LFOs: rates [0.071, 0.113, 0.137, 0.179, 0.197, 0.233] Hz — all irrational multiples
  of each other so the pattern never exactly repeats within a session (~4-hour period before
  near-repetition).

## Polish ideas for future cycles

- Show the palette's narrative: "calm · sad" / "energetic · bright" as a text label below the swatches.
- Persist palette history as a scrolling timeline strip — watch the color story unfold across a full session.
- Add a "lock" button to freeze a favorite palette while audio continues.
- MIDI input: sustain pedal → freeze; expression pedal → valence axis override.
- Ghost scene integration: when the detected emotion quadrant matches a Ghost scene (e.g., calm+dark = Stone Chamber), overlay the scene name subtly.
