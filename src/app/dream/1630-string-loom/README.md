# 1630 — String Loom

**One question:** _What if your whole body were the bridge of a giant string
instrument — where every limb that sweeps across a hanging string field plucks a
real physically-modelled string you both see vibrate and hear ring?_

An embodied, full-body instrument. A vertical field of tuned strings hangs in 3D
space. Your body is the exciter: wherever a tracked joint (wrists, elbows, knees,
ankles, nose) sweeps across a string's column, it plucks that string. The string
then visibly shivers along a decaying standing wave **and** rings via
Karplus-Strong physical modelling. The string you watch wobble is exactly the
pitch you hear decay.

## How it works

### Input — MediaPipe PoseLandmarker (full body)
The 33-landmark `PoseLandmarker` is loaded at runtime by **dynamically importing
`@mediapipe/tasks-vision` from a CDN** (`vision_bundle.mjs`), so there is no npm
dependency. It runs in `VIDEO` mode with the `pose_landmarker_lite` `.task` model
and `numPoses: 1`. Nine joints are tracked — nose, both wrists, both elbows, both
knees, both ankles — each mapped from normalized `(x, y)` into the string-field
plane every frame (x mirrored for a mirror feel). A crossing is detected when a
joint's x moves from one side of a string's column to the other between frames,
with enough velocity; that triggers the pluck.

### Graceful degradation + unattended self-play
If there is no camera, permission is denied, or MediaPipe fails to load, a clear
`text-rose-300` notice appears **and** a deterministic **ghost body** takes over:
a seeded skeleton (five joints on Lissajous/sinusoid sweeps, phases from a
constant-seed `mulberry32` PRNG) sweeps the field and plays the loom on its own.
Pressing **Start** begins the ghost demo immediately — never blank, never silent,
fully reproducible on a headless 06:30 deploy. **Use camera** attempts the webcam
and cleanly falls back to the ghost demo on any failure.

### Output — three.js / WebGL 3D
Fifteen strings are rendered as `THREE.Line` objects whose vertices displace
horizontally (with a little z for depth) along a fundamental standing-wave shape
`sin(πu)` times a decaying `exp(-t/τ)` envelope and a visible oscillation — the
string shivers then settles. Higher strings shimmer visibly faster, reinforcing
the see = hear weld. Palette is a warm loom: bronze → amber → pale bone strings
on a near-black warm-charcoal ground with a dim soundboard behind.

### Audio — Karplus-Strong physical-modelled strings
Each string is a **Karplus-Strong** plucked string: a delay line of length
`sampleRate / frequency`, excited by a short seeded noise burst, fed back through
a two-tap averaging lowpass (`0.5·(cur + next)·ρ`). The averaging filter decays
high partials first into a warm fundamental — the authentic KS timbre. One buffer
per string is pre-rendered once (deterministic, seeded) and a `BufferSource` is
re-triggered per pluck through a per-voice gain + brightness lowpass. The tuning
is **spatial**: pitch is which column you cross (fifteen strings over three
octaves of a just-intonation pentatonic — `1, 9/8, 5/4, 3/2, 5/3`), never a
"no-wrong-notes centroid → pitch" reflex. Velocity, which joint, and body height
modulate only pluck strength and brightness. The master chain sums through a
`DynamicsCompressor` and a modest feedback-delay ring into a master gain of
`0.13` (≤ 0.14) — no clipping.

## Constraints honoured
- `"use client"`, default-exported page component.
- **Deterministic:** no `Math.random` / `Date.now` / `new Date` in executable
  code; all randomness is seeded `mulberry32`.
- No API route — pure client-side.
- Full teardown: camera stream stopped, `AudioContext` closed, RAF cancelled,
  three.js geometries / materials / renderer disposed.
- Respects `prefers-reduced-motion` (slower ghost, longer decay, gentler
  wobble); no strobe — vibration is continuous smooth motion, brightness flashes
  decay smoothly.
- Typography, button sizing, and warm dark theme per the house rules; errors in
  `text-rose-300`.

## References
- **Karplus, K. & Strong, A. (1983).** _Digital Synthesis of Plucked-String and
  Drum Timbres._ Computer Music Journal 7(2) — the plucked-string delay-line
  algorithm at the heart of the audio engine.
- **Michel Waisvisz — _The Hands_ (1984, STEIM).** The pioneering gestural
  body-as-instrument controller; the lineage for treating the whole body as the
  exciter/bridge.
- **"Fluid Body" embodied-sonification research (2026).** Whole-body gestural
  control of physically-modelled sound; the tracked-joint → string-excitation
  mapping and see = hear weld follow this line of work.
