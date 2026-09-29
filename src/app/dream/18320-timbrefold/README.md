# 18320 · Timbrefold

**Status**: demoable — builds clean, degrades gracefully, idle state alive.

## What if?

What if you could reshape the *resonant body* / vocal tract of your own
recording with your two hands — bending its timbre from glassy to woody to
vowel-like, while its pitch and melody stay exactly the same?

Karel's solo piano is the **source**; your two hands are the **filter**. Raise
your right hand to shrink and brighten the resonant body, lower it for a large,
chesty one. Raise your left hand to make the sound glassy, lower it to make it
dark and woody. Spread both hands apart to make the piano *sing*; bring them
together and you hear the untouched original. Slide both hands left↔right and
the vowel sweeps from /u/ through /o/, /a/, /e/ to /i/. Through all of it the
notes never move.

## Two-hand mapping

- **Right-hand height → formant warp** (resonator size): 0.65 (large / chesty /
  dark) … 1.7 (small / bright). Every formant frequency is multiplied by it.
- **Left-hand height → spectral tilt**: a ±10 dB low-shelf / high-shelf seesaw —
  low hand = dark/woody, high hand = bright/glassy.
- **Distance between the hands → morph depth** (0…1): together = dry original
  (0 dB of formant boost), apart = fully vocal.
- **Midpoint x → vowel** sweep across a Peterson–Barney table,
  /u/→/o/→/a/→/e/→/i/, interpolating between adjacent presets.

## Design notes

**Source-filter model (Fant).** Any voice splits into a *source* (the glottal
buzz — the fine harmonic structure that carries pitch) and a *filter* (the
vocal tract, whose resonances, the formants, colour the sound into vowels).
Here the source is the recording, played at `playbackRate = 1.0` and never
retuned. The filter is a bank of **four `"peaking"` BiquadFilterNodes in series**
(F1–F4) that *boost* formant regions rather than isolating them — source-filter
shaping, not a band-pass spotlight — so the whole piano still sounds through
while growing a resonant body. A `"lowshelf"` + `"highshelf"` pair adds the
spectral-tilt axis. Everything terminates in `createSafeMaster(ctx).input`;
visuals are driven from `safeMaster.analyser`.

**Why pitch is preserved.** Peaking filters and shelves reshape only the
spectral *envelope* — the relative loudness of each region. The harmonic fine
structure the ear reads as pitch and melody is untouched, and the buffer's rate
never changes. So the timbre morphs from glassy to woody to vowel-like while
every note stays exactly where it was. Morph depth interpolates all peaking
gains from 0 dB (dry original piano) up to full formant boost (fully vocal);
every parameter is smoothed with `setTargetAtTime(..., 0.10–0.15)`, so no zipper
noise and no lag-death.

**Prismatic palette.** Frequency maps to spectral hue — deep red at the low
end, through orange, yellow and green, to blue and violet at the top. Three
composited SVG layers: (1) the glowing formant-envelope curve — the visible
"throat", its peaks riding exactly on the warped formant frequencies, filled
with a prismatic gradient; (2) a partial field of ~56 log-spaced spectral bars
dancing to the analyser magnitude; (3) a timbre-space constellation plotting
brightness (tilt) × resonator-size (warp) with a fading comet trail and vowel
glyphs around the sweep.

**Degrades gracefully.** No camera or model → a pointer fallback (mouse x/y
shapes the body, click spreads the hands) with a visible notice, while a
labelled autonomous demo drive keeps the whole warp/tilt/morph/vowel chain
running headless. The status line always states whether you are seeing
`tracking · live`, `demo · autonomous`, `pointer · fallback`, or a lost-hands
hint — the demo is never presented as live.

## References

- **Grey, J. M. (1977), "Multidimensional perceptual scaling of musical
  timbres"** (JASA 61:1270) — the timbre-space constellation.
- **The source-filter model of sound production (Fant)** / peaking-formant
  vocal-tract filtering — the movable-formant engine.
- **MuseTimbre — Zero-Shot Timbre Transfer (arXiv:2609.30548, 28 Sep 2026)** —
  timbre as a controllable axis independent of pitch.
