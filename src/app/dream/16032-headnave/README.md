# 16032 · headnave

**Walk his nave with your head.**

## The one question

**What if your physical head — tracked by the webcam — were how you walk through
a room of Karel's own recordings?**

Six of Karel's real takes stand at fixed points in a dark 3D "nave," each an
HRTF-spatialized voice. Your head is the WebAudio listener: lean and turn to
move through the field. The mix is nothing but where your head is pointing and
standing.

## How head-6DOF maps to the listener

Head pose comes from MediaPipe FaceLandmarker's **facial transformation matrix**
(a 4×4 column-major matrix per frame). From it we read:

| head 6DOF                        | listener control                                   |
| -------------------------------- | -------------------------------------------------- |
| **yaw** (turn about Y)           | listener **facing** — rotates the forward vector   |
| **translation x** (lean L/R)     | listener **x** — step across the room              |
| **translation z** (lean in/out)  | listener **z** — walk forward toward the altar     |
| **pitch** (nod about X)          | read and available for tuning (kept subtle)        |

On enabling head tracking the first stable frame is captured as a **calibration
baseline**, and all motion is measured relative to it, so wherever your head
rests becomes centre. Every channel has a small **deadzone** and heavy **lerp
smoothing** so the room breathes around you instead of twitching.

Each take is its own looping `AudioBufferSourceNode` (`loop = true`) →
`PannerNode` (`panningModel="HRTF"`, `distanceModel="inverse"`, refDistance /
rolloff / maxDistance set) at a fixed 3D coordinate → a per-voice `GainNode` →
`safeMaster.input`. A per-voice `AnalyserNode` (fftSize 64) taps each source for
the visual. Nothing connects to `ctx.destination` directly — everything routes
through the shared ear-safety master.

## Graceful degrade (camera is a secondary layer)

On load the piece **defaults to a pointer/keyboard fallback** that drives the
exact same listener — pointer across the field turns and walks you, WASD/arrows
and Q·E also steer — so a reviewer sees the field respond immediately with **zero
permission prompts**. A secondary button, **"Enable head tracking (webcam),"**
requests the camera and switches to head control. If `getUserMedia` is denied,
MediaPipe fails to load, or no face is detected, it falls back to the pointer and
shows an on-brand `text-destructive` notice. Never a dead screen.

## Output / palette

- **WebGL2** primary renderer: a dark spatial field, one glyph/node per take
  projected first-person to match its audio coordinate, blooming as your head
  faces and approaches it (driven by each voice's analyser + listener
  proximity). A Canvas2D overlay bakes in datamatics chrome — thin frame ticks
  and monospace numeric readouts (yaw°, x/z, focused take). If WebGL2 is
  unavailable, the audio still follows and a notice explains.
- **Palette = Ikeda black-white-red only.** Near-black ground (#05060a-ish),
  bone-white marks, one oxblood/signal red (#d4143a) for the focused voice and
  the "you are here" reticle. Datamatics restraint: precise grid, thin ticks, no
  warm ambers, no violet, no rainbow.

## Ambition-floor criteria it hits

- **Graduates a prior lab piece**, not a fresh sketch: it takes 15536-antiphon's
  spatial nave and replaces its keyboard steering with embodied head control.
- **A real second input modality** (webcam 6DOF head pose) layered onto genuine
  spatial audio, with a working, demoable fallback.
- **Rule-10 clean**: audio is only Karel's real catalog — zero synthesis, no
  oscillators. Six distinct verified anon-servable takes.
- **On-brand craft**: Ikeda datamatics palette, calm motion, ear-safety master,
  full teardown.

## Named references

- **Graduates `15536-antiphon`** — the keyboard-navigated nave of Karel's takes;
  here keyboard → embodied head.
- **Webcam head-tracker for binaural auralization** — the line of work using
  MediaPipe FaceMesh 468-landmark 6DOF head tracking to drive a binaural
  listener so the spatial mix updates with your real head.
- **Navig-AI-tion (CHI 2026)** — spatial-audio directional cues let you navigate
  a space by orientation alone; here your head orientation is the navigation.

## Notes

- Only Karel's real takes (Welcome Home: Interplay, Welcome Home, The Knife,
  Playa, Isolation; Snowflake: Snowflake). No generated tones.
- The camera is a **secondary** control layer with a full pointer/keyboard
  fallback — the piece is instantly demoable without it.
- Head-translation gains are generous with clamping because MediaPipe's matrix
  translation units are camera-relative; tune `HEAD_X_GAIN` / `HEAD_Z_GAIN` /
  `HEAD_YAW_GAIN` and the deadzones to taste.
