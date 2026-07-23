# 2348 · Tritone Veil

## The one question

**What if a piece could reveal your own private, involuntary perceptual
signature — and then build a world around whatever YOU hear?**

## The mechanic — Diana Deutsch's Tritone Paradox as a self-portrait instrument

The tritone paradox (Diana Deutsch, 1986/1991): two octave-ambiguous "Shepard"
tones a tritone (half-octave) apart are played. The pitch is objectively
ambiguous — there is no fact of the matter about whether the pair goes up or
down — yet almost everyone hears it as clearly **rising** or **falling**. Which
way you hear it is _involuntary_, _stable for you_, and _differs
person-to-person_ (Deutsch found it correlates with the pitch range of your
speaking voice and your native dialect/geography). No one can talk you out of
your percept.

The piece:

1. Marches around the 12 pitch-classes of the chromatic circle (C → C♯ → D …),
   playing a tritone pair for each: pitch-class **P**, then **P+6 semitones**.
   Each tone is an octave-ambiguous Shepard tone — six octave-spaced sine
   partials under a fixed Gaussian envelope over log-frequency, so no single
   octave register dominates and the direction is genuinely undecidable.
2. For each pair you tap **▲ rose** or **▼ fell** — your involuntary percept.
3. Answers accumulate into a live **SVG-DOM perceptual map**: a 12-point polar
   diagram over the chromatic circle. Each node fills in with your reported
   direction; a diameter is drawn through the circular-mean resultant — your
   **peak pitch-class**, the axis where perception flips. This is your
   signature.
4. **The payoff.** After a handful of answers a spatialised ambient **choir** of
   ~6 detuned Shepard-Risset voices fades in, panned across the stereo field,
   gliding endlessly in _your_ direction — ascending if you hear rising,
   descending if falling, hovering if you are genuinely split. If your lean
   flips, the room slowly turns to follow it. The world sings in your private
   perceptual direction.

## Two genuinely independent variables — no master knob

- **Objective:** which pitch-class pair is sounding — a deterministic march
  around the circle, drawn as the moving highlight ring on the map.
- **Subjective:** your involuntary percept — your taps, drawn as the filled
  up/down nodes and the signature axis, and the sole driver of the choir's
  glide direction and level.

These cannot collapse into one 0→1 dial: the entire point is _objective
ambiguity versus private perception_. The two channels can and do conflict — the
tones objectively neither rise nor fall, while you unshakeably hear one way.

## Subsystems (4)

1. Octave-ambiguous Shepard-tone synthesis (the stimulus pairs).
2. Spatialised detuned Shepard-Risset **choir** across a `StereoPannerNode`
   field, live-reversible direction.
3. Adaptive harmony that **follows the listener's percept** (circular-mean net
   lean → choir direction + fade-in level).
4. Live **SVG-DOM** perceptual-map visualisation (not canvas).

## Palette

Clinical / Ryoji-Ikeda monochrome: near-black background, cool neutral
greys/whites via semantic tokens, one restrained accent (`text-primary`) used
only to mark the listener's lean. Deliberately off the banned violet→gold
"jeweled" gamut.

## References

- Diana Deutsch, "The Tritone Paradox: An Influence of Language on Music
  Perception," _Music Perception_ (1991); and _Musical Illusions and
  Paradoxes_.
- Roger N. Shepard, "Circularity in judgments of relative pitch," _JASA_ (1964).
- Jean-Claude Risset, continuous (glissando) form of the Shepard scale.

## What I'd deepen next cycle

- Full **HRTF `PannerNode`** spatialisation (with head-relative positions and a
  little movement) instead of stereo panning, so the choir truly surrounds you.
- Repeat each pitch-class several times and show a **confidence band** per node,
  surfacing where your percept is firm vs. wobbly.
- Fit an actual sinusoid to %-rising-vs-pitch-class (Deutsch's own analysis) and
  report the phase, plus an optional mic reading of your speaking-voice pitch to
  overlay the predicted vs. measured peak.
- Let the choir voice a real chord rooted on your peak pitch-class, not only a
  directional cloud.
