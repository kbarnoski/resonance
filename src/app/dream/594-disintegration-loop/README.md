# The Disintegration Loop

*A recording that crumbles as it plays.*

A warm just-intonation lullaby fragment is rendered once into a "tape," then
re-recorded onto itself pass after pass through a wear chain. The erosion
accumulates irreversibly, so the music at minute 5 is materially different from
the music at minute 0 — it hollows, mutes, and desaturates into a ghost. You
hold the one lever between letting it go and holding it back.

Lives at: `/dream/594-disintegration-loop`

## References

- **William Basinski — _The Disintegration Loops_ (2002).** Basinski
  re-recorded aging magnetic tape loops and discovered the iron-oxide was
  flaking off the tape with every pass, so the music literally crumbled as he
  captured it.
- **Music Thing Modular "Degenerator" (Synthtopia, 2026-05-28).** A
  self-overwriting audio looper that runs "from slow ambient decay to saturated
  noise and collapse" by writing each pass back over the last.

## Technique — self-overwriting "tape" model

The loop's current audio is kept in a single mutable `Float32Array` (the
"tape"). It is never reset. Once per loop pass we read the tape, run it through
a **wear chain**, and write the result back onto itself, so degradation
compounds as genuine state (not an LFO wobble, not a reset loop):

- **Lowpass that creeps down** — cutoff falls each pass (highs flake off first),
  starting bright (~9 kHz) and decaying toward a muffled ~420 Hz floor.
- **Oxide dropouts** — a persistent `dropoutMap` accumulates permanent worn
  cells; once punched, a hole only deepens. These mute segments of the tape and
  punch visible holes in the waveform strip.
- **Wow/flutter** — slow + fast resampling jitter on the read position.
- **Tape saturation** — a `tanh` curve so the loop colors warmly as it erodes
  rather than simply fading to silence.

Each worn tape is copied into a fresh `AudioBuffer` and played once with a
short per-pass gain crossfade (no seam clicks); on `onended` we wear again and
reschedule. Master chain: gain → `DynamicsCompressor` (soft limiter) →
destination, so it never clips. The visual strip (Canvas2D) is driven by the
*actual* degradation state — the live peak envelope, the dropout map, and the
lowpass cutoff — not a faked animation.

**The lever** (vertical slider, top = *hold on*, bottom = *let go*, default
mid) is the only interaction. *Let go* accelerates erosion; *hold on* slows it
and, near the top, lifts the lowpass a touch and mixes a whisper of the
pristine seed back in — a faint refresh. After ~2.5 s of stillness the piece
auto-starts and disintegrates on its own with zero further input.

## Design notes (reflection)

I wanted the sadness to be structural, not decorative: because the tape is a
single array that is only ever overwritten, there is no undo and no loop point
to return to — holding the lever up only buys time, which is the whole feeling.
Keeping the wear in plain JS per pass (rather than an AudioWorklet) made the
accumulation easy to reason about and easy to mirror exactly in the visual, so
what you see is what you hear decaying. The one lever earns its singularity by
being a moral choice rather than a control surface — you are not solving the
loop, you are deciding how gently to let it disappear.
