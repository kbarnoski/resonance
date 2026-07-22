# 2314 · The Return

> "What if a room could **remember** your body — build a persistent image of
> where you tend to be — and then start to **anticipate** you, glowing where it
> expects you to move, so that the music is driven by the **gap** between where
> the room thinks you are and where you actually are?"

A mutual-regard room, staged with a camera. The webcam becomes a downscaled
motion-energy field; over time the room accumulates a persistent self-image and
begins to predict you. The drama — visual and sonic — is **prediction error**.

## The two-field mechanic (no master knob)

There is deliberately **no single scalar** driving everything. Two independent
`Float32Array` fields (96×72) conflict:

1. **Live motion field** (`motionRef`) — where you are moving *right now*.
   From the camera it is a thresholded frame-difference of luminance; in
   autopilot it is a soft blob at the phantom body.
2. **Prediction field** (`predRef`) — where the room *expects* you. Built from
   two ingredients:
   - **Memory** (`memoryRef`): a slow exponential moving average of your motion
     (`MEM_ALPHA = 0.016`) — the learned heatmap of your habits, the persistent
     "self-image" of you.
   - **Anticipatory reach**: a short-horizon extrapolation of your recent
     motion centroid (`centroid + velocity * PRED_HORIZON`) rendered as a blob
     that reaches *ahead* of you. Its confidence scales with accumulated memory,
     so a room that knows nothing does not presume to predict.

The **prediction error field** is `max(0, live − prediction)` per cell — motion
that the room did *not* expect. Its total, normalized by live motion, is the
scalar **surprise** (`agreement = 1 − surprise`). Crucially this is a *derived*
quantity: it is the measured disagreement between two fields that are each
updated by their own rule, not a knob anyone turns.

### Habituation

Because `memory` is a continuous EMA of live motion, if you keep doing the
"surprising" thing the memory relearns it. Within a few seconds the prediction
field grows to cover the new region, error drops, and the sound resolves — the
room **habituates**. This is the uncanny "it's getting to know me" arc.

## Audio (`audio.ts`)

Web Audio, driven by the two fields — never one number:

- **Voice LIVE** — a saw pad whose pitch follows the **live** motion centroid
  (y → D-Lydian degree) and whose pan follows its x.
- **Voice ROOM** — a triangle pad whose pitch/pan follow the **prediction**
  centroid. When `agreement` is high it is snapped onto a consonant Lydian
  interval above LIVE (fusion / resolution); when `surprise` is high it drifts
  to its own centroid and **beats** against LIVE (detune grows with surprise).
- **Surprise** also opens the lowpass brightness and sets **onset density** —
  hot percussive "ticks" whose pitch comes from the *gap* between the two
  centroids. Calm → near silence and a mellow pad.

Modal set is **D Lydian** (the #4 gives the floating, unresolved-then-resolved
quality; no bare major-pentatonic). Master ≤ 0.2 through a `DynamicsCompressor`,
1 s fade-in, silent until Start.

## Palette (mandatory break)

A **cool interference-fringe** gamut — Newton's rings / oil-film thin-film
iridescence over a deep petrol base. Not violet→gold, not near-black-cosmic.
The two fields are visually distinct: **live motion** is a bright cyan-white
crest, the **prediction** is teal→indigo standing fringes, and **surprise** is a
hot magenta band (the magenta of a thin-film spectrum). A waiting ring marks the
prediction centroid, a bright dot marks your live centroid, and a tie-line
between them literally draws the prediction error. Raw hex/HSL lives only inside
the WebGL2 fragment shader (the art layer).

## Degradation

- **No camera** (denied / unavailable / 06:30 phone): a **seeded deterministic
  autopilot** (`mulberry32`, seed `0x2314`) synthesizes a phantom body that
  wanders (room learns) → holds still (prediction glows ahead, waiting) → breaks
  the pattern (flare) → settles (room habituates), self-demoing the full ~20 s
  arc with zero permissions. A clear on-screen note explains it.
- **No WebGL2**: a `text-destructive` notice; the main render never falls back
  to Canvas2D.
- Full teardown on unmount: `cancelAnimationFrame`, stop `MediaStream` tracks,
  close the `AudioContext`, delete GL program/texture/VAO + lose context, remove
  listeners.

## Safety

No strobe. All luminance drift is slow (warp/breath at fractions of a Hz; the
surprise shimmer is ≤ 3 Hz). Silent until Start.

## Named references

- **Andy Clark, _Surfing Uncertainty_ (2016)** — the predictive brain;
  perception as prediction-error minimization. The room is a predictive-
  processing agent modeling you.
- **Blanke & Mohr, "Out-of-body experience, heautoscopy, and autoscopic
  hallucination of neurological origin" (_Brain Research Reviews_, 2005)** —
  heautoscopy / autoscopic phenomena: being regarded by a reduplicated self in
  extrapersonal space.
- **Memo Akten, _Learning to See_ (2017)** — a machine that can only see the
  world through what it has already learned; here the room only sees you through
  its accumulated memory of you.

## Files

- `page.tsx` — capture, the two-field model, the WebGL2 interference renderer,
  UI/chrome, teardown.
- `audio.ts` — the two-voice Web Audio engine driven by the fields.
- `rng.ts` — `mulberry32` + the seeded phantom-body autopilot.
- `README.md` — this file.
