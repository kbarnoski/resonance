# 15808 · MIDI Duet — an anticipatory duet with Karel's catalog

## The one question

**What if you play alongside Karel's own piano catalog on a MIDI keyboard, and
his real recorded phrases answer you — entering *ahead* of your line to complete
the phrase you're implying?**

This is an *anticipatory* duet. You play; Karel's recorded catalog is the
partner. It does two things at once: it answers each note you play with his
nearest real note, and — the surprise — it predicts where your line is going and
surfaces the phrase he would use to finish it *before it sounds*, so his piano
enters ahead of you to complete your thought.

## How to use it

1. Press **Begin**. It builds one `AudioContext`, the shared safe master bus, and
   loads 3–4 of Karel's real recordings (default: Bath, Interplay, 2019, Rolling)
   plus their note analyses into one corpus. You can pick which takes make up the
   corpus before you begin; the default four work with no changes.
2. Play notes:
   - **Web MIDI keyboard** — plug one in; note-on messages drive the duet. The
     status line reads *"MIDI keyboard connected."*
   - **QWERTY fallback** (always on, works alongside MIDI): `a s d f g h j k` are
     the white keys, `w e t y u` the black keys, `z` / `x` shift the octave. Tap
     the on-screen keys on touch. Status reads *"Using computer keyboard (a–k)."*
3. Every note you play retrieves and re-triggers a short grain of Karel's real
   recording — you hear *his* piano, not a synth.
4. **Pause for a moment.** Once your phrase settles, his catalog completes it: a
   translucent **ghost constellation** appears on his staff in the *future*
   (right of the playhead) and drifts toward "now" — the plan, made visible —
   then that phrase actually plays from his recording as it reaches the playhead.

## The conversation score (output)

Pure inline SVG + DOM (no canvas, no WebGL). A gently scrolling score with the
playhead ("now") fixed and time flowing right-to-left:

- **Your notes** stream in on the lower staff as warm glyphs, colored by
  pitch-class via the shared `pitchClassHue` helper.
- **Karel's answers** bloom on the upper staff — both the immediate retrieved
  spotlight and the anticipated completion.
- **Threads** link each call to its answer across the center divider.
- **The anticipation ghost** is the translucent, dashed constellation to the
  right of the playhead: his incoming phrase, shown *before* it sounds.

## Technique

- **Concatenative corpus retrieval (CataRT-style).** On each keypress we find the
  nearest real note Karel played — match by pitch-class, then closeness in
  register — across all loaded tracks, and schedule an `AudioBufferSourceNode`
  from that track's buffer starting at that note's real onset time, windowed with
  a gentle attack/release (~0.6–1.2 s).
- **Anticipation, made visible.** Your last few pitches form an n-gram. We search
  his playing (`predictContinuation` in `corpus.ts`) for where a similar
  pitch-class shape + melodic contour occurred, and return the notes he played
  *next* there — his likely completion. Nearest-neighbour over pitch-class
  n-grams: simple, robust, and it never throws (it always falls back to a nearest
  unit plus his following notes). Those notes are rendered as the ghost, then
  played from his recording after a short settle delay.

## References

- **ReaLJam** — *arXiv:2502.21267.* An AI musical partner that continually
  predicts how the performance will unfold and *visually conveys its plan* to the
  human: anticipation made visible. This is the core borrowed idea — the future
  ghost is his plan, shown before it sounds.
- **CataRT / corpus-based concatenative synthesis** — Diemo Schwarz, IRCAM. The
  retrieval model: build an instrument/partner from a corpus of real recorded
  units and select the nearest unit to a target descriptor (here: pitch-class +
  register), re-triggering the real recording rather than synthesizing.
- **"Real-Time Human-AI Musical Co-Performance"** — *arXiv:2604.07612* (Apr 2026).
  Sliding-window look-ahead co-performance — the settle-and-answer timing.

## Rule 10 — all audio is Karel's real catalog

Every audible sound in this piece is a grain of Karel's own real recording,
retrieved from his verified catalog and re-triggered. A keypress makes **no tone
of its own** — there is no `createOscillator`, no `createConstantSource`, no synth
voice anywhere. All sources route through the shared `safeMaster` ear-safety bus;
nothing connects to `ctx.destination` directly.

## Graceful degradation & teardown

- No Web MIDI (or the user denies) → the QWERTY keyboard is used silently.
- A track that fails to load, or has no note analysis, is skipped; the piece
  keeps going with whatever loaded.
- If *nothing* loads, a friendly `text-destructive` notice appears.
- On unmount: all scheduled sources are stopped, timers cleared, MIDI listeners
  detached, the master bus disconnected, and the `AudioContext` closed.

## Files

- `page.tsx` — the prototype (UI, audio graph, MIDI/QWERTY input, SVG score).
- `corpus.ts` — pure, throw-free corpus build + `retrieveNearest` +
  `predictContinuation`.
- `README.md` — this file.
