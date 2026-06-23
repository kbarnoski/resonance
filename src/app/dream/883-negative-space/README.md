# 883 · negative space

**The one question:** What if you played an instrument by being **silent** — a
piece that blooms only in the **gaps** of your sound, and ducks to nothing the
instant you make noise, so you compose it by what you *withhold*?

Every microphone instrument ever made maps **loud → active**. This one inverts
that: **silence → music**. The performer's instrument is restraint; the music
lives in negative space.

## How it works

- **Mic = analysis only.** The microphone is connected to a Web Audio
  `AnalyserNode` and **nothing else**. It is **never** routed to the speakers,
  **never** recorded, and **never** sent over any network. There is **no API
  route** in this prototype. We read short-term RMS energy and discard the audio.
- **Stillness timer (the inversion).** While input energy stays below a small
  threshold, a stillness timer grows. Any sound above the threshold triggers a
  fast **duck** (reverse-sidechain) and pauses voice-adding; the bloom freezes
  where it is and **resumes from there** when quiet returns.
- **Chord-bloom.** A warm additive pad (detuned sine/triangle voices + a soft
  sub drone) adds one consonant voice per few seconds of continuous stillness —
  root → fifth → octave → third → twelfth → high color — climbing toward a full
  warm chord, then very slowly evolving. An always-on near-silent root means it
  is never fully dead. Signal chain: voices → master gain → reverb
  (`ConvolverNode` with a synthesized short impulse) → `DynamicsCompressor`
  limiter → destination. Soft, never harsh.
- **Visual (Canvas2D).** A `getContext("2d")` canvas — no WebGL, no three.js.
  Silence blooms a luminous field that expands from the center (palette
  monochrome → violet as the chord fills); sound floods dark grain/static inward
  from the edges and the light recedes. Sized via `ResizeObserver`, animated
  with `requestAnimationFrame`.

## Auto-demo

A **synthetic mic signal** — a scripted loop of silence (bloom) → a burst of
sound (duck + erode) → silence (re-bloom) — runs through the **identical** energy
pipeline (`listen.ts`), so the inversion demonstrates itself hands-free within a
couple of seconds at a zero-interaction glance. When real mic permission is
granted and live audio arrives, the loop yields to the live signal.

## Graceful degrade

- Mic denied/absent → the synthetic auto-demo keeps running and a
  `text-rose-300` notice appears ("no mic — showing a demo of stillness vs.
  sound").
- A **"Make a sound"** button lets a no-mic reviewer manually trigger the
  duck/erode.

## Constraints honored

- `"use client"`, prerender-safe (no `window`/`navigator`/`AudioContext` at
  module top level), audio + `getUserMedia` gesture-gated behind the Begin tap.
- No new npm dependencies — Web Audio + Canvas2D + React only.
- Full teardown on unmount: cancel rAF, stop oscillators, `track.stop()` the mic,
  `audioCtx.close()`, clear timers, remove listeners.
- Self-contained in `src/app/dream/883-negative-space/`
  (`page.tsx`, `audio.ts`, `listen.ts`, `render.ts`).

## Lineage / references

- **John Cage, _4′33″_** — silence as the content of the piece.
- **Pauline Oliveros, "Deep Listening."**
- `RESEARCH §529 (2026-06-23)` — the cross-modal sound↔perception thread.
