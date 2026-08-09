# 9080 · Mnemonic — the memory ribbon

## The one question

**What if you could SEE your own musical memory being written?** You play or
hum into the mic; a listening partner captures your phrases as **motifs**, inks
them as notation on a living "memory ribbon," and then — in your gaps — quotes
them back **transformed**, drawing the variation directly beside the original so
you watch your idea get developed.

## The five subsystems

1. **Mic source (with seeded fallback).** `getUserMedia({audio})` →
   `MediaStreamSource` → `AnalyserNode`. The analyser is a dead-end: the answer
   voice is never routed into it. If the mic is denied/unavailable a
   `text-destructive` note appears and the piece falls back to a **seeded
   procedural** melody. "Play a seeded demo" runs a `mulberry32(0x9080)`
   synthetic phrase through the **same** downstream pipeline, so a muted or
   mic-less reviewer still sees the whole thing work.

2. **Two-time-scale listener.**
   - *Fine (per frame):* autocorrelation pitch tracker → note; spectral-flux
     onset with a refractory window; RMS energy. A decaying 12-bin **chroma**
     histogram is correlated against the **Krumhansl–Schmuckler** major & minor
     key profiles → estimated key + mode.
   - *Coarse (phrase level):* a segmenter collects `(pitch, t, dur)` note
     events; a phrase **boundary** fires after ~350 ms of rest, or a 4 s cap.

3. **Motif bank.** Each phrase snapshot is scored for **salience** (length +
   pitch variety + span) and pushed to a bank capped at the **10 most salient**
   ideas.

4. **Development engine (the answer).** In the player's energy gaps the partner
   picks a remembered motif and quotes it back **transformed** —
   *transpose-to-key*, *invert-around-first-note*, *augment ×2*, or
   *retrograde* — every note re-quantized into the estimated key, voiced on a
   soft triangle/FM timbre distinct from the input, through a `master (0.18)` →
   `DynamicsCompressor` → destination chain.

5. **The living score (inline SVG).** Each motif is drawn as noteheads
   (circles at `y=pitch`, `x=time`) plus a contour path on an upper "as heard"
   stave. The development is inked on the lower stave **directly below its
   original**, using one shared pitch scale and absolute time→x mapping so the
   transformation is legible **as a picture**: inversion flips vertically about
   a drawn axis, augmentation stretches literally wider, retrograde runs the
   contour backward, transposition shifts the whole shape up/down. Both are
   briefly flashed gold when the quote lands. Everything is `<circle>` /
   `<path>` / `<line>` animated with CSS keyframes (pop-in noteheads,
   dashoffset draw-on contour, scrolling ribbon).

## Determinism / muted read

All randomness is `mulberry32` (`0x9080` for the demo melody and the
transform/motif choices); timing is `performance.now()` / `AudioContext.currentTime`
— never `Math.random`, `Date.now()`, or argless `new Date()`. The seeded demo's
first phrase is deliberately short and quick, so the ribbon captures a motif and
draws its first development within ~1 s with no real audio required.

## How it degrades

- Mic denied/unavailable → destructive note + automatic seeded-demo fallback.
- No `AudioContext` / muted → the ribbon still captures and develops motifs
  silently; audio is additive, never required for the visual payoff.
- Empty room → the segmenter simply waits; nothing is captured until a phrase
  with ≥2 notes is heard.

## Named references

- **Krumhansl, C. L. (1990),** *Cognitive Foundations of Musical Pitch* — the
  major/minor key-profile correlation used for key finding.
- **George Lewis,** *Voyager* — an improvising machine partner that listens and
  answers, the interaction model this piece borrows.
- **Robert Rowe,** *Machine Musicianship* / **Cypher** — the listener →
  segmenter → transformer architecture of interactive music systems.
- **arXiv:2608.04378 (2026)** — recent work on real-time motif memory and
  developing-variation agents.

## Next-cycle deepening

This is an explicitly multi-cycle build. Next passes: a proper **YIN**
difference-function pitch tracker for cleaner polyphonic-ish input; motif
**similarity clustering** so recurring ideas reinforce one long-term theme;
compound developments (inversion *then* augmentation) with a visible lineage
bracket; and rhythmic quantization of captured motifs to a tracked tempo so the
notation reads as real metered manuscript rather than proportional time.
