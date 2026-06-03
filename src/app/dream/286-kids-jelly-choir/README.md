**For**: kids (4+)

# Jelly Choir

Five wobbly jellies sit in a row, each a different candy color, each with googly
eyes and a smiling mouth. Poke one with your finger (or drag it) and it stretches,
springs back, and **wobbles** — and as it wobbles it **sings**. The shimmer of its
voice is not a sample and not a fixed beep: it is literally driven by how much the
jelly is jiggling. Poke two jellies at once and you hear them harmonize.

## The one question it answers

What if a kid squished a wobbly jelly and heard it *sing its own wobble* — and
squished two together to make a chord?

## Why it's novel in the lab

The lab has 90+ kids instruments, but almost all of them play a plucked string or
a triangle bell locked to a C-major pentatonic scale the instant you tap. Jelly
Choir is the lab's **first mass-spring / Verlet soft-body → audio** instrument:

- **The instrument is a physical object you deform, not a button.** Each jelly is a
  ring of 14 point-masses held in a circle by *radial* springs (each point pulled
  toward the jelly's center) and *structural* springs (each point pulled toward its
  neighbors). Poke a point and the **Verlet** integrator carries the velocity you
  put in, so on release the jelly overshoots and wobbles back — real soft-body
  physics, not a canned animation.
- **The sound is the wobble.** Every frame we measure the jelly's *deformation
  energy* — the mean distance each surface point has strayed from its rest circle.
  That one number drives the voice: energy² → loudness (so a jelly at rest is
  silent), energy → low-pass brightness (a hard squish sounds brighter), and
  energy → vibrato depth + rate (a big wobble shimmers faster). The voice tracks
  the jiggle in real time.
- **The tuning is just intonation, not pentatonic.** The five jellies are tuned to
  1/1, 9/8, 5/4, 3/2, 2/1 over a 196 Hz (G3) root — consonant *pure* intervals, but
  deliberately **not** C-major pentatonic. Poke two jellies and you hear a clean
  justly-tuned interval ring out, with a soft glowing thread drawn between them.

## How to play

- **Poke or drag any jelly** — it wobbles and sings. The harder/faster you flick it,
  the louder and brighter it gets, then it settles back to silence.
- **Poke two at once** (two fingers, or two kids) — they harmonize, and a light
  connects them.
- There are **no wrong notes** and no fail states. A soft drone hums underneath the
  whole time, so it's never silent.

## Design / technique notes

- **Physics**: Verlet integration with Jakobsen-style constraint relaxation
  (2 substeps × 3 iterations of radial + structural distance constraints per frame),
  velocity damping 0.93. The rest radius "breathes" on a slow sine so a jelly looks
  alive before you touch it. Multi-touch: each pointer pins the nearest surface mass
  of the nearest jelly.
- **Render**: inline animated SVG. The jelly body is a closed Catmull-Rom curve
  through the 14 masses converted to cubic Béziers; a soft Gaussian-blur glow filter
  gives the candy sheen. Eyes are an HTML overlay; the mouth is an SVG path that
  opens with energy. **No `<canvas>` anywhere** — SVG always renders, so this is the
  lowest-risk path for a 06:30 demo on any device.
- **Audio**: per jelly = sine fundamental + a quiet triangle octave → energy-gated
  gain → low-pass → master → `DynamicsCompressor` limiter. A shared LFO per voice
  does the vibrato. Always-on root+fifth drone. The `AudioContext` is created on the
  first poke (mobile autoplay rule); before that the jellies still wobble silently.
- **Degrades**: if `AudioContext` can't be created, the visuals still wobble. SVG
  needs no GPU. Nothing is recorded, transmitted, or persisted; no mic, no camera,
  no network.

## References

- nlm: *Real-Time Non-linear Modal Synthesis in Max* (arXiv 2603.10240, 2026) — the
  research-cycle anchor (§292) for physical-modeling synthesis.
- Xavier Provot, *Deformation Constraints in a Mass-Spring Model to Describe Rigid
  Cloth Behaviour* (1995) — the constraint-relaxation soft-body method.
- Müller, Heidelberger, Hennix, Ratcliff, *Position-Based Dynamics* (2007) — the
  stable position-level constraint solving this borrows.

## Where to take it next

- True modal partials derived from the blob's *eigenmodes* (so the timbre is the
  shape's real resonance, not a fixed integer-octave stack).
- Real inter-blob **collision** so you can physically shove two jellies together
  (today the harmony glow is proximity/energy-based, the jellies hold their seats).
- A "rest pose" drift so each jelly slowly morphs its idle shape — more alive.
- Tilt the device to make all the jellies sag and bounce under gravity.
