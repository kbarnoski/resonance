**For**: kids (4+)

# 941 · Choir Bloom

## The one question
What if a 4-year-old could **conduct a choir** by dragging singing blob-creatures
up and down to **pitches** — and a voice-leading brain turned their melody into
real **four-part harmony** — rendered as luminous GPU **metaballs** that merge and
bloom as the voices harmonize?

This is deliberately a piece where **melody and harmony ARE the idea**. Pitch is the
expressive material the child controls. Moving a voice genuinely changes the MELODY
and the HARMONY underneath it — it is not a no-wrong-notes drone-and-texture toy.

## The interaction (no reading required)
- Four voice-creatures sing continuously (always-on, never silent): **soprano (rose)**,
  **alto (amber)**, **tenor (emerald)**, **bass (violet)**, each a glowing metaball.
- **Drag the rose soprano blob up/down** to set its pitch. Vertical position maps to a
  pitch **snapped to a C-major diatonic scale** — always in tune, but the child genuinely
  chooses each note and hears a melody. The blob is the large (≥64px) drag handle.
- The soprano's scale degree implies a diatonic chord: **1→I, 2→ii, 3→iii, 4→IV, 5→V,
  6→vi**. The other three voices **voice-lead** to the nearest tones of that chord (each
  glides to the closest chord tone to its current pitch), so drawing a melody with the
  lead blob makes **real chord changes emerge underneath** — a harmonic arc you can hear.
- Glides use `setTargetAtTime` (~90–140 ms) — smooth, never clicky.
- After ~2 s of no touch, a gentle **auto-demo** drifts the lead voice through a little
  diatonic tune, so an unattended glance sees the metaballs move/bloom and hears the
  choir + harmony within ~1 s of starting.
- A harder/faster drag **never** gets louder or harsher — only pitch changes.

## Synthesis — formant source-filter "ahh" singing
Each voice is classic source-filter DSP (**not** samples, **not** granular, **not** AI):
a glottal **source** (two slightly detuned band-limited sawtooth oscillators with a slow
~5 Hz vibrato of ±~15 cents) → a parallel bank of 3–4 **bandpass `BiquadFilter`s** at vowel
**formant** frequencies (warm /a/ ≈ F1 700, F2 1100, F3 2600 Hz) → per-voice gain. Higher
voices are voiced brighter, the bass darker, per register colouring.

**Kids-safe audio chain:** sum voices → `masterGain` (~0.26) → lowpass `BiquadFilter`
(~6.5 kHz) → `DynamicsCompressor` (−10 dB, 20:1) → destination. Fades in gently; no sudden
loud transients.

## Voice-leading harmony engine
`voices.ts` snaps the conducted note to C-major, derives the implied diatonic triad from
the soprano's scale degree, and moves each lower voice to the **nearest chord tone within
its range** (Aldwell & Schachter's smooth voice-leading principle). The bass is nudged
toward the chord root for a clear harmonic floor, and inner voices are kept off unisons.
A `consonance()` measure (close-voiced, evenly stacked chord) drives the visual **bloom**.

## Visuals — WebGPU → WebGL2 → DOM
- **Primary:** WebGPU (`navigator.gpu`) with a WGSL fragment pipeline (`gpu.ts`) evaluating
  a four-source **metaball iso-field** and outputting a warm additive glow that blooms
  brighter as the voices become consonant and close. Background is cozy dark violet/indigo.
- **Fallback:** a hand-written raw **WebGL2** fragment shader (`webgl-fallback.ts`) rendering
  the same field. **No three.js. No Canvas2D for the main render.**
- **Last resort:** if neither GPU path initializes, a plain-DOM radial-gradient glow view
  keeps the audio alive plus a `text-rose-300` notice.

## References
- **Blob Opera** — David Li, Google Arts & Culture (2020). The interaction model rebuilt
  here (drag a blob up/down for pitch; a brain harmonises in real time) — using classic DSP,
  not a neural net.
- **Cantor Digitalis / Chorus Digitalis** — IRCAM/LIMSI. Gesture-controlled formant
  singing-voice synthesis (source-filter model) — the synthesis approach.
- **Aldwell & Schachter, _Harmony and Voice Leading_** — inner voices move to the nearest
  chord tone (smooth voice-leading) — the harmony engine.
- **RESEARCH §550 (2026-06-25)** — the 2026 singing-synthesis field is racing toward
  ever-larger neural models, yet the kid-delight of conduct-a-choir (Blob Opera) rebuilds
  entirely with 1970s-era source-filter **formant** DSP: fully offline, free, and private
  (no mic, no model, no network) — exactly right for a children's app. This build is the
  deliberate inversion of the lab's recent "pitch held dumb / drone + texture" stance —
  here **harmony IS the idea** (JURY 2026-06-25 provocation #2).

## Privacy
Uses **NO mic, NO network, NO AI model** — fully offline and private, entirely client-side.

## Files
- `page.tsx` — UI, Start gate, drag interaction, auto-demo, render loop, teardown.
- `audio.ts` — `ChoirSynth`: formant source-filter voices + kids-safe master chain.
- `voices.ts` — scale snapping + diatonic voice-leading harmony engine + consonance.
- `gpu.ts` — WebGPU/WGSL metaball renderer (primary).
- `webgl-fallback.ts` — raw WebGL2 metaball renderer (fallback).
