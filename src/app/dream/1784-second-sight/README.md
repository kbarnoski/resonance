# 1784 · Second Sight

**The Hallucination Machine — the engineered middle path.** A real, lightweight
neural net actually *sees* the world, and that machine perception drives where a
GPU hallucination grows. As the "dose" climbs, the predictive-processing
*reducing valve* opens: the brain's strong generative priors progressively
over-write the veridical camera feed until reality dissolves into eyes, faces and
kaleidoscopic paisley form-constants. Sight and sound share **one** dose
parameter and **one** salience field.

## What it is

The one question this prototype answers: *what if a real neural net actually saw
the world — segmented it into salience / faces / edges — and that machine
perception then decided where the hallucinated creatures grow, so the bloom
follows real semantic salience instead of raw contrast?*

## How to use

1. Press **Open the valve** (starts audio + visuals on a deterministic self-demo
   scene — a drifting proto-face and warm blobs, so it runs with no camera).
2. Optionally press **Start camera** to point the machine at the live world
   (front camera, mirrored). Denied or unavailable → it stays on the self-demo
   scene.
3. Watch the **dose** climb over ~55 s. Eyes and paisley bloom first where the
   seer found the most salient structure (faces, contours, warm skin).
4. **Surface** resets the dose to replay the bloom. **Mute** / **Close the
   valve** as needed.

## Technique

- **Input:** live front camera via `getUserMedia` (or the procedural scene).
- **The seer (real ML):** TensorFlow.js on its WebGL backend (dynamically
  imported inside `useEffect`, never at module top level). Each frame is
  down-sampled to 128 px and passed through a small **fixed-seed convolutional
  stack** (seeded 3×3 filters + ReLU + two max-pool levels) whose feature energy
  is fused with three classic early-vision saliency channels: **center-surround
  luminance contrast**, **oriented Sobel edges**, and a **warm/skin chroma**
  proxy. The result is a coarse 64×64 RGBA salience map
  (R = salience, G = edges, B = warm, A = feature energy), read back and uploaded
  as a texture.
- **The hallucination (GPU):** a three.js full-screen-quad pipeline with two
  fragment passes. A **ping-pong feedback growth** pass advects + decays the
  previous state (decay < 1) and adds motif emission — iridescent eyes and
  log-polar paisley form-constants — **gated by the seer's salience/edge map**,
  so structure grows over seconds where the machine looked. A **display** pass
  composites the fading veridical feed against the grown hallucination (the
  reducing valve: salient regions over-write reality first), with chromatic
  aberration, a cheap bloom, tone-mapping and a slow luminance drift.
- **Audio:** a Web Audio bed sharing the dose and salience. Calm near-sine
  room-tone at dose 0 slides into a detuned inharmonic shimmer at breakthrough;
  salience density opens a brightness filter; each region that "wakes up" (a
  salience cell crossing threshold) strikes a short iridescent inharmonic tone.
- **Determinism:** an integer frame counter drives dose, audio and the
  self-demo scene; a fixed-seed mulberry32 fills the one noise buffer. No
  `Math.random` / `Date.now` / `performance.now` in the render or audio path
  (`ctx.currentTime` is used only for Web-Audio scheduling).

## Does the ML seer actually work?

**Yes — it really runs.** The seer is a genuine tfjs conv pass on the GPU: it
looks at each frame and computes real image features. The HUD reports
`seer: tfjs conv net · live` when it is active. Honesty about its limits: the
conv stack is **fixed-seed and untrained** (no pretrained face/body segmentation
model was available to depend on, and the brief forbids adding one), so its
"salience" is bottom-up early-vision saliency (contrast + edges + warm chroma)
plus untrained-net feature selectivity — *real machine perception of where
structure is*, not a trained semantic segmenter. If tfjs fails to initialise, is
too slow, or throws, the pipeline transparently falls back to a **shader-only
luminance-gradient salience** driving the same growth pass, and the HUD shows
`seer: shader salience · fallback`. The piece never dead-screens.

## Safety (photosensitive epilepsy)

No alpha strobe and no full-screen flash. The feedback field always decays
(decay < 1), brightness is tone-mapped and clamped, and the only pulsing is a
slow luminance drift at ≤ 0.05 Hz (a warp/zoom feel, not a brightness flash).
The dose ramp is slow (~55 s). `prefers-reduced-motion` softens the warp,
shortens the feedback trails and reduces the drift.

## Honest limitations

- The seer is untrained (see above): motifs follow bottom-up salience, not true
  face/body semantics.
- tfjs uses its own WebGL context separate from the three.js renderer; on
  low-end GPUs the readback throttle (every ~5 frames) is what keeps it smooth.
- The self-demo scene is a stylised proxy, not a real environment — it exists so
  the machine has believable structure to find without a camera.
- The camera frame is fitted into a square source buffer, so live video is
  slightly stretched.

## Named reference

- Suzuki, Roseboom, Schwartzman & Seth, *A Deep-Dream Virtual Reality Platform
  for Studying Altered Perceptual Phenomenology* (the "Hallucination Machine"),
  **Scientific Reports** 2017.
- *Beyond the reducing valve: towards a computational neurophenomenology of
  altered states via deep neural networks*, **Frontiers in Psychology** 2026.
- Predictive-processing / REBUS reducing-valve model (Carhart-Harris & Friston);
  Huxley's "reducing valve".
