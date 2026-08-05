# 7096 · VoxGlyph

**The one question:** *What if your VOICE were the brush — you hum or sing a
continuous line and its pitch-contour becomes a calligraphic stroke that
CONDUCTS a living generative ensemble that keeps composing around you?*

## What it is

Sing or hum a continuous line. A hand-rolled pitch tracker reads your voice
each frame and draws it as a luminous violet **ink stroke** (x = time scrolling
left, y = pitch, thickness = loudness). That same contour is not turned into
notes directly — instead its **kinematics** become a live control layer over a
rule-based generative ensemble that blooms its own distinct timbre *around*
your line.

This is the Calliphony idea (Wu, Yu & Xia, *Calliphony*, arXiv **2608.03040**,
4 Aug 2026): a continuous performative stroke is read for its kinematics and
used to constrain a generative-music engine — the paper's own axes are
**"note density, pitch constraints, and accompaniment-layer activation."**
It is **stroke-dynamics → generative-parameters**, not paint-to-pitch. Here the
"stroke" is the vocal pitch-contour.

## The mapping (vocal contour → Calliphony parameters)

| Contour feature | Extraction | Drives |
| --- | --- | --- |
| Rate of pitch change (contour slope) | `|Δlog2 f0| / Δt`, smoothed | **Note density** — fast melisma = dense flurry, held tone = sparse |
| Sung pitch (y) | f0 → nearest scale step | **Pitch register window** the lead draws from |
| Turns & leaps | direction reversal / interval > ~2.5 semitones | **Accompaniment activation** — chord shifts, fresh pad |
| Loudness (RMS) | time-domain energy | **Dynamics + brightness** (velocity + filter cutoff) |
| Breath / silence (voiced→unvoiced gap) | voiced-run then unvoiced-run | **Phrase boundary** — cadence toward home (i), lead rests |

## Pitch detection

A hand-rolled **normalized autocorrelation** over the analyser's 2048-sample
time-domain buffer (`detectPitch` in `engine.ts`). Per-lag normalized
correlation is scanned for the strongest low-lag local peak (curbing
octave-halving), then parabolic interpolation refines the lag. Silent frames
(low RMS) and aperiodic frames (low clarity) return **unvoiced**, which the
pipeline reads as breath. No libraries.

## The generative engine

Rule-based, **seeded with `mulberry32(0x7096)`** (no `Math.random`, no
`Date.now`, no `new Date` — all timing is the `AudioContext` clock), stateful,
scale-snapped to **D Dorian** so it is always consonant. Three layers:

1. **Lead / counter-melody** — emits at a rate set by density; pitches from the
   register window around your sung note; short memory biases small, stepwise
   intervals for coherence.
2. **Pad** — sustained triad that activates and shifts on contour turns, moving
   through a small dorian progression (i · IV · v · ♭VII) around the center.
3. **Bass / pulse** — low anchor on the chord root; subdivision tracks density.

Voices are `Oscillator → Biquad → Gain` with ADSR and full teardown, summed
through a shimmer feedback-delay, a warm lowpass, and a compressor. The timbre
is deliberately distinct from the voice so it reads as accompaniment.

## Alive on load

On mount the page runs a **seeded auto-drawn demo contour** (a smooth,
vocal-like line built from seeded LFOs with periodic breaths) through the exact
same control pipeline, so a silent screenshot is legible without a microphone.
"Play demo" sounds the ensemble over that contour; "Sing to compose" requests
the mic and hands over. If the mic is denied/unavailable the demo keeps
running and an on-brand `text-destructive` notice appears — never a dead
screen.

## Flow-state framing

The loop is meant to reward continuous, exploratory phonation: hold a tone and
the ensemble opens into space; run a melisma and it thickens; leap and the
harmony turns under you; breathe and it settles home. The instrument follows
your line rather than quantizing it, so attention stays on the voice.

## Limitations

- Monophonic autocorrelation is sensitive to room noise and can octave-jump on
  breathy or very low voices; unvoiced/voiced gating is a simple RMS + clarity
  threshold.
- Density and turn detection are frame-rate-derived heuristics; extreme vibrato
  can over-trigger turns.
- Latency is best-effort (browser mic buffer + look-ahead scheduling); this is a
  responsive sketch, not a low-latency instrument.
- Canvas2D only this cycle — no spectral display of the ensemble itself.

## Constraints honored

`"use client"` · Web Audio + Canvas2D only (no WebGL/three.js) · no npm deps ·
no API route / network · `mulberry32(0x7096)` determinism · `PrototypeNav`
present · full teardown (rAF cancelled, mic tracks stopped, nodes disconnected,
`AudioContext` closed) · alive without a mic · graceful mic-denied degradation.
