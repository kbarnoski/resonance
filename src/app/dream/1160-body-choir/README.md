# 1160 · Body Choir

**The one question:** *What if you could conduct a luminous choir with your whole
body — no controller, no touchscreen, just movement in front of your webcam?*

An embodied, camera-motion instrument. You stand in front of your webcam and
your movement paints light across a bright, sunlit canvas while lifting the
voices of a warm choral pad. No touch, no drag, no 3D field, no dark cosmic
glow — this is high-key daylight and whole-body gesture.

## What it is
- **Input:** the webcam (`getUserMedia`, video only). A faint mirrored
  thumbnail of you sits in the corner so you can see yourself conducting.
- **Output:** Canvas2D high-key composite (ivory→peach gradient, additive
  coral/gold/sky-blue light-ribbons that trace where you move) + a Web Audio
  choral "aah" pad.

## The optical-flow technique (self-contained, no libraries)
Every frame the video is drawn — mirrored — into a tiny **32×24** offscreen
canvas. For each of those 768 cells we compute Rec.601 luma and compare it to
the previous frame (**frame-differencing block-motion energy**). Cells whose
brightness changed beyond a noise threshold deposit energy into a persistent,
decaying field. From that field we derive:
- **total energy** (how much you're moving),
- an **energy-weighted centroid** (x, y — where you are), and
- a **rising-edge speed** (how suddenly the motion swelled).

No MediaPipe, no ML model, no CDN fetch — it's ~40 lines of pixel math in
`flow.ts`. The identical `MotionField` shape is also produced by the pointer
and idle drivers, so the whole instrument runs the same mapping regardless of
source.

## The mapping (motion → choir)
| Motion | Sound | Light |
|---|---|---|
| total energy | pad loudness + lowpass opening | aura brightness + halo size |
| centroid height (hands high → low) | which voice sits in the light — upper voices bloom high, bass low, over a warm just-intonation G voicing (G2 D3 G3 B3 D4 G4) | hue: top = sky-blue/gold, bottom = coral |
| centroid X | stereo pan of the high shimmer + per-voice pan lean | conductor halo position |
| speed | attack-brightness lift on the filter + shimmer | — |
| stillness | eases to a calm sustained drone (never silent-dead) | trails decay to a restful glow |

Audio is a stack of detuned saw/triangle oscillators (3 per voice) through a
shared lowpass, a slow shared vibrato for chorus, and a master
`DynamicsCompressor` acting as a limiter. Start is gesture-gated; onset is a
1.6 s swell (no click, no flash). All parameter moves use `setTargetAtTime`
smoothing, so brightness/loudness drift smoothly well under 3 Hz — **no
strobing** (photosensitive-safe).

## Named reference
Myron Krueger — **Videoplace** (1975), the first full-body interactive
projection instrument. It sits in the lineage of Golan Levin and Camille
Utterback's camera-driven audiovisual work.

## Fallbacks (never a dead screen)
- The canvas animates from mount with a deterministic idle wander — no gesture
  or permission required to see it alive.
- **No camera / permission denied:** a visible `text-rose-300` notice appears
  and the piece falls back to **mouse mode** — pointer position + velocity feed
  the exact same mapping, so it's fully playable. There's also an explicit
  "Play with your mouse" button.
- **No Canvas2D:** a notice is shown.

## Determinism / teardown
- No `Math.random` / `Date`-seeded per-frame randomness. Mote positions come
  from a `mulberry32` PRNG seeded with a constant; drift is pure trig.
  `performance.now()` is used only for RAF timing.
- On unmount: RAF cancelled, all camera tracks stopped, choir faded and
  `AudioContext` closed, resize/pointer listeners removed.
- `prefers-reduced-motion` is honored — gentler brightness swings, slower audio
  smoothing, tamer idle drift.

## Verified vs. not
- **Verified:** `npx tsc --noEmit` clean for this folder; `npx eslint` clean
  for this folder. Loop/teardown/fallback logic reviewed by reading.
- **Not verified (no webcam/audio hardware in the build env):** live camera
  capture quality, real motion-to-pitch feel, and audio timbre were not
  exercised in a browser. The frame-differencing math, gesture gating, and the
  pointer fallback are logically complete but untested against a live device.
