# 3648 · Songlines — a recording played like a keyboard

**Route:** `/dream/3648-songlines`

> The one question: *What if a recording's timbre-map were an instrument you
> play like a keyboard, and your performance a loop you record and replay?*

Songlines is a **deliberate second-cycle deepening** of `3608-atlas`. Atlas
shipped the *place*: a navigable timbre-atlas of a recording, wandered with a
pointer. It never shipped the *score*. Songlines reuses the exact same corpus
builder and k-nearest granular engine (copied in, self-contained — see below)
but replaces the pointer with a non-pointer instrument and adds the piece that
was missing: **record, then loop**.

## What changed from 3608-atlas

- `atlas-corpus.ts`, `atlas-audio.ts`, `atlas-gl.ts` are copied verbatim from
  3608-atlas and then extended in place:
  - `atlas-corpus.ts` gains **`computeWaypoints`** — a deterministic k-means
    (seeded `mulberry32`, 14 fixed iterations, no `Math.random`) that clusters
    the atlas's grain positions into **12 timbre waypoints**, sorted low→high
    by the pitch axis — and **`computeRestPoint`**, the point in atlas space
    farthest from every waypoint, so a released note actually fades to silence
    instead of idling over data.
  - `atlas-audio.ts`'s `GranularEngine` gains a `noteGain` stage and
    `setVelocity()`, so a keyboard press or a MIDI note's velocity shapes
    loudness on top of the engine's existing distance-based envelope.
  - `atlas-gl.ts` gains `atlasToScreen()`, the inverse of its existing
    `screenToAtlas()`, so a 2-D overlay canvas can draw waypoint labels and the
    recorded-loop trail in exact register with the GPU point cloud beneath it.
- **Pointer input is gone.** The instrument is played with the **computer
  keyboard** (`A W S E D F T G Y H U J`, low→high, labelled on screen) or a
  **Web MIDI** keyboard (`songlines-midi.ts`) — incoming note-on picks the
  nearest waypoint by pitch. Either drives the granular engine's cursor toward
  the held waypoint with a ~55 ms glide, so a press reads as a note, not a
  teleport. Releasing lets the cursor glide to the rest point and the voice
  fades per the engine's own radius falloff.
- **Record → loop** (the deepening's core): a **Record** button captures the
  sequence of `(waypoint, onset time, release time, velocity)` events a
  performance produces (`performance.now()`-timed). **Stop** finalizes the
  sequence into a loop — length = first note's onset to last note's release
  plus a short tail — and it repeats forever, re-driving the cursor
  automatically exactly as if it were being played again. **Clear** erases it.
  The glowing violet trail connects the recorded waypoints in the order they
  were played, with a dashed return-edge back to the start and a bright
  travelling dot marking the loop's current playback position — the waypoint
  you hear is the one glowing.
- **Drop your own audio** still works (as in 3608): the file is decoded,
  re-analyzed, and both the corpus *and* the waypoints are rebuilt from it,
  clearing any recorded loop (a different corpus has different waypoints).

## Self-demo (headless-safe)

Pressing **Start** creates the `AudioContext` (the one user gesture required),
builds the corpus and its 12 waypoints, and immediately scripts a short,
seeded melodic walk (`mulberry32(0x3648)`, a bounded random walk across scale
degrees) through the **exact same Record path** a human performance uses: it
calls the same `noteOn`/`noteOff` the keyboard calls, which get logged because
recording is already active. When the script finishes, it calls the same
`Stop` logic automatically, and the phrase starts looping — all within a
couple of seconds of Start, no display, speakers, MIDI device, or keyboard
required. The first genuine keyboard or MIDI note-on cancels any still-pending
scripted notes and hands control to the performer.

## Real vs seeded

- **Real:** every spectral descriptor, every grain, every waypoint centroid
  (k-means over real positions), every recorded event's timestamp and
  velocity, and the granular engine's scheduling and gain math — nothing here
  is faked.
- **Seeded, not random:** the default demo phrase (`renderDefaultPhrase`,
  inherited from 3608) and the self-demo autopilot script are both driven by
  `mulberry32` with fixed seeds. `performance.now()` is the only clock used;
  `Math.random()` / `Date.now()` never appear.

## References

- **Diemo Schwarz — CataRT / corpus-based concatenative synthesis (IRCAM).**
  The instrument is "the space of sound characteristics" a performer
  navigates — and Schwarz notes that navigation itself "can be recorded for
  later playback." Songlines takes that observation literally and builds the
  record/loop transport around it.
- **arXiv:2606.08286 — "FXplorer: A Map-Based Interface" (Jun 2026).** A recent
  sibling idea: treating a 2-D map as a playable, navigable control surface.

## Ambition criteria hit

- **(2) ≥3 subsystems:** descriptor→space corpus engine (copied, unchanged
  math) + deterministic k-means waypointing + keyboard/MIDI note instrument
  (glide + velocity) + record/replay loop transport + WebGL2 point cloud +
  2-D overlay (trail/labels) = six.
- **(3) named reference:** Schwarz/CataRT's "recorded for later playback," plus
  arXiv:2606.08286 (FXplorer) as the contemporary sibling.
- **(4) deliberate multi-cycle deepening:** this is explicitly a second pass on
  3608-atlas's unfinished half — turning the place into a score.

## Tags

- **INPUT:** computer keyboard (12 keys, low→high) + Web MIDI (graceful
  degradation to keyboard-only) + drop-your-own audio file — **no pointer**
- **OUTPUT:** WebGL2 GPU point cloud + 2-D canvas overlay (waypoint labels,
  recorded trail, travelling playback dot)
- **TECHNIQUE:** corpus-based concatenative granular synthesis + deterministic
  k-means waypointing + record/loop performance capture
- **VIBE:** an instrument that remembers what you just played to it

## Degrades gracefully

- No WebGL2 → a friendly notice; keyboard/MIDI still drive the granular engine
  and the seeded demo still records and loops (just without the point cloud or
  waypoint labels).
- No Web MIDI → silently keyboard-only; the HUD reads "midi: unsupported."
- No Web Audio → this piece has no separate audio-optional path (unlike
  3608 it needs the engine for note gain), so if `AudioContext` truly cannot
  be constructed the visuals and record/loop mechanics still run soundlessly.
- Undecodable dropped file → a friendly message; the current corpus/waypoints
  are kept.

## Known rough edges

- **Monophonic.** One cursor, one voice — holding multiple keys plays the
  newest one (last-note-priority), like a lead line, not a chord. A real
  polyphonic version would need N cursors / N engine instances.
- **Loop timing resolution is one animation frame (~16 ms),** not
  sample-accurate — fine for the musical phrasing this targets, audible drift
  would need a Web Audio clock–driven scheduler instead of rAF-driven timers.
- **k-means can produce uneven regions** for very small or very uniform
  corpora (few or very similar grains); the fallback fill guards against
  infinite loops but very short dropped files may yield some visually close
  waypoints.
- **Big-file rebuild cost** — inherited from 3608: analysis + k-means run
  synchronously on the main thread; a "rebuilding" overlay covers the (usually
  sub-2s) stall on a large dropped file.
- **Rest-point silence is approximate.** It is the point farthest from the 12
  waypoint *centroids*, not from every individual grain, so on a very dense
  corpus a released note may not fade all the way to true silence.
