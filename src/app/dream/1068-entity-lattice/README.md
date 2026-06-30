# 1068 · Entity Lattice

`state: DMT hyperspace / entity-lattice · pole: intense`

## The one question

**What if your whole moving body were multiplied — by camera body-tracking — into
a luminous DMT-style hyperspace entity-lattice, where the "entities" are recursive
kaleidoscopic copies of yourself across more directions than there should be, and
the intensity of your motion drives an endless rising glissando toward
breakthrough?**

This is the DMT-breakthrough pole: a hyperspace lattice you inhabit with your body.
Explicitly NOT a calm cosmic drift, NOT a tunnel you fall through, NOT a centre-out
bloom. It is a crystalline lattice of copies of *you*, tiled into more directions
than space should allow, intensifying as you move.

## Input — full-body pose

MediaPipe Tasks-Vision `PoseLandmarker` (33 landmarks) is loaded from CDN at
runtime via an indirect `new Function` import, so the bundler never resolves the
remote URL and it never enters `package.json`. We sample 12 key joints (nose,
shoulders, elbows, wrists, hips, knees, mid-spine), normalise them to a centred
`[-1,1]` space, and derive three features:

- **motion** — mean per-joint displacement / dt, asymmetrically smoothed (rises
  fast, falls slow, so a burst lingers),
- **lift** — wrists above shoulders,
- **spread** — wrist separation.

No camera, denied permission, or MediaPipe load failure → a synthetic **demo
body** driven by slow offset sinusoids (arms sweeping, body breathing). The lattice
lives and the ascent climbs with zero hardware. The HUD badge shows the active
path: emerald `● body tracking` vs amber `● demo body (no camera)`.

## Output — GPU entity-lattice (three.js / WebGL)

~200,000 `THREE.Points` with a custom additive `ShaderMaterial`. The 12 joints go
to the GPU as `uniform vec3 uJoints[12]`. Each particle carries:

- `aJoint` — which joint it belongs to,
- `aSym` — a symmetry slot decoding to (radial fold index, z-mirror, recursive
  shell),
- `aRand` — a small jitter + breathing phase.

In the **vertex shader** the joint position is reflected/rotated into the lattice:

1. a **high-fold radial kaleidoscope** about the view axis — `6 → 12` fold rising
   with drive (the "more directions than there should be"),
2. a **mirror in z** for fore/aft entity-copies,
3. **recursive concentric shells**, each rotated, tiling copies outward into a
   crystal rather than a single ring.

Joints ease toward their targets on the CPU (drive-blended) so motion smears into
glittering trails. Colour ramps indigo → magenta → gold-white by
distance-from-core and speed; `THREE.AdditiveBlending`; deep indigo background with
a faint radial vignette (never flat black).

## Audio — the DMT-ascent (shared engines)

Composes the three shared psych engines (imported, not reimplemented):

- `_shared/psych/shepard` — endless **rising** Shepard–Risset glissando; drive
  scales ascent rate + brightness,
- `_shared/psych/droneBank` — just-intonation detuned drone; drive opens its
  lowpass + saturation,
- `_shared/psych/convolutionVoid` — vast cistern reverb; Shepard + drone route
  through it; wet blooms with drive.

A single `drive` 0..1 = `motion·0.6 + lift·0.3 + spread·0.25 + motion·lift·0.4`,
eased, feeds every engine *and* the lattice fold-density/brightness. A sudden drive
surge fires a brief inharmonic bell accent. Master through a `DynamicsCompressor`
limiter. Gesture-gated (Start tap); full teardown of audio + rAF + camera on
unmount.

## Safety

Intense by design — but the kaleidoscope spin and brightness swells stay well under
3 Hz. No epileptogenic full-frame flashing; intensity comes from fast motion,
brightness swells and saturation, not hard strobing.

## References

- **"Waves of Connection," Osaka Expo 2025** — three.js + WebGPU rendering ~1M
  particles in real time on a 98-inch 4K display with Kinect body tracking; the
  embodied-installation frontier (Safari 26 / Sept 2025 made WebGPU universal).
- **Graham St John, "The Breakthrough Experience: DMT Hyperspace and its Liminal
  Aesthetics"** (Anthropology of Consciousness, 2018) — accelerating geometric
  movement, ascending/intensifying sound, "more directions in space than there
  should be," entity-contact.
- **Heinrich Klüver** — form constants. **Roger Shepard / Jean-Claude Risset** —
  the endless glissando.

## Next-cycle deepening

- Per-joint **velocity colouring** (true speed, not a jitter proxy).
- **Depth-aware z** from the pose so leaning in/out scales the lattice.
- A **WebGPU / TSL compute** path toward the Osaka million-particle scale.
- Entity **gaze**: nearest copies orient toward you at peak drive.
- A **breakthrough threshold** that snaps the lattice into a held hyper-symmetric
  mandala.
- **Multi-body lattices** when two people share the frame.
