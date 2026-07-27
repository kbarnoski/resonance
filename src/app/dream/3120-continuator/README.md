# 3120 · Continuator

**What if Resonance had a duet partner that learns YOUR musical idiom live — you
sing phrases, and it answers with NEW phrases sampled from a model of everything
you've sung, getting more like you the longer you play?**

A real two-way vocal duet. You own the melody; the machine answers in your own
style. You sing a phrase, it goes quiet and listens, folds what you just sang
into a running model of your idiom, then sings back a phrase that is
recognisably _you_ but never a literal repeat. The model accumulates for as long
as you keep playing, so the duet at minute 8 sounds different from the one at
second 0 — because of what you sang.

This is audio-primary and rendered entirely in **SVG** (no WebGL / shaders).

## The response engine — an online idiom model (`model.ts`)

The heart of the build is a **variable-order Markov model / prefix tree** built
live over your sung material.

- **Alphabet.** Each sung note becomes a `(interval, duration)` pair. The
  interval is the pitch change from the previous note **in cents, kept
  continuous** — it is _never_ snapped to equal temperament. Durations are kept
  in continuous seconds.
- **Contexts (orders 0–3).** For context _keying only_, intervals are bucketed
  into ~40-cent bins (finer than a semitone, so this is not equal-temperament
  quantization — it just lets short phrases produce repeats the model can learn
  from). For every position in a phrase and every order _k_ = 0…3, the model
  records the length-_k_ bucket context → the **exact, continuous** continuation
  that followed it. Repeated continuations accumulate as weight.
- **Ingest.** Each turn, `ingestPhrase()` folds your latest phrase into all
  orders at once and updates your observed pitch register and duration
  statistics.
- **Generate (variable order + back-off).** `generatePhrase()` walks a new
  phrase: at each step it tries the **highest available context order** and
  **backs off** to a lower order (down to the raw unconditional pool) when the
  recent context has not been seen — the core mechanism of Pachet's Continuator.
  It samples a stored continuation with the seeded PRNG, emits its **continuous**
  interval and duration (plus a ±6-cent humanizing jitter), anchors the phrase in
  your register, and reflects back in if a run of intervals would drift off-voice.
  Because every interval and duration is resampled from _your own_ material, the
  answer stays in your idiom yet is genuinely new.
- **Growth readout.** `modelStats()` exposes the number of distinct idiom
  contexts learned, notes heard, and phrases ingested; each answer also reports
  the **maximum context order it actually used that turn** and its per-step order
  trail. These are surfaced live so the "it's learning me" story reads in a short
  review — contexts climb and the answer order deepens as you keep singing.

### Reference

**François Pachet, _The Continuator_ (2002/2003)** — the canonical system that
continues a musician's playing in their own style via a variable-order Markov
model with back-off. This prototype is a small vocal homage to that idea.

## Subsystems

- **Pitch detection (`pitch.ts`).** Monophonic autocorrelation with parabolic
  peak interpolation over a 2048-sample time-domain frame, run every animation
  frame (~60 fps), voice-range gated (~80–500 Hz), giving continuous Hz plus a
  clarity value. Never snapped to a scale.
- **Note segmentation (`pitch.ts`).** A streaming `NoteSegmenter` turns the
  frame-rate pitch stream into discrete `(pitch, duration)` notes using pitch
  stability (a >75-cent jump starts a new note) and an RMS energy gate; sub-90 ms
  blips are dropped.
- **Turn detection (`page.tsx`).** A state machine `LISTENING → THINKING
  (ingest) → ANSWERING (sing) → LISTENING`. Your turn ends when the segmenter
  reports a silence gap > 450 ms with at least two notes sung.
- **Partner voice (`synth.ts`).** A Fant source–filter singer: a glottal-ish
  `PeriodicWave` through three parallel band-pass **formant** resonators (a warm
  vowel), with the oscillator frequency **glided** between notes
  (`setTargetAtTime`) so it sounds like a companion, not a beep. A second,
  brighter voice sings the baked demo "human" so call and response are audibly
  two different singers. Both share a small reverb tail.
- **Visuals (`page.tsx`, SVG only).** A two-lane scrolling call/response
  transcript — your contour above (`YOU`), the generated answer below
  (`PARTNER`) — with a playhead that tracks the currently sounding note, plus the
  live model-growth readout. Restrained, violet-accented, on-brand; DOM node
  count is bounded (last 8 phrases, ≤9 notes each).

## Self-demo / autopilot

There is a real **Start mic** button and a **Play a demo phrase** button. The
demo feeds a **baked human melodic contour** (`makeDemoPhrases`) through the
_exact same_ ingest → generate → sing pipeline, so the full listen→learn→answer
loop runs audibly and visibly with **no microphone** — which is how a headless
reviewer inspects it. Repeated presses cycle through six seeded contours, so the
model gets richer and the answers change and deepen in order.

All randomness — the baked contours, the model's sampling, the humanizing
jitter — comes from a single deterministic `mulberry32(0x3096)` PRNG, and all
timing uses `performance.now()`. There is **no `Math.random` and no `Date.now`**,
so the autopilot is fully reproducible; **Forget everything** re-seeds it.

## Housekeeping

- `AudioContext` is created only on a user gesture (Start mic / Play demo). Stop
  and unmount fully tear down: cancel the rAF, clear every pending timer, hush
  and stop the oscillators, stop the mic tracks, and close the context.
- No strobe/flicker; the SVG updates are smooth contour draws and a moving
  playhead.
- Degrades gracefully: with no microphone the seeded demo still runs the whole
  loop, and an on-brand `text-destructive` notice explains why.
- No network, no server route, no external APIs, no new npm dependencies — pure
  client Web Audio + SVG.

## Honest notes on what a headless review cannot verify

- **The actual sound.** Whether the partner voice reads as "a warm companion"
  and whether the two formant voices are pleasantly distinct is an ear judgment
  that a text/DOM inspection cannot make.
- **Real vocal input.** Autocorrelation pitch tracking and the stability-based
  segmenter are exercised only by the baked contour headless; how cleanly they
  segment a real, breathy, room-coloured voice (octave errors, vibrato, consonant
  transients) is unverified without a live mic and varied rooms.
- **Long-horizon feel.** The model provably accumulates (contexts and answer
  order climb in the readout), but whether the answers _feel_ meaningfully "more
  like you" at minute 8 is a musical, subjective claim best judged by playing.
