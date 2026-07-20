# 2010 — Boundless Void

## The one question

**What if the Ganzfeld / oceanic-boundlessness experience were delivered almost
ENTIRELY through spatialized sound — the screen nearly black — so the
dissolution of self happens in your ears, not your eyes?**

This is a deliberate **test of the lab's screen bias**. Almost every prototype
here is screen-first: a rich visualizer carries the piece and audio is a
companion. Boundless Void inverts that. The screen is near-black — a single warm
radial glow that only breathes — and roughly **90% of the experience is sound**.
If it works, it proves an immersive, boundary-dissolving void can be carried by
the ears alone.

## The phenomenology

A **Ganzfeld** is a homogeneous, unstructured perceptual field (classically a
featureless red-lit visual field). Starved of structure, the perceptual system
stops finding edges to lock onto and the mind begins to *fill the void* — drifting
imagery, then, at depth, **oceanic boundlessness**: softened self-boundaries, a
loosening of the felt line between self and surround, up to **ego-dissolution**.
The engine is sensory *deprivation*, not stimulation — remove the structure and
the self-model destabilizes.

Here the featureless field is **auditory**. A soft brown-noise bed provides the
homogeneous ground; HRTF-spatialized drone voices orbit slowly around the
listener so that **distance and azimuth become the "space"** you float inside.
On headphones the sources feel genuinely *outside the head* and enveloping — the
void has extent, and you are suspended in it.

## References (honest, named)

- **Wackermann, Pütz & Allefeld**, *Ganzfeld-induced hallucinatory experience*
  (*Cortex*, 2002) — the canonical account of imagery arising from a homogeneous
  sensory field.
- **Thalamo-cortical *decoupling*** under sensory homogeneity — fMRI evidence
  (Nature *Scientific Reports*, 2020, `s41598-020-75019-3`).
- **"Oceanic states of consciousness"** (*Frontiers*, 2026) — framing of
  oceanic-boundlessness / ego-dissolution phenomenology.
- **arXiv:2507.09011** (July 2026) — fresh work on the same territory.

These inform the *design intent*; the piece is an artistic prototype, not a
replication of any study.

## The technique: HRTF spatialization

The spatial field is built with the Web Audio API's `PannerNode` set to
`panningModel: "HRTF"`, feeding the default `AudioListener` at the origin. Four
drone voices are placed at different radii, azimuths and elevations and then
**slowly orbited** (each on its own alternating, sub-0.02 rad/s clock) with a
radius that breathes. Because HRTF applies real head-related transfer functions,
azimuth and distance are heard as genuine external placement rather than simple
stereo panning. There is **no `<canvas>`, no WebGL, no three.js** — the only
visual is a CSS `radial-gradient` on a single `<div>` whose opacity and scale
drift via `requestAnimationFrame`.

## The harmonic model (and why NOT a fixed JI stack)

A fixed just-intonation partial stack — e.g. `[1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2]`
over a low root — is consonant but **static**: minute 5 sounds like minute 1, and
the "void" stops evolving. This piece is **explicitly forbidden** that approach.

Instead the harmony **moves**:

- A small consonant modal set is expressed as **semitone degrees**
  (`[0, 3, 5, 7, 10, 12, 15]`, a warm minor-pentatonic-ish ring).
- Each voice **rotates** through that ring on its own slow clock (tens of
  seconds), and a **continuous global transpose** (a sum of slow sines) drifts
  the whole set by up to a couple of semitones over minutes — so *the scale
  itself changes over the piece*.
- Every oscillator **chases its target through a long portamento**
  (`setTargetAtTime` with a 7–13 s time constant), turning each degree change
  into an audible glide rather than a discrete jump.
- The low root also wanders ±~1 semitone over ~2 minutes, and each voice fades in
  and out on an independent density LFO, so the *spatial arrangement and density*
  differ across the arc.

The result is consonant, calm, and boundless — but always moving. It is
different at minute 5 than at minute 1, then loops gently.

## Input

- **"Enter the void"** starts audio (a user gesture is required) and ramps the
  master gain in over ~6 seconds — never a sudden blast.
- **Breath** modulates density, timbre and the orbit's pulse. Default is an
  **autonomous ~5.5 breaths/min cycle** so the piece self-demos with no sensor.
  Opting into the **mic** maps smoothed RMS to the same envelope; if the mic is
  denied or unavailable it **degrades gracefully** back to the autonomous cycle.
  Nothing is recorded or transmitted.
- A **mono-text readout** ("3 voices · drifting · 2.4 min") names what is audible
  right now, so even a silent reviewer can see the piece is alive.

## Safety

No fast flicker. The glow drift is **opt-in, off by default**, soft, hard-capped
at 3 Hz through the shared `SafeFlicker` engine, and stops instantly. Both the
glow and the audio honor `prefers-reduced-motion` (reduced luminance drift, no
scale pulse). Master gain sits well below clipping and ramps in gently. All audio
nodes are disconnected and the `AudioContext` is closed on unmount.
