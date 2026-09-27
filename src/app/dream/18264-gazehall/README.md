# 18264-gazehall — look at your recording to hear it

**Status**: demoable

## The one question

What if you could LOOK at your recording to hear it — turn your head to sweep a
spectral searchlight across one of Karel's piano takes, so wherever your gaze
lands, that band of the music blooms up out of the dark?

This is a **gaze-contingent auditory spotlight**. Head/gaze orientation is the
conductor. It is **pitch-clean**: the recording's pitch and speed never change —
you only shape WHICH frequencies you hear and where they sit in space.

## How it works (the control path)

Head **yaw** and **pitch** are read from MediaPipe FaceLandmarker landmarks
(robust, no dependence on the transformation matrix):

- **yaw** — the nose tip's horizontal offset from the midpoint of the two
  eye-outer corners, normalized by inter-eye distance (x mirrored so it reads
  like a mirror).
- **pitch** — the nose tip's vertical offset from the eye line, normalized by
  face height.

Both are smoothed with an exponential smoother (~0.12 s time-constant feel).
They derive a **spectral focus** over log-frequency:

```
look UP    → focus rises toward treble  (the air & body of the recording)
look DOWN  → focus falls toward bass
look L / R → StereoPanner sweeps the stereo field AND the focus slides across
             the band centers
```

**Audio.** One of Karel's real tracks (Welcome Home / Snowflake, via
`loadRealTrackBuffer`) loops at `playbackRate = 1.0` — never granulated, never
re-pitched. A **parallel bank of 10 bandpass filters** (log-spaced 80 Hz–8 kHz),
each into its own gain node, splits the take. A Gaussian window centered on the
gaze's spectral target raises the bands under your gaze and lowers the rest to a
low floor (so the piece is never silent). A `StereoPannerNode` follows yaw, and
an overall intensity gain follows how far the head leans. The summed output
terminates in `createSafeMaster().input` — never `ctx.destination`.

**Visual.** A raw **WebGL2** full-screen fragment shader (hand-written GLSL ES
3.00, no three.js) renders a dark hall holding a luminous volumetric
searchlight. The beam's direction follows the gaze; where it falls, a
spectrogram field blooms — deep violet/indigo lows → cyan → luminous white
highs, driven by `safeMaster.analyser` FFT bins mapped onto a log-frequency
axis. Accumulated march steps give soft godrays and depth; outside the cone
falls to near-black. If WebGL2 is unavailable, a Canvas2D fallback renders the
same field with a small notice — never a blank screen.

## Runs without a camera (self-verifying demo drive)

On load — and whenever the camera is not granted or available — a clearly
labeled synthetic head-orientation signal sweeps the gaze cone across the field
on a smooth **Lissajous** path of yaw & pitch. The full loop
**gaze → spectral focus → (audible EQ/pan shift + visible beam)** runs and is
visible/audible on its own, so it is verifiable in a headless cloud environment
with no webcam. The tracking-status line distinguishes the states:

- `demo sweep · no camera` — the self-driving demo (muted foreground)
- `tracking · live` — a face is being tracked (foreground)
- `no face · face the camera, look around` — camera on but no face (destructive)

Click **Use camera** to swap the demo signal for live head-pose. The demo path
is a first-class, permanent mode.

## References

- Vinnikov & Allison, "Gaze-Contingent Auditory Displays for Improved Spatial
  Attention."
- bioRxiv, Aug 2026, "Listening shapes seeing" — attending to a sound in a
  location sharpens vision there. This piece makes that cross-modal loop
  playable: you look to hear, and hearing pulls your looking.

## Audio provenance

Karel's real catalog only (`COLLECTIONS` / `REAL_TRACKS`), routed through the
shared safe-master bus. No synth, no oscillators, no empty featured feed, no
pitch or speed change.
