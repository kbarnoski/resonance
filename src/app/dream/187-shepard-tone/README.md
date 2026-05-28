# 187 — Shepard Tone

**Route**: `/dream/187-shepard-tone`  
**Cycle**: 219 · adult build  
**Status**: demoable  

---

## What this answers

> "What if Resonance played a note that ascended forever without ever getting higher?"

The Shepard tone (Roger Shepard, 1964) is the canonical auditory illusion of infinite pitch
ascent. It proves that pitch perception is a mental construction, not a physical fact. A sound
can seem to rise endlessly even though its pitch space is circular and bounded. This connects
directly to Resonance's "transcendent listening" thesis: what we hear is not what is physically
happening.

---

## How it works

Eight sine-wave oscillators run simultaneously, each one octave apart:  
A1 (55 Hz) → A2 (110 Hz) → A3 (220 Hz) → A4 (440 Hz) → A5 (880 Hz) → A6 (1760 Hz) → A7 (3520 Hz) → A8 (7040 Hz)

Each oscillator's amplitude is controlled by a **bell curve** centered at A5 (~880 Hz) with σ = 1.5 octaves:
- The middle range (A3–A7) is loudest
- The extremes (A1, A8) fade to near silence (gain ≈ 0.03)

As all oscillators slowly rise in pitch together (`phase` advances at `rate/60` octaves per second):

1. Each oscillator's position wraps modulo 8 octaves: when an oscillator reaches A8 and rises
   further, its frequency would leave the audible range — but it's already inaudible by then
   (bell weight ≈ 0). The wrap-back to A1 is not perceived.
2. The *center of mass* of the bell curve always stays in the middle of the audible range.
3. The only thing the ear tracks is: "the loudest part is rising." Since that part rises
   forever, the whole pitch feels like it rises forever.

Descending Shepard tones work identically (reverse direction). The **tritone paradox**: if
you play the same tritone (6-semitone interval) ascending vs. descending, half of listeners
hear it going up and the other half hear it going down, depending on language background and
musical exposure. Freeze mode lets you land the needle on any fixed pitch position for static
chord experiments.

**Mic mode**: microphone RMS amplitude modulates the ascent rate (louder playing → faster rise).
Useful for live performance: the performer's dynamics push the staircase harder.

---

## Visual

**Left column**: 8 circles labeled A1–A8, each glowing in proportion to its current bell-curve
weight. A wave of brightness sweeps continuously upward (ascending) or downward (descending).
The Hz value updates in real-time as each circle's frequency shifts. The visual reveals exactly
what the audio is doing — you can see that no single circle is ever brightest for long.

**Right dial**: a circular compass with 8 spokes. The needle sweeps continuously; one full
rotation = one octave traversal (15 seconds at default speed). The circular geometry mirrors
the circular nature of the illusion: pitch *appears* to go up forever, but the needle's
trajectory is a closed loop.

---

## Connections

- **`42-binaural`** — another psychoacoustic prototype (binaural beats, brainwave entrainment).
  The two together form the psychoacoustics corner of the dream lab.
- **`5-arcs` / `157-concept-steer`** — this prototype demonstrates what "phase-based" music
  really means: not a metaphor, but a literal circular space the listener traverses.
- **Live performance**: a venue fills with a Shepard tone at low volume → listeners walk in
  hearing "rising" music → the music never arrives. Tension is created without resolution.
  Freeze + switch to Falling mid-performance for dramatic effect.

---

## Polish ideas

- **Tritone paradox demo mode**: play tritone intervals (6 semitones apart) ascending vs.
  descending; show two buttons "Did you hear it go UP or DOWN?" and tally responses.
- **Timbre variants**: sawtooth Shepard tone (harsher), triangle Shepard tone (softer than sine).
- **Glissando trails**: add subtle canvas trails that sweep upward like rising sparks, matching
  the perceived pitch motion.
- **Step mode**: instead of smooth glide, advance in quantized semitone jumps at a configurable
  BPM (the "Deutsch chromatic scale illusion" variant).
