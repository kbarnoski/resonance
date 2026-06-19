# Magnetic Walk

*An ambient, psychogeographic instrument played by the geomagnetic frame you are standing in.*

## The one question

**What if the invisible field around you were audible — the phone's compass heading
and tilt turning the Earth's magnetic orientation into a slowly-shifting drone and a
field of light that locks to magnetic north, so turning your body re-voices the music?**

This is the dream lab's first use of the device compass/magnetometer (prior pieces only
used raw `beta`/`gamma` tilt). It is a cross-modal sonification: an unexpected input
— your orientation inside the geomagnetic field — drives an unexpected output: an
evolving harmonic drone plus a north-locked field of light. The world feels fixed while
you turn; the sound and the aurora are anchored to magnetic north, not to the screen.

## How it works

**Input.** A single `deviceorientation` listener. On iOS we read the true
`webkitCompassHeading` (0° = north, clockwise); elsewhere we derive a heading from
`alpha` (`(360 - alpha) % 360`). `beta` is front/back tilt, `gamma` is left/right roll.
On iOS 13+ `DeviceOrientationEvent.requestPermission()` is called **inside the Start
tap**, in the same gesture that unlocks audio.

**The compass of keys.** The heading circle is divided into 12 stations, each a just-
intoned root + chord color (open fifths, add-9 shimmer, minor sixths, suspensions...).
As you turn, the engine continuously **crossfades between the two nearest stations** and
slews every oscillator frequency — so facing N, E, S, W gives genuinely different drone
colors, and the change between them is a long glide, never a step.

**Mapping.**
- *Heading* → root + chord color (the tonal circle above).
- *Tilt (beta)* → octave shift (±½ octave) and lowpass cutoff — leaning back opens the field.
- *Roll (gamma)* → stereo pan + detune of a high shimmer layer.
- *Turn rate* (smoothed |Δheading|/s) → upper-voice level, filter brightness, shimmer
  volume, and visual brightness/saturation. Standing still settles; turning lights it up.

**Audio.** Four detuned saw/sine voices + a triangle shimmer → a lowpass → a synthesized
convolution reverb (a decaying-noise impulse generated at runtime; no external file). All
parameters move with `setTargetAtTime` for click-free glides. The master gain fades in
over ~2 s. It is a continuous, slowly-morphing field — no beat, no loop, no samples, no
granular/concatenative synthesis.

**Visual.** A WebGL2 full-screen triangle (GLSL ES 3.00) renders a luminous aurora /
radial compass. The entire field is rotated by `-heading`, so it stays **locked to
magnetic north** as the phone turns. Hue follows heading (a hue wheel), vertical band
structure follows tilt, brightness follows turn rate, and a faint north spoke + ring keep
the compass legible on a dark, additive, tone-mapped background.

## Degrades gracefully

- **No sensor / permission denied / desktop / no live events within ~1.8 s →** *ghost
  mode*: a synthetic heading auto-drifts (~6°/s, one turn per minute) with gentle
  oscillating tilt, so the piece is sounding and moving on a silent 06:30 glance with zero
  interaction. A `text-rose-300` notice explains the live sensor is unavailable and it is
  auto-drifting. The moment real compass data arrives, it takes over seamlessly.
- **No WebGL2 →** a Canvas2D fallback draws the same concentric-aurora + north-locked
  spoke idea.
- Alive (sounding + moving) within ~2 s of pressing Start.

## Named references

- **Christina Kubisch — *Electrical Walks*.** She lends visitors special induction
  headphones that make a city's otherwise inaudible electromagnetic fields audible as
  they walk; this piece is its pocket cousin, sonifying the *geomagnetic* field instead.
- **Pauline Oliveros — *Deep Listening*.** A practice of attending to the entire sound
  field as contemplation; the slow, continuous drone here asks for the same patient
  attention rather than interaction.

## Tags

- **INPUT:** device compass heading + tilt (`DeviceOrientationEvent`;
  `webkitCompassHeading` on iOS, `alpha`/`beta`/`gamma` elsewhere)
- **OUTPUT:** WebGL2 (GLSL ES 3.00) full-screen field, Canvas2D fallback
- **TECHNIQUE:** cross-modal geomagnetic sonification → generative drone
- **VIBE:** ambient / psychogeographic / meditative (adult)

## Self-assessment — verified vs. not

**Verified by reading/reasoning:**
- Pure client component (`"use client"`); all `AudioContext` / `getContext` / `window` /
  sensor access is inside `useEffect` / event handlers / the Start callback, never at
  module top level.
- No new npm deps, no API route, no edits outside this folder, no shared-doc edits.
- Helpers are named `run*`/`apply*`/`angleLerpShortest`/`draw*` — none start with `use`
  (so ESLint won't treat them as hooks); `let` → `const` where never reassigned.
- Full teardown: rAF cancelled, `deviceorientation` listener removed, WebGL program/
  shaders/VAO deleted + `WEBGL_lose_context`, oscillators stopped, `AudioContext` closed.
- Single Start gesture does audio-unlock **and** `requestPermission()` together (iOS path).

**Not verified (no device / browser / installed `node_modules` in this environment):**
- A full `npm run build` / `tsc` with dependencies installed (the orchestrator runs the
  authoritative build; `node_modules` was absent here, so type-resolution errors I saw
  were environment artifacts, not real type bugs — I still fixed the one genuine risk, an
  untyped `[]` inferring `never[]`).
- Actual audio timbre and absence of clicks on real hardware.
- GLSL shader compiling on a real WebGL2 context and the aurora looking as intended.
- Real iOS `webkitCompassHeading` behavior and the permission prompt flow on-device.
- That ghost-mode → live-sensor handoff feels seamless in practice.
