# 1236 · Antiphonary (Neume)

**The one question:** *What if Karel's real piano recording notated itself as medieval plainchant — the melody's rise and fall inking square neumes onto a four-line stave, an illuminated manuscript writing itself as it plays?*

This is a deliberately **non-object** form: a self-writing **illuminated chant manuscript**, not a 3D thing you rotate. It transcribes the melodic **contour** (the shape of the line) rather than exact modern rhythm — which is both historically apt (neumes encode contour) and forgiving of the pitch/onset errors any browser detector makes.

## What happens

Press **"Play the recording."** The page then, offline and once:

1. **Loads audio.** Fetches Karel's real solo-piano recording through the existing read-only `GET /api/audio/[id]`. If the network is unavailable (the norm in headless test), it renders a gentle ~12 s modal piano phrase with an `OfflineAudioContext` instead — so there is **always** real, monophonic, notatable harmonic content. A badge shows *Karel's piano* vs *fallback tone*.
2. **Detects onsets** — spectral flux via a hand-rolled radix-2 FFT, peak-picked with an adaptive local-mean threshold and a minimum inter-onset interval.
3. **Detects pitch** — **YIN** (de Cheveigné & Kawahara, JASA 2002): cumulative-mean-normalised difference function with parabolic interpolation, on a few frames just after each onset, median-voted. Gross octave slips are folded toward the running pitch. Each pitch maps to a white-key (diatonic) staff step.
4. **Groups notes into neume figures** by the sign of successive pitch steps: single **punctum**, rising **pes/podatus**, falling **clivis**, up-then-down **torculus**, down-then-up **porrectus**, and a descending run as a **climacus** (a square followed by falling diamonds).

Then a `BufferSource` plays audibly while the manuscript **inks itself in time**: each neume appears as its note's onset passes a slim **gilt playhead** (the pen tip). Rows of four-line **rubric-red stave** wrap downward and auto-scroll to follow the pen. An illuminated **drop-cap** opens the chant; a soft radial vignette + faint fibre noise give the **parchment / vellum** its warmth. Sepia-brown ink, a single gilt accent — a rare warm-paper register, not dark jewel-tones.

Transport: play/pause + a seek scrubber. On mount the empty ruled red stave is already drawn — never blank.

## Design choices

- **Pre-analyse, then reveal.** The whole buffer is transcribed up front (deterministic), and neumes are revealed against a tracked playhead. This is robust and keeps the visual perfectly synced to the audio, versus fragile realtime detection.
- **Contour over rhythm.** Square notation records *where the line goes*, not precise durations — which is exactly what a noisy pitch detector can supply reliably.
- **Always sounds, always writes.** The offline fallback phrase `[57,60,62,64,67,69,67,64,62,60,64,67,69,72]` is a clear rise-and-fall, so it always yields a legible chant of *pes*, *climacus*, and *clivis* even with no network.

## Constraints honoured

Self-contained in this folder (`page.tsx`, `audio.ts`, `transcribe.ts`, `neume.ts`, `README.md`). No new npm dependencies — Web Audio API + Canvas2D only, stave and neumes hand-rolled. Read-only of the existing audio route; no new route. Degrades gracefully (no network → fallback tone; no AudioContext → visible notice). Parchment palette with high-contrast sepia ink.

## Named reference

Guido d'Arezzo and Western neumatic / square (Gregorian) notation; YIN pitch detection (de Cheveigné & Kawahara, *JASA* 2002). A browser echo of the cs.SD frontier of streaming symbol-level piano transcription (arXiv:2503.01362, 2025), rendered as historical contour notation.
