# 10616 · Lumia

**Play light itself.** A MIDI keyboard drives Thomas Wilfred's *Lumia* visual
music: each note blooms a slow, glowing colour-form; velocity, timing, and — the
heart of the piece — the **sustain pedal** are the composition. Held notes
**freeze** into standing "super-forms" that don't fade but accumulate and slowly
recompose, so over minutes the screen builds a living **stained-glass cathedral**
of your performance.

## How to use it

1. Tap **Start — play light** (creates the AudioContext on the gesture and asks
   for WebMIDI).
2. If a MIDI keyboard is present, play it. **Velocity → brightness + size**,
   **pitch → hue + height**. Chords composite additively as overlapping panes.
3. **Hold the sustain pedal (CC64).** While it's down, the notes you play freeze
   into persistent super-forms. Deeper pedal depth freezes *more* of the light.
   The forms then drift, breathe, and re-tint on their own.
4. **Let go — soften the field** gently relaxes the whole accumulation back
   toward dark so it never saturates to white.
5. No keyboard? A seeded **auto-performer** starts automatically and plays a
   slow modal phrase while working the pedal itself — the cathedral builds with
   nobody touching anything, visible even on a **muted phone**. Toggle it off if
   you'd rather play solo.

The badge reads *"MIDI keyboard connected"* or *"no device — auto-performer"*;
if MIDI access is denied it reports that in the destructive colour and falls back
to the auto-performer.

## Renderer — a pure CSS/DOM compositor

There is **no `<canvas>`, no WebGL, no SVG art**. Every visual mark is a
positioned `<div>` painted with a CSS `radial-gradient` / `conic-gradient`,
softened by `filter: blur(...)`, and blended with `mix-blend-mode: screen` so
overlapping light *adds* like stained glass over a deep violet-slate ground. The
`requestAnimationFrame` loop is the only per-frame writer and touches just a
handful of properties per form — `transform` (drift + rotate + breathe),
`opacity`, and (for frozen forms) a cheap `hue-rotate` for the slow re-tint. Two
imperatively-managed element pools (transient + super-form) keep React out of the
frame loop.

## The four subsystems

1. **Input — WebMIDI + mandatory auto-performer.** `navigator.requestMIDIAccess()`
   (feature-detected, try/catch) wires noteon/noteoff and CC64 as a continuous
   0..1 pedal *depth*. Regardless of any device, a seeded auto-performer begins on
   Start.
2. **Synth — 12-TET additive organ.** `freq = 440·2^((midi−69)/12)` (strict equal
   temperament — no just intonation). Each voice is a few sine partials with a soft
   attack and a plateau; the pedal sustains physically-released notes until it
   lifts. Everything routes into the shared `createSafeMaster` bus — never to
   `ctx.destination`.
3. **Renderer — Lumia form · colour · motion.** Blooming colour-forms with
   velocity-driven brightness/size, pitch-driven hue (a jewel per pitch-class) and
   height, drifting and breathing slowly and meditatively.
4. **Sustain super-form memory + long-form accumulation.** Pedal-down notes freeze
   into persistent super-forms (probability scales with pedal depth) that drift,
   breathe, and re-tint. A capped pool with oldest-recycle and a global dim factor
   prevents white-out; a slow root progression keeps the field evolving. **Minute
   five genuinely differs from minute one.** "Let go" softly clears it.

## Constraints honoured

Seeded `mulberry32(0x10616)` for all randomness; `performance.now()` / the audio
clock for all time (no `Math.random`, `Date.now`, or `new Date`). Full teardown
on unmount (cancel rAF, stop/disconnect voices, close the context, drop MIDI
listeners). Semantic tokens for all chrome; art colour only inside gradient
strings. No strobing — all motion is slow luminance drift well under 3 Hz.

## References

- **Thomas Wilfred, *Clavilux* / "Lumia" (1919)** — light composed as an
  autonomous art of **form · colour · motion**.
- **Dave Payling, the "Lumia factors" (form · colour · motion)** — a framework
  for composing visual music from Wilfred's three factors.

## Next-cycle deepening

Give super-forms *relational* memory: let a newly frozen form inherit hue/position
from the pane nearest it so the cathedral grows figurative motifs rather than an
even scatter. Add per-pane "voice-leading" so the slow re-tint of the whole field
tracks the current harmonic root, and let a very long pedal hold crystallise a
cluster into a single larger rose-window super-form.
