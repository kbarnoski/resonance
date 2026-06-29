# 1051 — Hand Hyperspace

**One question:** *What if you could reach into hyperspace and rotate a four-dimensional jewel with your bare hands?*

## What it is

A playable psychedelic instrument. You raise your hands to a webcam and your
gestures rotate a 4D polytope (a tesseract / 8-cell or a 24-cell) through all
six independent rotation planes of four-dimensional space at once. The polytope
is stereographically projected 4D → 3D → 2D and drawn on a Canvas 2D surface as
glowing, chromatic edges that morph and bloom as the jewel tumbles. Each of the
six rotation planes also drives one partial of a just-intonation chord — so the
same gesture that turns the geometry *plays* it into existence.

This is not a lean-back screensaver: it sits idle and drifting until you reach
in, and then the hands are clearly steering both the picture and the sound.

## Altered state

- **State:** DMT-breakthrough hyperdimensional geometry — "more axes than
  physical reality allows," the more-real-than-real lattice that breakthrough
  reports describe.
- **Pole:** intense.

A 4D object cannot fit in our space, so its 3D/2D shadow appears to turn itself
inside out, with edges blooming through one another — the literal phenomenology
of impossible, hyperdimensional geometry. Spreading your hands zooms toward
"breakthrough," brightening and saturating the whole field.

## How to use it

1. Press **Start**. (This also resumes the AudioContext — browsers block audio
   until a user gesture, so there is no sound before you click.)
2. Allow the webcam if prompted, then **raise your hands** into frame, palms toward
   the camera.
   - **Left hand height** → XW-plane spin (the primary "into 4D" rotation).
   - **Right hand horizontal sweep** → YW-plane spin.
   - **Spread between your hands** → ZW-plane spin **and** zoom toward breakthrough
     (brighter, more saturated).
   - **Pinch** (thumb to index) on either hand → holds the geometry still.
3. Pick the jewel: **tesseract (8-cell)** or **24-cell**.

**Always playable / graceful degradation:** if the MediaPipe CDN import fails,
the camera is blocked, or no hands are seen, it falls back to **pointer drag** on
the canvas (drag steers XW/YW, scroll-wheel zooms). With zero input it slowly
auto-drifts and keeps sounding, so it is never a dead screen. A status line always
reports which mode you are in ("Tracking hands…", "Hands not found — drag to
rotate", "Camera blocked — drag to rotate", "Tracker unavailable — drag to
rotate").

## Techniques

- **4D polytopes from first principles.** Tesseract = the 16 vertices
  (±1,±1,±1,±1) with edges between vertices differing in one coordinate; 24-cell
  = all permutations of (±1,±1,0,0) with edges at the minimum distance.
- **True 4D rotation.** Six independent plane rotations (XY, XZ, XW, YZ, YW, ZW)
  composed each frame.
- **Stereographic projection** 4D → 3D from the +w pole, then a perspective
  3D → 2D projection; the w-depth modulates edge thickness, glow and hue so the
  "near hyperspace" parts burn brighter.
- **Canvas 2D additive glow.** `globalCompositeOperation = "lighter"`, a
  twin-pass (soft wide halo + bright thin core) per edge, per-edge chromatic hue
  cycling, vertex sparks, and a translucent trailing fade for bloom.
- **Web Audio just intonation.** Six oscillators tuned to 1, 9/8, 5/4, 3/2, 5/3,
  15/8 over A2 (110 Hz). Each rotation plane's smoothed speed sets that partial's
  loudness and a motion-driven detune shimmer; a brightness-driven low-pass opens
  up with the spread, and a synthesized-impulse `ConvolverNode` adds the cosmic
  reverb tail.
- **Hand tracking with zero npm deps.** MediaPipe Tasks-Vision `HandLandmarker`
  is loaded at runtime via a dynamic `import(/* webpackIgnore: true */ …)` of the
  ESM bundle on jsDelivr, with the WASM fileset and `hand_landmarker.task` model
  pulled from CDN, in `VIDEO` running mode.

## Named reference

The **Pardesco 4D Polytope Viewer** (4d.pardesco.com) — an interactive
stereographic projection with true 4D rotation that reveals a polytope's hidden
symmetries — and the DMT **"hyperdimensional / more-real-than-real geometry"**
phenomenology (PSYCHEDELIC.md, Cluster 1). This piece turns that watch-only
viewer into a hand-played instrument.

## Honest self-assessment / limits

- **Hand tracking depends on a CDN and a webcam.** First load pulls several MB of
  WASM + model over the network; on a slow link the "Loading hand tracker…" state
  can linger. The pointer-drag fallback is always there, but it is a single
  control (XW/YW + wheel-zoom) rather than the full two-handed, six-plane
  expressiveness.
- **Handedness can flip.** Left/right assignment uses MediaPipe's label and a
  fallback ordering; in odd lighting or when hands cross it can briefly swap which
  hand drives which plane.
- **Only two of the six planes are independently hand-driven** (XW, YW), with ZW on
  spread and the rest on gentle auto-drift. A more ambitious mapping could expose
  all six, but that quickly becomes unplayable — the restraint is deliberate.
- **The 120-cell was out of scope.** The tesseract and 24-cell stay legible and
  cheap to draw on Canvas 2D; the 600/120-cell would bury the geometry in edges
  and tax the 2D pipeline.
- **Audio is a slowly evolving cluster, not a melody.** It is an ambient chordal
  instrument by design; it rewards motion but will not play tunes.
