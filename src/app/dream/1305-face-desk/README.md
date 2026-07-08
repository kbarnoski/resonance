# 1305 · Face Desk

**What if your FACE were the mixing desk — what if you played a live dub-techno
groove with your eyebrows, jaw, head-tilt and blinks, no mouse, no keyboard?**

An embodied, time-based instrument. A steady 124 BPM dub-techno groove runs on a
16-step / 16th-note transport — four-on-the-floor kick, a rolling filtered dub
bass, closed hats, and a minor-9th chord stab thrown into a feedback ping-pong
delay, all under a global low-pass. Your face plays it.

## The mapping (blendshape → musical control)

| Face move (MediaPipe blendshape / pose)        | Musical control                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| **`jawOpen`** (open mouth)                     | Opens the global low-pass — the whole groove blooms open. Crossing ~0.5 also **throws a dub echo** off into the distance. |
| **`browInnerUp` + `browOuterUpL/R`** (raise)   | **Build / intensity** — layers enter: hats first, then the chord stab. Lower the brows to strip back to just kick + bass. |
| **head yaw** (turn left/right, from the transform matrix) | **Pans** the stab left/right and raises the **ping-pong feedback**. |
| **`eyeBlinkLeft` + `eyeBlinkRight`** (a deliberate blink) | A **quantised beat-stutter / retrigger**, snapped to the grid so it stays musical. Debounced with a cooldown. |
| **`mouthSmileLeft` + `mouthSmileRight`** (smile) | **Harmonic brightness** — a high shelf opens and the chord gains its upper ninth. |

Every continuous control is one-pole smoothed so it isn't jittery. The blink is
edge-detected (both eyes past threshold) with a ~0.42 s cooldown so a natural
blink doesn't machine-gun the stutter.

## Reference

The face-as-controller lineage: **Zach Lieberman & Kyle McDonald's FaceOSC /
ofxFaceTracker** (openFrameworks, face-driven AV performance) and Lieberman's
_Más Que la Cara_ — now browser-native via **MediaPipe FaceLandmarker v2**'s 52
ARKit-style blendshapes.

## How to use it

1. Click **Start — enable camera + sound**. Audio and camera only start on that
   click (the AudioContext is created inside the gesture).
2. Allow the webcam. A dark mixing-console visualization appears: a channel strip
   of faders that move with your face, VU meters that pulse with the groove, a
   pan needle for head-yaw, a step strip with a sweep head, and a small mirrored
   webcam thumbnail with landmark dots so you can see the tracking works.
3. Play: **open your jaw** to bloom the filter and throw an echo, **raise your
   brows** to build, **turn your head** to pan, **blink** to stutter, **smile**
   to brighten.

## How it degrades

- If **getUserMedia is denied** or **MediaPipe fails to load from the CDN**, a
  rose-coloured message explains it and **the groove keeps playing**. Your
  **mouse** stands in: **Y = jaw** (cutoff + throws), **X = build**, **click =
  stutter**. The page is never dead.
- The MediaPipe library loads at runtime from a CDN via a `webpackIgnore` dynamic
  import, so it never enters `package.json` or the build.
- Blink flash is a soft wash and honors `prefers-reduced-motion` — no strobe.

## Design notes — what worked / what's next

`jawOpen → cutoff + delay-throw` is the standout: it's instantly legible because
the sound literally blooms open and echoes as your mouth opens, so the mapping
teaches itself in one gesture. The build-on-brows gives the groove an arc — you
can strip it to a dub skeleton and bring it roaring back with your eyebrows,
which feels like conducting. What's next: per-user blendshape calibration
(subtracting a captured rest pose, since neutral `browInnerUp`/`jawOpen` vary by
face), a swing/shuffle control on head-pitch, and a second tracked face for a
two-person dub duet.
