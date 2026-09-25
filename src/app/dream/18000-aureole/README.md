# AUREOLE — conduct the acoustic space your recording lives in, with your face

**Status**: demoable

## The one question

What if you conducted the acoustic SPACE your recording lives in with your face
— lean in and it comes close and dry, lean back and it dissolves into a vast
reverberant cathedral?

## Concept

Karel's real recorded piano is always what you hear — never a synth. The face
never changes the notes; it changes WHERE the sound seems to live. Your face
SCALE (how close you lean to the camera) is read as distance and drives the
*direct-to-reverberant ratio* — the single most reliable auditory cue the human
ear uses to judge how far away a sound is. Lean in: the piano is close, loud,
dry, bright, present. Lean back: it recedes, quiets, darkens, and dissolves into
a long, enveloping reverberant tail — a cathedral you conduct with your body.

## The mechanic

- **Face scale → distance ∈ [0,1]** (primary control). Computed from
  inter-ocular distance (outer eye corners, landmarks 33 / 263), calibrated with
  NEAR/FAR constants for a seated ~60cm laptop-webcam user and smoothed heavily
  (a visual lerp plus `setTargetAtTime` ~0.12s on every audio param). Near →
  louder, drier (dry gain up, wet down), brighter (distance low-pass opens toward
  ~16 kHz). Far → quieter, wetter (long reverb dominant), darker (low-pass closes
  toward ~500 Hz). The dry/wet crossfade is equal-power (`cos`/`sin`).
- **jawOpen blendshape → a swell + a high-shelf shimmer** — opening the mouth
  breathes the space open.
- **head roll (tilt) → a StereoPanner azimuth** on the direct sound, and the
  visual halo tilts to match.
- **browInnerUp blendshape → an extra brightness lift** on both filters.

## Audio graph

One decoded buffer of Karel's real track loops through an `AudioBufferSourceNode`
into two paths:

- **dry:** source → dryGain → distanceLowpass (BiquadFilter, lowpass) →
  StereoPanner → shimmer
- **wet:** source → wetGain → **ConvolverNode** → wetTone (lowpass) → shimmer

The convolver's impulse response is **built from a ~2.2s decaying slice of
Karel's OWN decoded buffer** (exponential decay envelope + a 5ms fade-in), NOT
white-noise reverb — so the reverberant "cathedral" is literally made of his own
recording. A shared jaw/brow high-shelf `shimmer` node is the last stage, and it
is the only thing that connects to `createSafeMaster().input`. Nothing ever
touches `ctx.destination` directly; visuals are driven from `safe.analyser`.

## Camera / tracking

MediaPipe **FaceLandmarker** (with blendshapes) via the shared `cameraTracking`
loader — detection runs on `requestAnimationFrame` with no async hops in the
control path. Tracking is gated only on the base face mesh (eyes / face box), so
a seated laptop-webcam user just works. A status line shows `tracking · live`,
a `text-destructive` lost-state with an actionable hint, or `demo · autonomous`.
With no camera / permission denied / model-load failure, the piece degrades to a
drag-up/down pointer control plus a visible notice — and when no face is present
an autonomous slow drift of the distance parameter keeps the piece alive and
audible (clearly labelled, never masquerading as live tracking).

## Named references

- **Blesser & Salter, _Spaces Speak, Are You Listening? Experiencing Aural
  Architecture_** (MIT Press, 2007) — the direct-to-reverberant ratio as the
  auditory distance cue and the idea of "aural architecture" you can inhabit.
- **arXiv 2504.04075**, _Real-Time Auralization for First-Person Vocal
  Interaction_ — real-time listener-position auralization.
- **arXiv 2511.11930**, _Multimodal Scene-Aware Acoustic Rendering_ (2026) —
  scene-aware, position-dependent acoustic rendering.

## Achromatic-palette rationale

The palette is rigorously ACHROMATIC — bone / silver / graphite on near-black,
strictly equal RGB channels (no warm amber/gold, no cool violet/purple, no hue
at all; red is reserved ONLY for error text). Colour would read as an extra
expressive dimension and compete with the one thing this piece is about: SPACE.
A grayscale aureole lets luminance carry the whole message — radius reads
perceived distance (near = a tight bright core, far = wide dim expanding rings),
and brightness / ring thickness read the direct-to-reverberant ratio — so the
image reads as pure acoustic volume, an aureole of reverberant light, rather than
a mood board. Restraint is the point: the space speaks, and nothing else does.
