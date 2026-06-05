# 331 · Voice Cathedral

Sing a single steady note and watch it bloom into a sustained voice that joins a
choir surrounding you in 3-D space — a one-person overtone cathedral you build,
one note at a time, with your own voice. **Best on headphones.**

This is one of the lab's non-screen pieces: the primary medium is **spatial
audio (HRTF)**, and the on-screen radar is a deliberately minimal, legible
companion — not a full-screen reactive visualisation.

## How to use

1. Open the prototype and press **Start with my voice** (this creates and
   resumes the `AudioContext` inside the click, as iOS requires, and asks for
   mic permission). A quiet D2 just-intonation drone fades in.
2. Sing a clear, steady note and **hold it** for about a quarter-second. It
   commits as a sustained voice, snapped to the nearest just-intonation degree
   of D2, placed somewhere on a slowly orbiting ring around your head.
3. Let your breath fall, then sing again. **One breath blooms exactly one
   voice.** Stack up to nine; a tenth gently evicts the oldest.
4. No microphone? Press **Auto-demo** to have the cathedral programmatically
   "sing" a slow rising just-intonation arpeggio into the spatial field, so the
   piece is alive and demoable with no mic.

The panel always shows, in plain text: the note you are **singing now**, the
live **voice count**, and the **chord built so far** as named notes
(e.g. `D · A · F♯ · C♯`) — so you recognise what you sang.

## Design notes

- **Input (analysis-only).** A YIN-style autocorrelation detector
  (`pitch.ts`): squared difference function → cumulative-mean-normalized
  difference → absolute threshold (~0.12) → parabolic interpolation for sub-bin
  accuracy. A 5-wide median tracker suppresses octave jumps. Your voice is never
  recorded, stored, or transmitted, and the mic is never routed to the speakers.
- **Commitment gating.** A pitch must hold within ~0.6 semitones for ~120 ms
  before it commits, with a ~700 ms cooldown and a required breath-gap
  (silence) before the next bloom — so a single held note yields one voice, not
  a stream.
- **Just-intonation snap.** Each committed pitch snaps to the nearest
  octave-folded degree of a D2 root (~73.42 Hz) using the ratios
  `[1, 9/8, 6/5, 5/4, 4/3, 3/2, 5/3, 15/8, 2]`, placed in the octave you
  actually sang.
- **Spatial output (HRTF).** Each voice is a sustained additive oscillator
  (fundamental + a few quiet harmonics, ~0.8 s soft attack) routed through its
  own `PannerNode { panningModel: "HRTF", distanceModel: "inverse" }` at a
  golden-angle (137.5°) azimuth on a gentle-radius ring, slowly orbiting. An
  always-on JI root drone anchors the field. The bus is `master (~0.6)` → a
  brick-wall `DynamicsCompressor` (threshold −6, ratio 20, knee 0, fast attack)
  so nine voices + drone never clip, with a procedural `ConvolverNode` reverb
  (synthesised 2.6 s decaying-noise impulse) on a send for cathedral space.
- **Visual (`scene.tsx`).** A minimal inline **SVG** radar — explicitly not
  Canvas2D, WebGL, or three.js. A softly breathing listener dot at centre; each
  active voice a glowing dot orbiting at its azimuth, coloured by scale degree,
  with a faint tether line and its note name. Calm, low information density.
- **Graceful degradation.** If the mic is denied/unavailable, a `rose-300`
  notice appears and the Auto-demo keeps the cathedral alive. Full teardown on
  unmount stops all oscillators, disconnects the mic, cancels the animation
  frame, and closes the `AudioContext`.

## Named references

- Pauline Oliveros, *Deep Listening* — attention as the instrument.
- David Hykes & the Harmonic Choir — overtone singing as architecture.
- La Monte Young — the just-intonation drone as a place to live inside.
- This lab's own `308 · orbit-choir` — the HRTF spatial-voice lineage this
  piece extends (voices placed and orbiting around the listener's head).
- HRTF / spatial-audio context broadly in the spirit of SONICOM-style
  head-related rendering, here via the Web Audio `PannerNode` HRTF model.

## What's unverified (sandbox limits)

I could not test audio, mic, or headphones in this environment. Specifically
unverified:

- **HRTF localisation quality** — whether voices are perceived clearly around
  the head depends on the browser's built-in HRTF and the listener's headphones;
  not auditioned here.
- **Pitch-detector accuracy on real voices** — thresholds, RMS gate, and the
  median window are tuned by reasoning, not against live singing; breathy or
  very low voices may need tuning of `minHz`/`rmsGate`.
- **Commitment feel** — the 120 ms / 700 ms / breath-gap timings give
  "one breath, one voice" in theory; the exact feel may want adjustment.
- **Clipping headroom** — the brick-wall compressor should prevent clipping
  with drone + 9 voices, but the precise loudness was not measured.
- **iOS gesture gating** — the `AudioContext` is created/resumed inside the
  Start/Auto-demo click handlers as required, but not verified on a device.

All four source files (`page.tsx`, `pitch.ts`, `audio.ts`, `scene.tsx`) pass
`tsc --noEmit` and ESLint clean.
