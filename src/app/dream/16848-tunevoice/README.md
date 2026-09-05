# 16848-tunevoice — Tune Voice

**Status:** demoable

## The one question

What if singing a pitch that BELONGS to Karel's sounding chord made his
recording audibly OPEN to meet you? This is audio-forward: the reward is HEARD,
not watched. The WebGL2 visual is deliberately minimal — a single tuning halo.

## Mechanism

One of Karel's real catalog tracks (Welcome Home ×13 / Snowflake ×3, chosen in a
selector) plays through this chain into the ear-safe master:

```
bufferSource → lowpass("opening" filter: ~480 Hz veiled → ~6.2 kHz open)
             → peaking(blooms on the chord ROOT frequency)
             → createSafeMaster(ctx).input
```

- **The microphone is analysis-only.** `getUserMedia({audio:true})` →
  `MediaStreamSource` → a dedicated `AnalyserNode` we read time-domain data from.
  That analyser is a dead-end sink: it is never connected to the master or to
  `ctx.destination`, so there is no howl, no synth, nothing generated
  (rule-10-clean). The only audible source node is Karel's decoded `AudioBuffer`.
- **Pitch detection.** Each animation frame runs a YIN-style autocorrelation on
  the mic time-domain buffer: difference function → cumulative-mean-normalized
  difference → absolute threshold (~0.12) with a walk-down to the local minimum
  → parabolic interpolation. Gated on RMS (loudness) and clarity (periodicity)
  so silence and broadband noise never register. Hz → MIDI → pitch-class.
- **Consonance.** The chord sounding NOW is found by binary-searching
  `analysis.chords[]` at the current playback position (ctx-clock elapsed seconds,
  looped). A small triad/7th/9th interval parser built on the shared
  `chordRoot` + `chordIsMinor` produces the chord's weighted pitch-class set
  (root/fifth highest, third high, tensions medium). The sung pitch-class scores
  against it: a chord tone takes its weight; an out-of-chord note scores by its
  sensory-consonance interval to the root, scaled down. The score is one-pole
  smoothed (~0.15) so the opening breathes rather than jumps.
- **The audible reward.** Smoothed consonance drives both filters via
  `setTargetAtTime` (no zipper noise): high consonance sweeps the lowpass OPEN
  toward 6.2 kHz and blooms the peaking gain on the chord root; low consonance
  closes it back toward a veiled 480 Hz.

## Visual (minimal, raw WebGL2)

One fullscreen WebGL2 fragment shader: a soft radial bloom that shifts COOL TEAL
(searching / dissonant) → warm AMBER-GOLD (locked / consonant) as smoothed
consonance rises, plus a gentle ring whose radius contracts toward the centre as
the sung pitch nears the nearest chord tone. Slow luminance drift only (sin at
0.35 Hz) — no strobe, no film grain, no noise overlay. The raw palette is
confined to the WebGL art layer; all chrome uses semantic tokens.

## Degrades gracefully

- **Mic denied/unavailable** → auto-demo mode: a simulated sung pitch sweeps
  slowly across the pitch-classes (~43 s per circle) so the open/close is legible
  with no mic, clearly labelled "microphone unavailable — self-playing demo".
- **No chord analysis** (`loadTrackAnalysis` returns null) → falls back to a live
  spectral-peak target read from the recording's own passive analyser tap, noted
  in the readout as "tracking the recording's own spectral peak".
- **No WebGL2** → house-style `text-destructive` notice; the audio still opens
  and closes (no broken canvas).

## Ambition (clears the floor via #2 + #3 + #5)

- **#2 — ≥3 subsystems (six here):** catalog loader/decoder (`loadRealTrackBuffer`)
  + recording FFT tap (spectral fallback) + time-matched chord tracker
  (binary search + interval parser) + YIN mic pitch detector + consonance-gated
  dual-filter audio graph + WebGL2 halo.
- **#3 — named references:**
  - Pauline Oliveros, *Deep Listening* — attunement as a practice you enter, a
    phenomenology, never a substance.
  - Hermann von Helmholtz, *On the Sensations of Tone* — sensory consonance and
    roughness, the basis of the interval-consonance scoring.
  - "From Discord to Harmony" (arXiv 2509.01588, 2025) — the consonance-distance
    line, treating consonance as a first-class real-time signal.
- **#5 — chains from today's RESEARCH dive:** consonance as a first-class
  real-time interaction primitive that gates the sound of the recording itself.

## Honest "not #1" note

This is NOT a lab-first for pitch detection — that has priors (114-live-harmonize,
718-duet-paths). The honest first: **this is the first piece where sung
consonance against his sounding chord AUDIBLY opens the recording.**

## Constraints honored

`"use client"` first line; audio source = Karel's real catalog only, zero
oscillators/noise/synth; every audible path ends at `createSafeMaster(ctx).input`
with no `ctx.destination`; rule-9 clean — no substance or intake metaphors
(openness / depth / intensity throughout); house typography and semantic tokens;
full teardown on
unmount (cancelAnimationFrame, stop + disconnect source, master.disconnect, stop
mic tracks + disconnect mic nodes, delete GL program/buffer + loseContext,
ctx.close, remove listeners). Passes `eslint` and `tsc --noEmit` clean.
