# 1928 · Choralis — sing one line, hear four parts

**One question:** What if you SANG a bare melody into Resonance and, in real
time, it built a full four-part chorale UNDER your voice — with real functional
voice-leading, not a safe pentatonic pad?

You sing or hum a single line into the mic. Choralis tracks your pitch, snaps it
to the current key to become the **soprano**, and on each stable note writes a
proper **SATB** harmonization beneath it: a functional chord that contains your
note, then alto / tenor / bass voice-led from the previous chord. The result
progresses, cadences, and can modulate — it is a hymn engine, not a no-wrong-
notes wash.

## Pipeline

1. **Pitch — `pitch.ts`.** A YIN fundamental-frequency estimator implemented from
   the raw analyser time-domain buffer: difference function → cumulative-mean
   normalized difference → absolute threshold → parabolic interpolation, bounded
   to the singing range for speed. Runs on `requestAnimationFrame` (throttled to
   ~45 ms) against a 2048-sample buffer.
2. **Snap.** The detected frequency is quantized to the nearest scale degree of
   the current key (major, or harmonic-minor-flavored minor). That snapped note
   is the soprano.
3. **Harmonize — `harmony.ts`.** On each *new stable* note:
   - **Chord choice.** Candidate chords are the functional chords of the key that
     contain the sung note — I, ii, iii, IV, V, V7, vi, viio, and the secondary
     dominants V/V and V7/V. They are scored by a classic root-motion / cadence
     preference table (ii→V, IV→V, V→I strong; deceptive V→vi allowed), with an
     8-chord phrase clock that leans to the dominant then homes to tonic.
   - **Voice-leading.** An exhaustive small search places bass (root position or
     first inversion), tenor and alto to **minimize total motion** from the
     previous voicing while penalizing: parallel perfect 5ths/8ves, spacing over
     an octave between upper voices, voice overlap/crossing, out-of-range notes,
     incomplete chords, poor doubling (never the leading tone or chordal 7th),
     and **unresolved tendency tones** (leading tone must rise, a V7 seventh must
     fall).
   - **Modulation.** At a strong authentic cadence, with "key wander" on, the key
     occasionally pivots by a fifth — so the piece genuinely modulates.
4. **Sound — `audio.ts`.** Three machine voices (the human is the soprano) as an
   additive choir: two detuned oscillators per voice through a lowpass, gliding
   between notes with soft envelopes, panned and summed into a generated-impulse
   reverb. Legato or detached articulation.
5. **Score — `page.tsx`.** An animated **SVG** four-lane "breathing score": S/A/T/B
   ribbons scroll right-to-left, each note a gold blob, each lane brightening as
   its voice sounds, with a playhead and an illuminated chord numeral.

## No microphone?

If mic access is denied or unavailable, a built-in melody (Ode to Joy) drives the
**same** harmonizer and voice engine so a reviewer with no mic still sees and
hears all four parts. It is clearly labeled as the fallback, and the soprano is
synthesized in that mode.

## Tags

- **INPUT:** microphone / the human singing voice. Silent and dead until a real
  person sings — no self-playing autoplay loop (the demo is an explicit opt-in
  fallback).
- **OUTPUT:** SVG animated four-stave "breathing score" — four horizontal voice
  ribbons that move and light up as each voice sounds (with a subtle CSS gold
  glow); not Canvas2D.
- **CORE TECHNIQUE:** real-time YIN / autocorrelation pitch detection
  (hand-implemented) → rule-based SATB functional-harmony voice-leading engine.
- **HARMONY:** functional tonal harmony with real voice-leading (not pentatonic).
- **PALETTE:** illuminated-manuscript / gold-leaf on deep vellum — warm golds,
  ambers, ochres, cream ink on a dark warm-brown ground.

## Named reference

Implements the "bare vocal melody → coherent multi-part harmony" idea of
**"AI Harmonizer: Expanding Vocal Expression with a Generative Neurosymbolic
Music AI System"** (NIME 2025 / arXiv:2506.18143). That system uses an ML model;
Choralis reaches the same goal with a small **rule-based functional harmonizer** —
no ML, no network calls.

## Self-assessment

- **Hits the brief.** Real hand-rolled YIN detection, a genuine functional SATB
  engine with tendency-tone resolution and parallel-fifth avoidance, secondary
  dominants, cadences and optional modulation, SVG breathing score in the mandated
  gold-on-vellum palette, three live Web-Audio voices under the singer, mic-error
  fallback, key/mode/articulation/wander controls, and the design-notes modal.
- **Where it's approximate.** The voice-leading search is greedy per note (no
  multi-note lookahead), so long-range phrase logic is limited to the 8-chord
  cadence clock; the choir timbre is a simple additive pad rather than a formant
  vowel synth; snap latency is ~90 ms of held pitch before a chord commits.
- **Overall.** Demoable and musically legible — sung or hummed lines produce
  recognizable functional progressions (ii–V–I, deceptive cadences, tonicizations)
  rather than a pentatonic pad, which is the whole point.
