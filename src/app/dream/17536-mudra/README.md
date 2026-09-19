# 17536-mudra

**Status:** wip

A vocabulary of discrete, recognized hand gestures — a musical sign-language, a
*mudra* system — that lets you conduct and transform one of Karel's own piano
recordings, one gesture / one event. A live webcam feeds MediaPipe's
GestureRecognizer; each committed gesture triggers a distinct, held
transformation of the real take, and two hands can hold two mudras at once. The
audio is always Karel's recording — never a synth — and the visuals are a WebGPU
compute-particle field that embodies whichever mudra(s) are active.

## The one question

What if you didn't *play* a hand-instrument continuously, but instead **spoke a
discrete alphabet** to reshape a recording — hold a shape, get a held
transformation; change the shape, the sound glides to a new state?

## The interaction

MediaPipe's `GestureRecognizer` (loaded from CDN at runtime, up to 2 hands)
reports the top canned gesture per hand each frame. Rather than mapping 21
landmarks continuously, this piece treats each **recognized gesture as a discrete
event**. A gesture must clear score ≥ 0.6 for a couple of consecutive frames to
*commit* (debounce), so recognition never flickers. Hands are assigned to stable
left/right slots by MediaPipe handedness, so two hands hold two independent
mudras — e.g. left = tempo, right = register. That is the richness.

The mudra alphabet (MediaPipe canned-gesture names → transformation):

| gesture | mudra | transformation of the take |
| --- | --- | --- |
| `Open_Palm` | open | full open playback, bloom of reverb / space (the resting/sustain state) |
| `Closed_Fist` | hold | choke / mute — fast fade to near-silence |
| `Pointing_Up` | lift | bright resonant high-shelf + a small register lift |
| `Thumb_Up` | quicken | tempo / rate up (playbackRate → ~1.5) |
| `Thumb_Down` | deepen | slow / deepen (playbackRate → ~0.6) |
| `Victory` | shimmer | octave-doubling — a second detuned tap of the same buffer an octave up |
| `ILoveYou` | widen | warm chorus / stereo widening |

Only one gesture is active per hand at a time. Hand **height** (middle-finger MCP)
is a continuous modifier scaling the *depth* of the active transform.

## Design notes

- **Latency is the craft.** Detection runs on `requestVideoFrameCallback` (falling
  back to `requestAnimationFrame`), with no async in the control path. Every audio
  parameter is ramped with `setTargetAtTime(target, ctx.currentTime, 0.12)`, so
  switching mudras *glides* to the new state and never clicks — including the choke.
- **The audio is always Karel's recording.** A looping `AudioBufferSourceNode`
  (his solo-piano take, selectable from the Welcome Home / Snowflake catalog)
  feeds a small effect graph: a choke gain, a brightness high-shelf, a convolution
  reverb send, a Haas-style widening pair, and a second buffer source pitched an
  octave up for the shimmer tap. There are **no oscillators, no synth, no generated
  tones** — the impulse response is only reverb colouring. Every node terminates in
  `createSafeMaster(ctx).input` (never `ctx.destination`), and the visuals read the
  music's RMS off `safeMaster.analyser`.
- **The visuals are a WebGPU compute-particle field.** ~24k particles are advanced
  by a compute shader whose force field is built from the active mudra(s): open-palm
  is a slow radial bloom, fist collapses to a dense knot, point-up streams upward,
  victory splits into two braids, chorus widens the swirl. Particle energy and colour
  (a violet ramp) are modulated by audio RMS so the field reads the music. When
  `navigator.gpu` is absent the piece degrades to a labelled Canvas2D fallback that
  runs the identical force model at a lower particle count.
- **Works when shipped.** Designed for a seated laptop webcam (hands in frame from
  roughly waist-up). Whenever the camera is on, a mono status line reads
  `tracking · live` with the current mudra per hand, or a `text-destructive`
  lost-state — *show your hands to the camera* — when no hand is in frame. There is
  no fake autonomous demo: without a camera the piece plays the resting take and
  honestly shows the lost-state hint.

## References

- The NIME **"one gesture / one event"** controller paradigm — discrete recognized
  gestures as musical events rather than continuous mappings.
- **Gesture2Music** (arXiv 2511.00793) — which this piece *inverts*: Gesture2Music does
  continuous gesture → generation; Mudra does discrete recognized-gesture **events**
  transforming a **real recording**.
- The **mudra / conducting-gesture lineage** — a codified vocabulary of hand shapes as
  a language for shaping sound.
