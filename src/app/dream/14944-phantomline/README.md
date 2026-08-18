# Phantomline

**The one question:** What if you could SEE the phantom melody your own brain assembles from two ears — a smooth line that exists in neither speaker?

Phantomline is the lab's first **dichotic auditory-illusion** piece. Karel's real
piano take plays, but every note is hard-panned to one ear by its pitch height, so
neither ear physically carries a coherent tune — yet your brain hears one anyway.
That reconstructed line is the artwork.

## How to run

1. Start the app and open `/dream/14944-phantomline`.
2. **Wear headphones.** The illusion depends on each ear receiving a physically
   different signal; on speakers the two channels sum in the air and it collapses.
3. Press **Play in headphones**. Karel's take (default: *Interplay*) begins, and
   successive notes jump between your left and right ears. Watch the centre lane:
   the smooth gold contour is the melody your auditory system infers — a line that
   is present in neither ear's physical signal.
4. Use the track selector to try any of Karel's verified real tracks.

## Design notes — the illusion

**Deutsch's scale illusion (1973).** Diana Deutsch showed that when the notes of a
scale are split between the ears, listeners do not hear the jagged spatial sequence
that is physically present. Instead the auditory system re-groups events by pitch
proximity, and most listeners hear a smooth descending/ascending line in one ear and
its complement in the other — a percept that matches neither channel. Phantomline
uses Deutsch's exact mapping: **high notes → right ear, low notes → left ear**, split
at the track's median pitch.

**Bregman's auditory scene analysis (1990).** Albert Bregman formalized why: the
cortex parses sound into streams using heuristics like pitch-proximity and
good-continuation. Two notes close in pitch are bound into one stream even when they
arrive at different ears; a large spatial jump is overridden by the smoother pitch
trajectory. The perceived stream is the brain's best inference, not the physical
signal.

**The physical-vs-phantom gap is the piece.** The two cyan lanes (top = left ear,
bottom = right ear) plot exactly what each ear physically receives: jagged,
gap-riddled fragments. The bright central lane plots the same notes re-joined in
true pitch order into a flowing continuous contour — the phantom line the brain
assembles. The distance between them is what the illusion is.

## Audio graph

100% of the audible sound is Karel's real recording. There are **zero oscillators,
zero synthesis** — only the recording's stereo position moves.

```
bufferSource (real take, looped)  →  StereoPanner  →  SafeMaster.input  →  limiter → out
```

- `loadRealTrackBuffer(ctx, id)` decodes the take; `createSafeMaster(ctx)` is the
  ear-safe master bus (never `ctx.destination` directly).
- The `AudioContext` is created only inside the Start-button gesture. Buffer and
  analysis load in parallel via `Promise.all`.
- On unmount: cancel rAF, `src.stop()` + `disconnect()`, `master.disconnect()`,
  `ctx.close()`.

## The mapping (pitch height → ear)

- On load, the pitch **median** is computed once from every note's MIDI value.
- Each note's target ear: `pan = midi >= median ? +1 (right) : -1 (left)`.
- The pan is moved with a short ramp (`setTargetAtTime(target, now, 0.012)`) so
  ear-flips glide rather than click.
- Flips are **rate-limited to ~8 Hz** (`MIN_FLIP_S = 0.125s`); during dense same-ear
  runs the current ear is held until the next note that crosses the median, keeping
  the spatialization musical rather than strobing.

## Fallback (never blank)

If a track has no usable note-roll (fewer than 12 notes), the piece switches to a
**live onset proxy**: it reads `master.analyser` each frame, tracks **spectral flux**
against an adaptive baseline, and flips ears on flux spikes — mapping brightness to
ear (bright onset → right) in the spirit of Deutsch's pitch-height rule. A slow
~0.4 Hz periodic swap acts as a floor so a flat signal never stalls. A rolling
history of onset marks keeps all three lanes populated, and the readout flags
**"perceptual fallback."**

## References

- Diana Deutsch, *Musical Illusions and Phantom Words* (Oxford University Press, 2019).
- Diana Deutsch, "An auditory illusion," *Nature* 251 (1973) — the scale illusion.
- Albert S. Bregman, *Auditory Scene Analysis: The Perceptual Organization of Sound*
  (MIT Press, 1990).
