# 287 — Mirror Choir

**Status:** demoable · **Cycle shipped:** 2026-06 · adult build

> What if your whole body became a choir — what if Resonance could turn the live
> shape of you, seen through the camera, into sung vowels?

The lab's **first body-tracking piece** in 287+ prototypes. A MediaPipe Pose
Landmarker reads 33 skeletal landmarks from your live camera feed. Those
landmarks drive a four-voice **vocal-formant choir**: your two hands are the
primary singing voices, the openness of your body shapes the vowel, and your
height in frame shifts the register. Move and you sing; stand still and the choir
holds a soft chord.

The visual output is a **matte wooden mirror** — a tessellated grid of warm
amber tiles that reconfigure in real time to show your reflected silhouette, with
near-black gaps between tiles for the background. Pure Canvas2D source-over, no
additive blending, no WebGL glow.

---

## How it works

### 1. Camera → MediaPipe 33 landmarks

On "Begin", the piece requests camera access and then loads **MediaPipe Pose
Landmarker Lite** at runtime from the jsDelivr CDN (via a webpack-ignored
dynamic import so the build stays clean — no npm dependency added). The model
returns 33 normalized `{x, y, z, visibility}` body landmarks per video frame
at roughly 30 fps.

Key landmarks used:
- **Wrists** (15, 16) — each maps to one formant voice
- **Shoulders** (11, 12) — used to measure "shoulder span" baseline
- **Hips** (23, 24) — used in body silhouette hull
- **Ankles** (27, 28) — used for body height calculation
- **Nose** (0) — used for body height and silhouette top

Landmarks are smoothed with a one-pole lowpass filter (α ≈ 0.14) to eliminate
zipper noise from pose jitter. Audio parameters use an even slower smoothing
(α ≈ 0.04–0.06) so pitch and vowel glide rather than step.

### 2. Landmarks → formant choir mapping

**Pitch (wrist height → D-Dorian chord tones)**

Each wrist's Y position (0 = top of frame, 1 = bottom) maps to a chord tone
from a D-Dorian / natural-minor voiced stack:
`D2, D3, F3, A3, C4, E4, G4, A4`
(73 – 440 Hz). Raise your hand → the voice rises to a higher chord tone. The
tuning is strictly diatonic — no pentatonic shortcut, no microtonal drift.

Two ambient "pad" voices (softer, at a perfect fifth above/below the wrist
voices) fill out the chord so the ensemble is never thin.

**Vowel (body openness → formant morph)**

Shoulder span defines a baseline body width. Wrist span relative to shoulder
span gives an "openness" value from 0 (arms by sides) to 1 (arms fully
extended). This drives a smooth morph through five vowel formant states:

```
closed → oo (300, 870, 2240 Hz) → oh → eh → ah (800, 1200, 2600 Hz) → open
```

Formant values follow the classic **Klatt / Peterson-Barney** tables for sung
vowels. Each voice is a sawtooth oscillator (glottal pulse approximation)
split into three parallel bandpass filters (F1, F2, F3) with Q values 8–12,
creating the characteristic resonance peaks of the human vocal tract. All four
choir voices morph the same vowel in unison.

**Register (body height → octave brightness)**

The vertical span from nose to ankles (as a fraction of frame height) shifts
a `registerShift` multiplier between 0.75× and 1.0×. Crouch or crop yourself
small in frame → the choir drops toward a lower, darker register.

**Pad drone (always on)**

Four sine-tone pad voices at D2, A2, D3, A3 (73, 110, 147, 220 Hz) run at
very low gain (≈0.04) as a harmonic floor. The choir is never fully silent.

### 3. Matte wooden-mirror rendering

Visual inspired by **Daniel Rozin's** *Wooden Mirror* (1999): a physical
installation of 830 wooden tiles driven by motors to reconfigure as a live
reflection of the viewer — the first "digital mirror" made of tangible material.

Implementation here is pure Canvas2D:
- The canvas is divided into 14×14 px tiles (each tile drawn 12×12 px with a
  1px gap on each side).
- For each tile, the code tests whether the tile center falls inside the
  **body ellipse** derived from landmark bounding box (inflated ~35% to
  cover the full silhouette).
- Where a live camera feed is available, an OffscreenCanvas samples the
  (horizontally flipped) video at tile resolution, and pixel brightness
  > 0.28 is used as a secondary in-body signal — this makes the mirror
  respond to the actual camera image rather than just the geometric hull.
- **Body tiles**: warm amber hue (hsl ≈ 36°, 42% sat, 60–82% lightness)
  with a subtle per-tile lightness noise for wooden-texture variation.
  A small drop-shadow (blur 3px) gives the tiles gentle depth.
- **Background tiles**: near-black (hsl 240°, 8% sat, 6–11% lightness).
- **Ghost mode**: violet-grey tiles (hsl 260°, 18%) distinguish the demo
  silhouette from a live camera session.
- **Wrist dots**: small amber (camera) or violet (ghost) filled circles
  drawn at wrist landmarks — a subtle visual cue for which body parts are
  driving the voices.

The camera is drawn horizontally flipped (mirror convention) throughout.

---

## Graceful degradation

If `getUserMedia` is denied, unavailable, or MediaPipe fails to load, the
piece automatically falls back to a **ghost dancer demo**: a looping sequence
of 7 hand-authored keyframe poses (neutral stance, left arm raised, arms wide,
right arm raised, hands crossed, lean/reach, back to neutral) interpolated with
smooth-step easing over a 20-second cycle. The ghost dancer drives the exact
same choir and mirror render — the piece is fully audible and visual with zero
camera access. A `text-rose-300` banner reads:

> Camera unavailable — playing a ghost dancer demo

---

## Named references

- **Daniel Rozin, *Wooden Mirror* (1999)** — the originating installation:
  830 motorized wooden tiles that reconfigure as a live reflection of the
  viewer. This piece borrows the tile-grid mirror aesthetic and applies it
  to a browser canvas with landmark-driven silhouette masking.
- **MediaPipe Pose Landmarker (Google AI Edge)** — 33-point real-time 3D body
  pose estimation in the browser via WASM + GPU delegate. Loaded at runtime
  from CDN (`@mediapipe/tasks-vision@0.10.22`).
- **Klatt-style vocal formant synthesis** — Dennis Klatt's cascade/parallel
  formant synthesizer (1980) established the F1/F2/F3 bandpass-resonance model
  of the vocal tract. The formant frequency tables here follow the
  Peterson-Barney (1952) reference values for sung vowels (oo, oh, ah, eh, ee).

---

## Design notes

- **No pentatonic.** D-Dorian / natural minor chord tones voiced as a
  minor-7 spread (D–F–A–C–E–G). The jury has flagged pentatonic as over-used.
- **No additive blending / no WebGL.** Pure Canvas2D, source-over only.
  Drop-shadows at blur 3px maximum. No glow, no particle trails.
- **AudioContext inside the click handler.** `buildAudio()` is called only
  from the `useEffect` triggered by the `started` boolean which is set
  in the "Begin" button click — satisfying browser autoplay policy.
- **Refs, not state, in the animation loop.** All landmark, smoothed-param,
  and audio-node references live in `useRef` to avoid stale closures and
  re-render storms during the 60 fps RAF loop.

---

## Next-cycle deepening

- **Multi-person choir**: `numPoses: 2+` and assign each detected person
  to additional formant voices — a literal human choir.
- **Hand-landmark articulation**: MediaPipe Hand Landmarker gives 21 points
  per hand; finger curl and spread could control fine vibrato and tremolo depth.
- **Record-your-pose loop**: capture a 4-bar pose loop and play it back as
  a persistent voice while you improvise a second part on top.
- **Segmentation mask**: MediaPipe supports pixel-level segmentation; use it
  for a sharper, pixel-accurate silhouette mask instead of the ellipse hull.
- **Reverb via AudioWorklet**: replace the delay-loop reverb with a true
  convolution or Schroeder-network for a more spatial choral acoustic.

---

*Self-contained: Web Audio + Canvas2D + CDN-loaded MediaPipe. No API route.
No new npm dependencies. Camera/mic are used locally only — nothing is
recorded or transmitted.*
