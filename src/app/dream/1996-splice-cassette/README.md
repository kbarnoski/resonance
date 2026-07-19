# 1996-splice-cassette — "SPLICE-96"

A live looper drawn as **magnetic tape**, where **composing IS editing**.

## The one question

> What if composing *was* editing — a live looper where you can **overwrite**, cut,
> re-time and **fracture** what you already played, and the past keeps
> **re-voicing itself** as a modal scale slowly drifts underneath it?

Most loopers only ADD layers. SPLICE-96 makes your past **consequential and
editable**: you record a loop, then you can record over part of it (destructive
overwrite), cut a slice out, shift a slice in time, or fracture the loop into
chunks that re-order. Un-making and re-voicing are the musical events.

## The editable-memory grammar

The loop is a fixed 6-second tape. Every operation is a way to *un-make* or
*re-time* what you already played (see `looper.ts`, all pure functions over
immutable event arrays):

- **Record** — armed, the degrees you play persist into the loop at the playhead.
- **Destructive overwrite** — the headline. Arm *Overwrite* and play over the edit
  region: existing events there are **replaced**, not layered. What you heard a
  moment ago is gone; the new notes take its place. (Audibly: the same loop
  positions play different pitches on the next lap.)
- **Cut** — delete the events in a slice. The loop audibly loses them (a gap).
- **Shift** — re-time a slice: move its events later, wrapping round the tape.
- **Fracture** — chop the loop into N equal chunks and re-order them; a phrase you
  know by heart comes back tumbled. Splice marks show where the tape was cut.

A **look-ahead scheduler** off the `AudioContext.currentTime` clock (~100 ms
horizon, polled every 25 ms — **not** rAF) plays the loop sample-accurately. The
playhead you *see* is a separate `requestAnimationFrame` read of the same clock.

## The harmonic model — a modal scale that drifts

**Notes are stored as scale DEGREES (0–6) + octave, not as frozen frequencies.**
A modal scale rotates continuously underneath the whole piece:

> Dorian → Phrygian → Lydian → Mixolydian → Aeolian → Locrian → Ionian

One full lap ≈ **119 s** (a new mode every ~17 s). Because `degree → frequency` is
resolved *at schedule time* against the current mode (`harmony.ts`), a phrase you
recorded a minute ago **re-voices itself** — the same fingering, a different
colour — without you touching a thing. You can watch it: each note's vertical
position *and* hue on the tape are computed through the live mode, so notes slide
and shift colour the moment the mode steps.

This is deliberately **equal-tempered diatonic modes** — *not* a fixed
just-intonation partial stack. The point is that the mapping **changes over time**.

Voice: a warm FM pluck (sine carrier + decaying sine modulator) with a hair of
pitch glide, master gain 0.14 → tape "wow" chorus → `DynamicsCompressor` →
destination. Never harsh.

## Input & graceful degradation

- **MIDI (Web MIDI API):** on Begin we call `navigator.requestMIDIAccess()`;
  connected devices play scale degrees (incoming notes are quantised to diatonic
  steps, always in the current mode).
- **Computer-keyboard fallback:** `a s d f g h j k` play degrees. Edits are on
  buttons and keys — space = Record, `o` = Overwrite, `x` = Cut, `3` = Shift,
  `z` = Fracture, ◀/▶ move the edit region (or click the tape).
- **No Web MIDI** → the keyboard still works and a note says so in
  `text-destructive`. The prototype never throws and never blanks.

## Self-demo — the ghost performer

For headless review, a **deterministic seeded ghost performer** (mulberry32 from a
constant seed; all timing off the AudioContext clock, no `Math.random` / `Date.now`)
auto-drives the whole grammar with zero input: it records a short phrase, loops it,
**overwrites** part of it, **cuts** a slice, **fractures** once, then lets the mode
drift so the same phrase re-voices. Real MIDI/keyboard input takes over instantly;
the ghost re-arms after ~15 s idle. Before Begin there's a still hero — never blank.

## Named reference

- **NIME 2026 "Loop Fracture Loop"** — Chris Kiefer & Betty Accorsi (London,
  June 23–26 2026).
- **Living Looper** lineage — Shafer / Magnusson.

Both reframe the loop from verbatim replay to **fracturable, self-transforming
performance memory** — memory made consequential rather than additive.

## Files

- `page.tsx` — client component: SVG cassette/tape rendering, input, ghost driver.
- `audio.ts` — Web Audio engine + look-ahead scheduler + FM pluck voice.
- `harmony.ts` — drifting modal scale, `degree → frequency`, seeded PRNG.
- `looper.ts` — loop event model + edit operations (pure functions).
