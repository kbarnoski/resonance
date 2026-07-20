# Oneirogen

**The question:** What if you could watch perception hand the wheel from the
world to the dream — a single dial that morphs your visual + audio field from
*reacting to what is actually there* into an *internally-generated hypnagogic
replay* that no longer answers to any input?

A cosmic-ambient psychedelic piece for the state of **hypnagogia / oneiric
drift** — soft, drifting closed-eye phosphene fields at sleep onset, gentle and
boundless, slightly uncanny as forms half-emerge and dissolve.

## The α mechanic

A single parameter **α** interpolates the whole audio-visual field:

- **α = 0 — wake** — bottom-up, sensory-driven inference. An `AnalyserNode` FFT
  of the actual sound (a dropped track, or the built-in ambient pad) is split
  into bass / mid / high bands. Those band energies swell the amplitudes of a
  **sensory scalar potential**; the phosphene streams follow the curl (the
  divergence-free perpendicular gradient) of that potential, so the field
  visibly **tracks the sound** — brightness and stream radius rise with the
  live energy.
- **α = 1 — sleep** — top-down, internally-generated replay. The field
  **detaches** from the input: it advects along an **autonomous potential**
  whose phases drift on their own slow clocks (sub-Hz), and its swell is fed not
  by the live analyser but by a **memory buffer** — a 256-slot ring that
  recorded the world's energy while awake and now loops it back as a remembered
  motif. The forms emerge from the field's own state, not the input.
- **Between** them it is a smooth crossfade — the felt handoff. α changes both
  what you **see** (sensory flow → autonomous replay flow, driving energy blended
  across) and what you **hear** (the live "world" bus fades out while a
  generative **replay pad** — a detuned voicing of the same harmony, nudged by
  the same memory values — fades in). An optional **"let it drift under"**
  toggle slowly auto-ramps α between wake and sleep (~140 s round trip) so the
  piece plays hands-free.

## Audio

- Starts **silent**; the primary **Begin** button resumes the `AudioContext`
  from inside the click handler and lights a soft evolving **built-in ambient
  pad** (four detuned sine/triangle voices through a lowpass, sub-Hz detune
  LFOs), so there is always sound with no file dropped.
- **Input = audio-file**: drop a track anywhere on the stage, or use the file
  picker. Fully client-side — `File.arrayBuffer()` → `decodeAudioData`, no
  network fetch. A dropped track ducks the built-in pad and becomes the world
  the wake-field tracks.
- **Output = Canvas 2D**: a flowing phosphene field of drifting curl-noise
  streams rendered as soft additive radial glows (deep indigo → violet → soft
  lilac). No WebGL, no three.js.
- No struck / percussive / bell events — soft, drifting, tonal throughout.

## Named reference

- **The oneirogen hypothesis** — eLife reviewed preprint **105968**, Version of
  Record **2026-04-21** — models classical-psychedelic and dream imagery as a
  single parameter **α** interpolating between **α = 0 "wake"** (bottom-up,
  sensory-driven inference) and **α = 1 "sleep"** (top-down,
  internally-generated replay), via the **Wake–Sleep algorithm's** α
  interpolation.
- Hypnagogic / closed-eye-phosphene phenomenology at sleep onset informs the
  visual language.

## Safety

**No strobe, no flicker (non-negotiable).** All brightness changes are slow
luminance drift: a global luminance breath at ~0.14 Hz, per-stream phosphenes
that fade in and out gently over their lifetimes, and a trail buffer that
dissolves rather than clears. The autonomous field phases and all audio LFOs run
sub-Hz. The field is never flashed as a whole; nothing pulses above ~3 Hz.

## Honest limits

- **Headless-unverified** — built and tuned in a headless environment with no
  audio device and no user file. The audio-reactivity band mapping, crossfade
  balances, and phosphene brightness were tuned **by reasoning**, not by ear or
  eye; the wake↔sleep balance points may want adjustment on real hardware.
- Degrades gracefully: guards `typeof window`, wraps `AudioContext` creation and
  `decodeAudioData` in try/catch (bad files show a `text-destructive` notice),
  null-checks `getContext('2d')`, and never touches Web Audio / Canvas at module
  top level — only in effects and handlers. With no audio device the visual
  field still runs.
- The "curl noise" is a cheap sum-of-sines scalar potential sampled by finite
  differences, not true Perlin/simplex curl noise — chosen for a calm, boundless
  drift at low cost.
- The generative replay is a memory-modulated pad and a looped energy buffer,
  not a full generative model of the input; it evokes "internally-generated
  replay" rather than reconstructing the dropped track.
