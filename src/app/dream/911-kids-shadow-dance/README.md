**For: kids (4+)**

# Shadow Dance 🕺✨

A kid makes music by DANCING. The front camera watches their whole body, and
their *movement* — not their fingers, not their voice, not any pitch — scatters
a glowing cloud of light and grants rhythm and texture.

## The one question it answers

> What if a kid makes music by DANCING — their whole body's movement scatters a
> glowing cloud of light and grants rhythm + texture?

## How it works

The front camera feeds **MediaPipe Pose** (whole-body landmarks, loaded from a
CDN at runtime — never bundled). Per frame we read the 33 normalized landmarks
and compute three **movement qualities** (and nothing about pitch):

- **Energy** — total body-motion magnitude (mean per-landmark speed) →
  density/brightness of a GPU particle light-field that blooms around the
  silhouette, plus the warmth/brightness of an always-on granular texture bed.
- **Impulsivity** — sudden, sharp moves (high-passed jerk: frame-to-frame change
  in speed) → a soft, *capped* percussive "bloom" (warm mallet/woodblock) and an
  outward burst of particles. A stomp or arm-throw is the beat. **The kid's
  sudden moves ARE the rhythm.**
- **Fluidity** — smooth, sustained motion (inverse of speed jitter) → shimmer/pad
  brightness and particles that *stream* rather than burst.

**Pitch is held dumb on purpose.** There is one warm always-on drone
(C2 + G2 + C3 — root, fifth, octave) plus a few *fixed* safe accent tones. There
is no scale, no chord, no melody the kid "plays." They compose by **moving**.

The visual output is **three.js** (v0.182): a `THREE.Points` system of ~5,000
additive-blended glowing particles driven by a custom `ShaderMaterial`
(indigo → violet → warm-gold palette). This is a true GPU surface (not Canvas2D,
not SVG).

### Safety (kids gate)

Master chain: `masterGain (≤0.26) → lowpass (≤6.5 kHz) → DynamicsCompressor
(threshold −10, ratio 20:1)`. All attacks ≥ 10 ms, percussion is capped and
throttled, no harsh transients, no high ringing. Built to the "safe for a
sleeping toddler in the next room" bar. The camera feed is **analysis only** —
it never leaves the browser, is never recorded, and is never uploaded.

### Degrades gracefully (hands-off review safe)

- **No camera / permission denied / MediaPipe fails:** a `text-rose-300` notice
  appears AND a synthetic **ghost dancer** runs through the *identical* audio +
  particle pipeline, cycling energy → fluidity → impulsivity, so an unattended
  glance both sees the light bloom and hears the texture within ~1 second.
- **Body goes still for ~2 s:** drifts back into the ghost dancer so an
  unattended phone is always sounding and moving.
- **No WebGL:** `text-rose-300` notice; the audio keeps playing.
- **No Web Audio:** notice; the visuals stay alive.

## References

- **Myron Krueger, *Videoplace* (1970s)** — pioneering full-body interactive art
  where the participant's whole silhouette drives the responsive environment.
- **Children's-movement-sonification model (energy / fluidity / impulsivity →
  granular mapping)** — *"Interactive Sonification of Spontaneous Movement of
  Children,"* Frontiers in Neuroscience (PMC5104747). The three-quality motion
  decomposition used here follows this work.
- **"The Moving Mandala" (2025)** — on rhythmic music + embodied movement
  driving child synchrony and engagement.
- **RESEARCH §540 (2026-06-24):** "a child's whole-body movement → granular
  texture, not pitch."

## What's unverified

This prototype could not be tested on a real device in the build environment.
Needs a real-device pass to confirm:

- Camera permission flow on iOS Safari and the `getUserMedia` / AudioContext
  gesture gates actually unlock under a real tap.
- The MediaPipe CDN import + WASM + model download resolve and run at acceptable
  frame rate on a mid-range phone/tablet (and that `delegate: "GPU"` falls back
  gracefully).
- The energy / impulsivity / fluidity scaling constants feel right with a real
  child's motion (they were tuned by reasoning, not by playtest).
- Audio loudness sits within the toddler-safe target on real device speakers.
- The 2-second still → ghost handoff feels natural rather than abrupt.

## Files

- `page.tsx` — client component: hero, Start gate, per-frame pump, graceful
  degradation, full teardown.
- `pose.ts` — MediaPipe CDN loader, the `MotionAnalyser` (energy/fluidity/
  impulsivity), and the synthetic ghost dancer.
- `audio.ts` — Web Audio: drone + granular bed + shimmer pad + capped
  percussive bloom, behind the safety chain.
- `scene.ts` — three.js GPU particle light-field (`ShaderMaterial`, additive).
