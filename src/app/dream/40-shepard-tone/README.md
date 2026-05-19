# 40-shepard-tone — design notes

**Route**: `/dream/40-shepard-tone`  
**Cycle**: 45 · **Status**: demoable  
**Question**: what if a tone could ascend forever without ever getting higher?

---

## The illusion

A Shepard tone is a superposition of sine waves spaced one octave apart, each with its
gain shaped by a bell-curve envelope centered in the audible midrange (~440 Hz). As all
the oscillators glide upward simultaneously:

- The high-frequency end fades to silence before it leaves the audible range
- A new tone fades in at the low-frequency end, picking up where the others started
- The ear perceives only the loud middle oscillators — which are always rising

The wrap is imperceptible because the extremes are nearly silent. The result: a tone that
rises forever. Roger Shepard discovered this in 1964; it's the canonical auditory illusion
and directly relevant to Resonance's "transcendent listening" vision.

## Implementation

**8 OscillatorNodes** tuned to A1–A8 (55 Hz, 110 Hz, 220 Hz ... 7040 Hz).

**Gain envelope** (per oscillator, per frame):

```
log2f = log2(A1) + oscIndex + phase          // actual log2 frequency
z     = (log2f − log2(440)) / sigma          // deviation from bell center
gain  = exp(−0.5 × z²)                       // Gaussian bell
```

With sigma = 1.5 octaves, the gains at phase=0:
- A4 (440 Hz): 1.00 (brightest)
- A3 / A5: 0.80
- A2 / A6: 0.41
- A1 / A7: 0.14
- A8: 0.03 (essentially silent — the wrap point)

**Phase** advances at `rate ÷ 60` octaves/second. When it wraps from 1.0 → 0.0, each
oscillator's frequency wraps one octave down, but the gain envelope means the extremes
are already silent — the wrap is inaudible.

**Interval modes** quantize the phase to discrete steps:
- Chromatic (default): smooth continuous glide
- Whole-tone: 6 steps/octave — the illusion acquires a staccato march rhythm
- Semitone: 12 steps/octave — individual pitch classes are distinct, staircase is audible

**Mic mode**: RMS amplitude → effective rate multiplier (0.5× at silence, 4× at loud input).
Playing loudly into the mic drives the staircase faster.

## Visualization

**Logarithmic spiral** (left): represents the "helical" model of pitch — chromatic height
(coil angle) + register (spiral radius). The dot moves along the spiral as phase advances.
The spiral rotates by one full coil per octave traversal, so the dot always circles while
the scale appears to ascend.

**Oscillator circles** (right column): A1 at bottom, A8 at top. Each circle glows
proportional to its current gain. At any moment, the 2–3 brightest circles are the
dominant tone; the top and bottom are nearly dark. As the phase advances, brightness
sweeps upward one position — then resets from the bottom, invisibly, because A8 has
already faded and A1 was already dim.

## Psychoacoustics context

The illusion works because the auditory system uses **spectral dominance** to judge pitch
height: you hear the loudest partial, not the fundamental. Shepard exploited this by
ensuring the dominant oscillators (A3–A5) are always rising, while the extremes (A1, A8)
are too quiet to anchor the percept.

Resonance relevance: this is the first prototype about the *gap between physical sound and
perceived sound*. Every other prototype visualizes what the microphone hears; this one
demonstrates that your brain is not the microphone.

## Polish ideas

- **Tritone paradox**: Diana Deutsch (1986) showed that the perceived direction of a
  Shepard-scale tritone (6 semitones) depends on the listener's native language and
  dialect — a single tone is heard as ascending by half of listeners and descending by
  the other half. Could add a "tritone test" button.
- **Glissando mode**: instead of a fixed rate, let the rate follow a slow LFO (0.5–10×).
  The apparent tempo of the illusion breathes.
- **Risset rhythm**: James Risset's temporal analog of the Shepard tone — a rhythm that
  accelerates forever without ever getting faster. Could be a companion prototype.
- **Phase visualization**: draw each oscillator's frequency as a point on a logarithmic
  number line; the dots scroll right while new ones materialize at the left.
