# 7320 · fishtank

**The one question:** *What if the screen became a window into a small resonant
room that you look around by physically moving your head — and both the 3D view
AND the sound field turn with you?*

This is **fish-tank VR** / off-axis head-coupled parallax (Colin Ware et al.,
*"Fish Tank Virtual Reality"*, CHI 1993; Johnny Chung Lee's Wii-remote head
tracking, 2007), driven by the **front camera with no machine-learning
library**, rendered with **three.js**, and coupled to **head-tracked spatial
audio**. It is deliberately non-transcendent: a believable, calm architectural
room seen through the glass, not a psychedelic mandala.

---

## The head tracker (no ML, no dependencies)

1. `getUserMedia({ video: { facingMode: "user" } })` feeds a hidden `<video>`.
2. Every 2nd frame the video is drawn **downscaled to 64×48** into an offscreen
   canvas and read back with `getImageData`.
3. Each pixel gets a cheap **skin-likelihood test** (an RGB rule of thumb:
   `r>95 && g>40 && b>20 && r>g && r>b && (max−min)>15 && |r−g|>12`). The
   **skin-weighted centroid** of the qualifying pixels is the head position
   `(cx, cy)` in `[0,1]`; the **pixel coverage** (fraction of skin pixels)
   stands in for depth — a nearer face fills more of the frame.
4. `cx` is mirrored so it feels like a mirror; everything is smoothed with
   exponential smoothing (position α≈0.28, coverage α≈0.16) to kill jitter.
5. `(headX, headY, coverage)` map to a virtual **eye** in front of a fixed
   virtual window (the screen plane): `x,y` scale into the eye envelope, and
   coverage maps through `smoothstep(0.03, 0.30)` to an eye distance between
   `z≈1.7` (leaning in) and `z≈3.15` (leaning back).

No landmarks, no neural net, no WASM — a few hundred integer comparisons per
frame. It is coarse (see limitations) but robust and instant.

## The off-axis projection (generalized perspective)

The virtual window is the world `z=0` plane, centred at the origin, its
half-width fixed and its half-height following the canvas aspect so the world
window keeps the screen's proportions. The room lives at `z<0`.

Because the window basis is axis-aligned (`vr=+x`, `vu=+y`, `vn=+z`), the view
transform is a **pure translation by −eye**, and only the **asymmetric frustum**
changes as the eye moves — this is **Robert Kooima's "Generalized Perspective
Projection" (2008/2009)** formulation, specialised to a screen-aligned window.
Each frame, with near plane `n` and eye distance `d = eye.z`:

```
l = (−winHalfW − eye.x) · n / d      r = ( winHalfW − eye.x) · n / d
b = (−winHalfH − eye.y) · n / d      t = ( winHalfH − eye.y) · n / d
camera.projectionMatrix.makePerspective(l, r, t, b, n, far)
camera.position = eye                 // view = translation only
```

The four window corners stay pinned to the physical screen while the eye moves,
so objects near the glass shift strongly and deep objects reveal their sides —
exactly the illusion Ware named in 1993. Strong floor/ceiling grids, tunnel ribs
and depth fog give the parallax something concrete to read against.

## Head-tracked spatial audio

The room hums with five sustained voices at fixed world positions, tuned to a
**D-dorian just-intonation** chord (D2, A2, F3, A3, E4 from ratios 1, 3/2, 6/5,
… on a D fundamental). Each voice is a pair of gently detuned oscillators with a
slow (~0.05–0.10 Hz) tremolo LFO, routed through a **`PannerNode`** (HRTF,
inverse distance model) at its body's position. An **`AudioListener` pinned to
the tracked eye** turns the entire sound field: lean left and the left-of-room
voice swings to the front and grows; the distance model doubles as a depth cue.
Soft **bell pings** (JI degrees an octave up, deterministically chosen via
`mulberry32`, scheduled off the audio clock) sparkle over the drone. Everything
passes through a `DynamicsCompressor` limiter into a master gain with a **0.25
ceiling**, fading in over ~1.6 s. Audio starts only after the *Use my camera*
gesture (autoplay policy — the UI says so). Each visible body pulses with its
own voice's tremolo level plus a decaying spike when it is pinged.

## Fallbacks & alive-on-load

- A **seeded `mulberry32(0x7320)` auto-orbit** flies the eye from first paint —
  parallax and the visual demo run with **zero permissions**, silent.
- **Camera denied / absent** → an on-brand `text-destructive` notice, and the
  eye is steered by **pointer** (desktop) or **`deviceorientation` tilt**
  (mobile), with the auto-orbit continuing underneath whenever a live source
  goes idle (>2.5 s). iOS 13+ `DeviceOrientationEvent.requestPermission()` is
  wired behind the button.
- **No WebGL** → an on-brand notice, never a blank page.
- `prefers-reduced-motion: reduce` slows the orbit, the eye lerp, and the ping
  cadence. No luminance change is faster than a slow eased drift (< 3 Hz).
- Full teardown on unmount: rAF cancelled, camera tracks stopped, all listeners
  removed, audio nodes disconnected and `AudioContext` closed, three.js
  geometries/materials disposed, `renderer.dispose()` + `forceContextLoss()`.

**Determinism:** no nondeterministic RNG and no wall-clock constructors
anywhere — all randomness is `mulberry32(0x7320)`, and all time comes from
`performance.now()`, the audio clock, or the rAF timestamp.

## Honest limitations

1. **The tracker is a skin-tone blob, not a face.** Bare arms, a wooden wall, or
   warm lighting bias the centroid; strong backlight or very dark/pale skin
   under some cameras can starve it (it holds the last good estimate below the
   24-pixel threshold). Coverage-as-depth is monotonic but not metric, so the
   z-parallax is expressive rather than calibrated.
2. **One eye, one listener, no true head model.** We track a single point, so
   there's no inter-ocular stereo and no roll; the HRTF panning is a good
   azimuth/distance cue but not a real binaural room, and the projection assumes
   your physical eye is roughly centred on the screen.

## Next-cycle deepening

Swap the single PannerNode-per-voice for a **head-tracked binaural HRTF room**
with early reflections and a measured personal HRTF, so the room's walls are
*heard* (à la the VR-PTOLEMAIC head-tracked binaural rendering work, arXiv
2508.00501, Aug 2026) — pair it with a lightweight, still-no-ML ellipse/optical-
flow face refinement to recover head roll and give the projection a true
two-eye stereo window.
