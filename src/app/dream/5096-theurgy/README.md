# 5096 — Theurgy

**Conducting unseen forces with your hands.**

## The one question

What if you could conduct a living plasma of light and sound with your bare
hands, in the air, with no controller?

## What it is

A webcam sees your hands. MediaPipe HandLandmarker tracks up to **two hands**
(21 landmarks each). Your hands become forces inside a full-screen WebGL2
plasma/interference field that simultaneously drives a real-time Web Audio
instrument. No mouse, no keyboard, no wand — just your hands in the air.

Three subsystems in the loop:

1. **Camera + hand CV** — MediaPipe Tasks-Vision (`HandLandmarker`, `numHands: 2`)
   loaded from the jsDelivr CDN at runtime, detecting from the video frame every
   rAF tick. (Loader copied verbatim from `1051-hand-hyperspace`, including the
   `/* webpackIgnore: true */` dynamic import so the production build doesn't try
   to bundle the CDN URL.)
2. **WebGL2 shader field** — a fragment shader that crosses a domain-warped fBm
   plasma with concentric wave-interference sources, then mirror-folds the plane
   into a kaleidoscope. Deliberately **not** a log-polar / `exp()` warp (that
   trick is over-used in the lab); the warp here is additive domain-warping plus
   an angular fold.
3. **Real-time Web Audio synthesis** — a sustained additive drone whose partial
   spread and resonant lowpass cutoff track finger openness, with a pinch-fired
   shimmer bloom through a convolution reverb.

## The mapping

| Gesture | Effect |
| --- | --- |
| Each of the 10 fingertips | a bright emitter / interference source in the field |
| Pinch (thumb–index) on a hand | intensity + inward zoom focused on that hand |
| Two-hand spread (palm distance) | kaleidoscope symmetry order (together = chaotic, apart = ordered) |
| Hand height (y) | hue drift within the violet band |
| Finger openness | drone partial-spread + resonant filter cutoff |
| Pinch (rising edge) | shimmer / bloom trigger in the audio |

The sound genuinely responds to the hands each frame: openness opens the filter
and stretches the harmonic series toward inharmonic shimmer; energy (hands
present + pinch) drives master level and filter resonance; a pinch blooms a
bell cluster into the reverb tail.

## Graceful degradation (no camera required to demo)

- **Before permission:** title, description, and a primary "Start camera" button.
- **Camera denied / MediaPipe fails / offline CDN:** falls back to **pointer
  control** — dragging moves one "virtual hand" of five splayed emitters, and
  pointer-down acts as a pinch (bloom + zoom). A `text-destructive` note flags
  that the camera is offline and pointer-fallback is engaged.
- **No hands seen / no input:** a slow auto-orbiting virtual hand keeps the
  plasma alive and the drone audible.
- **No WebGL2:** an on-brand `text-destructive` notice; the page does not crash.

## Safety (photosensitive epilepsy)

No hard strobe. The only global luminance modulation is a smooth ~0.15 Hz sine
drift — far below the 3 Hz ceiling — and all other motion is continuous. The
kaleidoscope and plasma move by domain-warp drift, never by flashing.

## References

- **"Real-time hand tracking visualization using MediaPipe and TouchDesigner"**
  (WJARR, 2026) — 21-keypoint hands → OSC → GPU visuals at <35 ms end-to-end.
  The direct-manipulation, hands-as-live-forces premise here follows that
  pipeline's latency budget and keypoint mapping.
- **Heinrich Klüver's "form constants"** — the four recurring geometries of
  visual hallucination (lattice/honeycomb, cobweb, tunnel/funnel, spiral). The
  angular kaleidoscopic fold and radial interference rings are a nod to that
  phenomenology.

## What works

- Full hand → plasma → sound loop at interactive rates; two hands, ten emitters.
- Pinch bloom + inward zoom feels responsive and reads clearly.
- Pointer and auto fallbacks make it fully demoable with no camera.
- Clean teardown of AudioContext, camera tracks, rAF, and the GL context.

## What's rough

- Hand indexing across frames isn't stable, so shimmer is edge-triggered on
  "any hand pinching" rather than per-hand — occasional double/missed trigger.
- The kaleidoscope fold is applied to fingertip positions too, so at high
  symmetry a single finger appears mirrored across every wedge (intentional, but
  it can make precise "aiming" of one emitter less literal).
- Openness/pinch thresholds are tuned for a typical webcam framing; extreme
  distances or angles may need recalibration.
