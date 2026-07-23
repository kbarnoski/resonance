# 2340-echo-body

A drug-free out-of-body / proprioceptive-decoupling piece. Your webcam-seen moving
body sculpts a 3D HRTF spatial-audio field on headphones — but the sound of your
own motion is **time-displaced**. An echo-self first **lags** behind you and, over
minutes, drifts to **lead** you, so the felt agency of "you" decouples from the
visual body.

## The mechanic: two orthogonal axes, no master knob

The camera (or the synthetic fallback) yields **two independent state variables**,
never a single 0→1 intensity:

- **centroid** — the horizontal center of moving pixels (where you are, left↔right),
  read via frame-differencing on a hidden 64×48 offscreen canvas.
- **expansion** — the spatial spread / bounding extent of moving pixels (are you
  contracted or spread wide).

These can and do conflict: you can drift left while contracting, or hold position
while spreading. There is deliberately no "calm → peak" dial. In the audio field,
**centroid → azimuth** and **expansion → elevation + radius** (spreading pushes the
echo higher and farther out). Both drive HRTF `PannerNode`s directly.

## The temporal drift: lag → lead

A rolling buffer holds ~8s of body state. The echo-self voice reads that buffer
through a displacement that **eases from +2.25s (past, lagging you) through zero to
−1.0s (predictive lead) over five minutes**. While leading, the state is linearly
extrapolated from the buffer's recent velocity, so the echo *anticipates* your
motion. A second, faint **present-tense** voice tracks the live state, so you can
hear the widening gap between now-you and echo-you. This is long-form evolution,
not a loop — the crossing through "now" happens once.

## Audio

Two carrier voices (echo-self + faint present-self), each a breathy formant voice
(detuned saw pair → two parallel formant bandpasses + body lowpass + filtered
breath noise, with vibrato) so the echo reads as a *self*. Each voice → its own
`PannerNode({ panningModel: "HRTF" })` → shared gain → `DynamicsCompressor` →
destination. Master ≤ 0.22 with a 1s fade-in; silent until Start.

## Visual — SVG-DOM only

A minimal top-down "observation-room" plan (no canvas / WebGL): the listener's head
at center, a solid **now-you** glyph at the live centroid/expansion, a trailing
ribbon of past positions, and the hollow crosshaired **echo-self** glyph riding
that ribbon at the current temporal offset — so you *see* the echo lag, then cross
to lead. Thin centroid and expansion meters mark live vs. echo. SVG attributes are
mutated directly in the `requestAnimationFrame` loop. Palette: bone/silver on cool
charcoal (`#e8e8ea` / `#9a9aa2` on `#16171b`) — a clinical OBE-lab feel.

## Fallback (fully alive with zero camera)

If the camera is denied or unavailable, a **synthetic auto-moving body** drives the
same pipeline: a wandering centroid (17s) and an independently breathing expansion
(11s, incommensurate) so the echo-self orbits and the lag→lead drift plays out with
no camera at all. A "synthetic body (no camera)" badge is shown, and an
**Enable camera** button is always offered to hand over to the real body mid-piece.

## References

- *Audiovisual stimuli based out-of-body illusion* — Scientific Reports (2024),
  **s41598-024-74904-5**: sound plus a displaced camera view induced an OBE.
- **Olaf Blanke** — full-body-illusion and bodily-self-consciousness research
  (the proprioceptive/visual/auditory conflict that self-location rides on).

## Next-cycle deepening

Add a slow **head-orientation** read (device orientation or face-box tilt) so the
listener's own facing rotates the HRTF frame independently of the two body axes —
a third orthogonal conflict, letting the echo sit *behind* the head at the moment
it crosses from lag to lead, deepening the "someone else is moving me" inversion.
