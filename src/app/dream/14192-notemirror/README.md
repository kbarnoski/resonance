# 14192 · Note Mirror

**The one question:** *What if playing my keyboard let me re-perform my own
recording note-for-note — every key I press sounds my ACTUAL recorded piano note
nearest that pitch, sliced live out of the take, so I'm rearranging my own real
notes in real time?*

## The idea

Karel's real recording plays underneath as a soft, looped bed. He plays a MIDI
keyboard (or the computer keyboard) *over* it. Every key he presses does **not**
trigger a synth — it triggers his recording's **own** nearest-pitch note, sliced
directly out of the decoded `AudioBuffer` at the onset and duration the track's
analysis reports, then tuned by a tiny playback-rate nudge so it lands exactly in
pitch. He is literally re-performing his own recorded notes in a new order, in
his own piano sound. There is **no oscillator anywhere** — the bed and the played
voice both come from the same real take.

This is deliberately the *discrete-note* cousin of a grain cloud: instead of a
smear of dust, it replays his real struck notes — real attack, real decay —
rearranged. The purest possible "his actual notes, replayed."

## The color: a Scriabin color organ

The stage is a **Canvas 2D** full-chromatic color field modeled on Scriabin's
*clavier à lumières* (the color organ in *Prometheus: The Poem of Fire*). Each of
the 12 pitch classes owns a **distinct hue spread around the whole color wheel**,
ordered by the circle of fifths and anchored so **C = red** — the same idea
Scriabin used, where a step of a fifth is a step in hue. A chord therefore blooms
as several different colors at once; the screen is genuinely multicolored, not a
single-hue wash. Each played note flowers as a radial bloom in its pitch-class
hue; held notes glow as steady columns; the background is near-black, tinted only
subtly by the bed's current chord (read from the analysis at the playhead).

Raw `hsl()` is used freely in the canvas art. All UI chrome stays on the dark
Resonance palette with semantic tokens only.

## How the analysis-driven slice index works

`loadTrackAnalysis(id)` returns a note roll: for each note, a MIDI pitch, an
onset `time` (seconds), a `duration`, and a velocity. `buildSliceIndex()` walks
that roll into a 128-slot array — `index[p]` is every recorded note that occurs
at MIDI pitch `p`, in onset order.

To play MIDI pitch **P** (`sampler.noteOn`):

1. Find the nearest pitch within ±12 semitones that actually has recorded slices
   (`nearestSlicePitch`, searching outward `P, P-1, P+1, …`).
2. Round-robin through that pitch's slices with a per-pitch counter, so a repeated
   key doesn't sound the identical recording twice (no `Math.random`).
3. Create an `AudioBufferSourceNode` over the same buffer and
   `start(now, slice.time, slice.duration + tail)` — playing *exactly* that
   recorded region.
4. If the chosen slice is a few semitones off, set
   `playbackRate = 2 ** ((P - sliceMidi) / 12)` so it lands in tune (a small shift
   sounds natural).
5. A ~5 ms fade-in and an end-feather envelope prevent clicks; velocity scales the
   gain.

Everything routes through the shared ear-safety master (`createSafeMaster`) —
never `ctx.destination` directly.

## When analysis is missing

If the track has no note roll (or it's empty), the sampler drops to **region
fallback**: it cuts a short (~0.55 s) window out of the take at a deterministic
golden-ratio hop across the buffer and pitch-shifts it from a reference pitch. The
instrument always plays; the status line reads *"region fallback (no analysis)"*
instead of *"using real note slices"*.

## MIDI + QWERTY

- **Web MIDI** is the primary input: all inputs are subscribed to
  `onmidimessage`, `0x90 v>0` = note-on, `0x80 / 0x90 v=0` = note-off,
  `onstatechange` handles hot-plug. The status line names the connected device.
- **Computer-keyboard fallback** (fully playable with no hardware): the home row
  `A S D F G H J K L ;` are the white keys, `W E T Y U O P` the sharps, laid out
  like a piano across ~17 chromatic steps. The map anchors to the take's key when
  the analysis provides one. `keydown` = on, `keyup` = off, `e.repeat` ignored.
- Web MIDI unavailable/denied degrades gracefully to an on-brand notice while the
  QWERTY fallback keeps working.

Note-off lets each recorded slice ring a short natural piano decay before a gentle
~0.35 s release, so tapping and holding feel different.

## Known limits

- Pitches with no nearby recorded note (beyond ±12 semitones) silently fall
  through to a region slice, which can sound less "in character" than a real note.
- Slices are transient-cut from the analysis onsets; on busy passages a slice can
  include a little of the next note's attack.
- Region fallback has no true pitch reference (it assumes ~middle C), so its
  tuning is approximate — it's a safety net, not the main event.
- The background chord tint depends on the analysis chord track; with no chords it
  stays near-black.

## Next-cycle deepening

- Blend two neighbouring recorded slices and cross-fade by how far the target
  pitch sits between them, for smoother tuning on wide reaches.
- Sustain-pedal (MIDI CC 64) to hold the natural decays.
- Velocity-layer the slice index (pick a recorded note whose *recorded* velocity
  matches the played velocity), so soft keys pull his soft notes.
- A "capture" mode that records the re-performance as a new arrangement.
- **Blend to the grain sibling** (`14176-handduet`, banked IDEAS §1156): a fader
  from these discrete real-note slices (staccato, real attack + decay) to a
  concatenative granular cloud of the same take (sustained pads/swells) — one
  instrument spanning percussive-to-legato, both voiced entirely from his piano.
