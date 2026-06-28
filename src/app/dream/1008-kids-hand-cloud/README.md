# 1008 — Hand Cloud

> What if a 4-year-old could conduct a glowing, singing cloud of light with
> their bare hands in the air — no touching the screen?

Wave your hands in front of the webcam and a dense field of glowing particles
swirls toward and around them, singing a warm, no-wrong-notes chord-cloud. Open
your hand and the cloud blooms and brightens; pinch (thumb tip to index tip) and
the particles gather into a bright star that chimes. It is immediate, delightful,
and impossible to play "wrong."

## How it works

The whole loop is client-side. One `requestAnimationFrame` loop per frame:

1. **See the hands.** MediaPipe's `HandLandmarker` reads the webcam and returns
   up to 2 hands × 21 3D landmarks. We mirror x (selfie view) and derive, per
   hand: a handful of attractor points (wrist + 5 fingertips), an **openness**
   value (fingertip spread normalized by palm width), and a **pinch** value
   (thumb-tip ↔ index-tip distance / palm width).
2. **Force the field.** Each hand point becomes an attractor `{x, y, strength,
   swirl}`. Open palms raise strength/swirl so the cloud blooms; a pinch
   collapses the hand to a strong gather point. Every particle is advected by
   **curl-noise** plus pull + tangential swirl toward its **nearest** attractor.
3. **Sing it.** Cloud features map to sound: centroid height → pitch register,
   openness + energy → brightness (filter) and how many voices are audible,
   pinch edges → a bright bell. Every voice snaps to a **C-major pentatonic**
   so there are no wrong notes.

## The two render/compute paths

The piece must render and sing with no WebGPU and no camera, so there are two
honest paths that share the same forces and the same look.

- **`gpu.ts` — WebGPU compute (the ambition).** `requestAdapter` /
  `requestDevice`, a real `@compute @workgroup_size(64)` WGSL kernel advecting
  **120k** particles in a storage buffer in-place (curl-noise + nearest-attractor
  pull/swirl), driven by a uniform buffer of attractors. A second render pipeline
  draws each particle as a small **additive** glowing quad (instanced, 6 verts ×
  N) on a dark clear. `dispatchWorkgroups(ceil(N/64))` then a render pass each
  frame.
- **`cpu.ts` — Canvas2D fallback.** When `navigator.gpu` is absent (or device
  creation fails), an identical-in-spirit integrator runs **~3.2k** particles on
  the CPU with the same curl-noise + attraction/swirl forces, and draws them with
  `globalCompositeOperation = "lighter"` over a slowly-fading dark fill for the
  same luminous, trailing aurora cloud.

`page.tsx` tries WebGPU first and silently drops to Canvas2D; a status chip shows
which one is live.

## MediaPipe approach

Loaded entirely from a CDN at runtime — **no package.json changes**. `hands.ts`
does a dynamic `import()` of
`@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs`, resolves the wasm fileset
and the `hand_landmarker.task` float16 model from Google's storage CDN, and runs
`HandLandmarker` in `VIDEO` mode with `numHands: 2`.

**Graceful degradation** (mandatory):

- Camera denied, or CDN/model load fails → a clear `text-rose-300` notice, and
  the loop switches to a **ghost-hand auto-demo**: 1–2 invisible hands drift in
  slow Lissajous paths (with breathing openness and occasional pinches) ≈2s after
  Start, so the cloud keeps swirling and singing.
- No WebGPU → Canvas2D path above.
- The ghost demo also kicks in whenever the camera simply sees no hands, so the
  frame is never dead.

## Audio safety

`audio.ts` master chain: `masterGain (≤ 0.22) → lowpass (≤ 6500 Hz) →
DynamicsCompressor(threshold −10, ratio 20)`. A soft always-on drone (root C2 +
fifth G2) underpins a small pool of triangle-wave pentatonic voices. All gains
are ramped (`setTargetAtTime` / exponential ramps) so there are no clicks or
sudden loud transients; the pinch bell has a soft attack and a gentle decay.

## Teardown

On unmount / stop: cancel the rAF, `dispose()` the GPU buffers + device + context,
drop the Canvas2D field, stop and release the camera `MediaStream` tracks, close
the `HandLandmarker`, and fade then close the AudioContext.

## References

- **MediaPipe Hands** (Google) — on-device, real-time 21-landmark hand tracking.
  <https://developers.google.com/mediapipe/solutions/vision/hand_landmarker>
- **Robert Bridson, "Curl-Noise for Procedural Fluid Flow"** (SIGGRAPH 2007) —
  the divergence-free curl-of-a-potential flow used to advect the cloud.
- **Memo Akten** — body/particle flow-field interactive work; spiritual reference
  for hands-as-attractors over a noise field.

## Honest warts

- The CPU "curl noise" is a cheap analytic potential, not real Perlin/simplex
  curl — it looks good but isn't physically the same field as a tiled noise; the
  GPU kernel uses the same cheap potential for parity rather than a richer one.
- Openness/pinch thresholds are tuned by feel and are distance-sensitive; very
  close or very far hands can mis-read. Pinch is a simple distance threshold, not
  a trained gesture.
- WebGPU particle count (120k) is fixed; on weak GPUs it may dip below 60fps. No
  adaptive count.
- MediaPipe is loaded from a public CDN at runtime, so first Start has a load
  delay and depends on network/CDN availability (hence the auto-demo fallback).
- Energy is a proxy (sum of attractor swirl), not true measured particle kinetic
  energy read back from the field, so the audio reacts to hand state more than to
  the actual cloud.
```
