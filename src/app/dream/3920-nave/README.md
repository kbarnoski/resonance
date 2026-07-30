# 3920 · Nave

> **The one question:** What if Resonance were a room with real depth — you lean
> your head and look *into* a deep hall of Karel's piano voices, and the sound
> moves to where your head is?

A head-tracking motion-parallax room ("fish-tank VR" in the browser). The webcam
tracks your head position; the on-screen 3D nave is rendered with an **off-axis
(asymmetric-frustum) projection** so that moving your head reveals real motion
parallax — the flat monitor becomes a window into a deep, receding hall. Spatial
audio pans to follow your head, so leaning toward a distant voice brings it
forward.

Built with **three.js** (real 3D geometry: a receding colonnade of columns and
arch lintels, a stone-violet aisle, dust motes for depth cues, and seven
luminous voice-nodes at increasing depth) and **pure Web Audio** (no network
audio).

## How the off-axis head-coupled projection works

A normal 3D app orbits a symmetric `PerspectiveCamera`. That is *not* what sells
"a window into depth." Instead we treat the monitor as a **fixed physical window**
and skew the view frustum to wherever your eye is — Robert Kooima's
*generalized perspective projection*, which is the same head-coupled technique
Johnny Lee popularised with the Wii Remote.

Concretely, per frame (`applyOffAxis` in `page.tsx`):

- The screen window lives on the `z = 0` plane; its half-width/half-height come
  from the canvas aspect ratio.
- The eye (head) sits at `(ex, ey, ez)` in front of the screen (`ez > 0`) and
  looks along `-Z` into the hall.
- We compute the asymmetric frustum extents at the near plane:
  - `l = (-halfW - ex) · near / d`, `r = (halfW - ex) · near / d`
  - `b = (-halfH - ey) · near / d`, `t = (halfH - ey) · near / d`
  - where `d = ez` (eye-to-screen distance).
- We set `camera.projectionMatrix.makePerspective(l, r, t, b, near, far)` by hand
  (we never call `updateProjectionMatrix`, which would overwrite it), then place
  the camera at the eye position with identity orientation. Because the screen
  axes are aligned with the world axes, the view matrix reduces to a translation
  to the eye — so the *only* thing changing is the skew of the frustum. That skew
  is what your visual system reads as real depth when your head moves.

Head position comes from **MediaPipe FaceLandmarker** (loaded from the jsDelivr
CDN as an ESM `import`, wasm from the matching CDN path): head X/Y from the
face-center bounding region, head Z (distance) from **inter-eye pixel distance**
(outer eye corners, landmarks 33 / 263 — bigger = closer). The raw target is
smoothed with a low-latency exponential filter (~120 ms) before it drives the
projection and audio.

## Audio spatialization

Pure Web Audio API, synthesised locally — no `/api/audio`, no network. Seven
sustained voices form an open, cathedral-ish chord (C3 · G3 · C4 · E4 · G4 · C5
· E5). Each voice is warm and bowed/piano-ish: an additive stack of partials
through a slowly-shimmering lowpass filter. Each voice feeds a **`PannerNode`
(HRTF panning model)** positioned at the *same* 3D coordinate as its luminous
node, then a parallel **ConvolverNode** (seeded, generated impulse) adds a
cathedral tail.

Every frame the **`AudioListener`** position/orientation is glued to the head, so
the entire mix follows your head: lean toward a light on the left and its voice
swings left and forward; lean in (smaller `z`) and the whole hall pulls closer.

## Stakes / agency — "a decision you make with your body"

This is deliberately **not** a passive, no-stakes ambient piece. Voices start
**veiled**: dim, low-passed, near-silent (a floor gain so the hall never dies).
A voice **wakes** only when you line your head up with it — its lateral offset
from your straight-ahead gaze line shrinks — *and you hold there*. An asymmetric
integrator makes waking a commitment (it rises while you're aligned, decays when
you look away). As a voice wakes it brightens, blooms, opens its filter, and
joins the chord. So you **compose the hall by where you lean and dwell**: a soft
proximity commitment, a decision you make with your body — not a fail-buzzer. The
readout shows how many voices are currently awake.

## Graceful degrade & headless self-demo

- **No camera / permission denied / FaceLandmarker fails to load:** an on-brand
  `text-destructive` notice appears and the piece falls back to **pointer-move
  parallax** (mouse X/Y drives the exact same off-axis projection and audio path)
  — still fully demoable and audible.
- **No input at all (headless):** on Start, if no real head is detected within
  ~1.5 s, a **seeded synthetic head** follows a smooth Lissajous orbit through the
  *exact same* projection + audio path, so the piece visibly and audibly animates
  with no camera or display.
- **WebGL unavailable:** a clear notice replaces the canvas.
- **Determinism:** all randomness is a seeded `mulberry32` PRNG (seed `0x3920`);
  time comes from `performance.now()`. No `Math.random`, `Date.now`, or
  `new Date()` anywhere. `AudioContext` is created only after the Start gesture
  (autoplay policy).

## Named references

- **Johnny Lee**, *"Head Tracking for Desktop VR Displays using the Wii Remote"*
  (2007) — the canonical off-axis-projection head-coupled-perspective technique.
- *"Parallax Engine: Head Controlled Motion Parallax Using Notebooks' RGB
  Camera"* (SVR 2021) — the RGB-camera, browser-feasible version of the same idea.
- **SIGGRAPH 2026**, *"Resonance: Meditative Neural Rhythms as Collective Spatial
  Experience"* — room-scale spatial installation framing that motivates this
  cycle's "a room with real depth" question.

## Next-cycle deepening

- **Swap synthesized voices for Karel's real Path piano** via `/api/audio/[id]`
  (READ only) — buffer the stems and route each through its `PannerNode` at the
  same node position, so you literally lean into the recorded performance.
- **Two-viewer shared hall:** two heads, two off-axis eyes (or stereo split), a
  shared chord that only fully resolves when both viewers commit to complementary
  voices — collective spatial composition.
- **Head-tilt as gaze:** derive a look direction from head roll/yaw and tilt the
  audio listener + frustum accordingly, so you can peer *around* a near column to
  a voice hidden behind it.
- **Persistent hall state:** remember which voices you woke, so returning re-lights
  your chord.
