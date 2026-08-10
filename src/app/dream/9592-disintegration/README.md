# 9592 · disintegration

## The one question
**What if a recording could only ever be heard FEWER times — a piece that
permanently, irreversibly erases itself as it plays, until it decays to silence
and cannot be recovered without starting over?**

This is a conceptual / critical piece. The concept *is* the art: the object
degrades through the act of listening, and loss is the medium.

## The irreversibility mechanic (what is permanently lost, and how)
The loop is an array of scheduled note-events (grains) — a just-intonation drone
chord (ratios `1/1, 5/4, 3/2, 15/8, 2/1`) over a low fundamental (~73 Hz, D2).
A single `DecayState` object is the tape, and one function mutates it:

- `advancePass()` runs once per loop pass and can only move the state toward
  decay. It **kills a grain permanently** (`alive → false`, never back), eroding
  the high partials first the way tape sheds its top end, and it raises a
  monotonic `erosion` value.
- `erosion` (0 → 1) lowers a global lowpass cutoff (~2100 → ~130 Hz), drops the
  gain toward zero, and raises the probability of skipping an event so the
  silence between notes widens.
- The wall-clock render loop drives the passes, so the piece **auto-degrades on
  load** whether or not audio has been started (the reviewer's muted phone still
  sees it emptying). The audio scheduler reads the same state via a lookahead
  loop routed through the shared ear-safety master (`createSafeMaster`, gain
  0.16).

There is no code path that restores a killed grain or lowers `erosion`. Once the
strip empties and `erosion` reaches 1, the piece is `done` — true silence. The
sole recovery is **Begin again**, which allocates a fresh pristine `DecayState`
from zero. You cannot rewind; you can only start over.

## Visual
Stark monochrome — a papery, near-white / ash ground with animated low-contrast
film-grain dust (Canvas2D). The loop is drawn as a horizontal strip of
tick-marks, one per note-event; as each event is permanently lost its tick fades
out for good, while the dust wash thickens with `erosion`. A soft playhead
sweeps the strip in loop-time (the tape passing the head). On-brand chrome text
shows `notes remaining: N / 30` and `passes: N`. `prefers-reduced-motion` is
honored with calmer, sparser grain. No flashing — the piece is slow by nature.

## Named reference
William Basinski, *The Disintegration Loops* (2002) — magnetic tape whose ferrite
shed off the plastic each time it passed the playhead, so the recording
physically destroyed itself as it was played.
https://en.wikipedia.org/wiki/The_Disintegration_Loops

## Next-cycle deepening
- Erode a real rendered sample buffer in place (bake amplitude/high-frequency
  loss and dropouts directly into `AudioBuffer` samples) instead of resynthesis,
  so the destruction is literal rather than parametric.
- Persist the decay to `localStorage` keyed per visitor, so the recording is
  genuinely, permanently spent for *that* person across reloads — "Begin again"
  becomes a moral choice, not a reset button.
- A shared/global counter: every listen anywhere erodes one communal copy that
  no one can restore.
