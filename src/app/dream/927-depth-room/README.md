# 927 · Depth Room

**Route:** `/dream/927-depth-room`

> *What if standing-distance to the screen — read as a live per-pixel DEPTH field by an ML model running in the browser — were the instrument, so music lives in proximity and motion, not in pitch?*

The lab's **first depth-camera piece**, achieved in pure software — no Kinect, no
RealSense. A monocular depth model turns a single webcam image into a per-pixel
distance field in your browser, and **distance becomes the instrument**.

## What it is

You enter a softly lit "room." Your webcam frame is run through real-time
monocular depth estimation, producing a depth map that says how far every pixel
is from the camera. Lean in and the room blooms warm and bright and the music
swells into a close, granular foreground; pull back and it recedes into cool dark
and thins to a low soft drone bed. Move toward and away and shimmer rises. You are
sculpted in light, and sound, by distance alone.

## The depth → sound mapping

The depth map is averaged into a **16×12 grid** each frame. From it we derive:

- **near-zone energy** — how much of the frame is CLOSE (you leaning in)
- **histogram spread** — how stratified the room's depth is
- **centroid x/y** — the location of your nearest region
- **motion-in-depth** — frame-to-frame depth change

These drive a bank of **granular / additive voices** spatialized with WebAudio
`PannerNode` (HRTF):

| Feature | Effect |
|---|---|
| NEAR energy ↑ | bright foreground pentatonic-shimmer voices **bloom**; lowpass opens |
| FAR (near ↓) | thins to a low soft **drone bed** (root + octave + fifth) |
| centroid-x | pans active voices **L ↔ R** through the HRTF panner |
| spread | opens more of the shimmer stack |
| motion-in-depth | **grain density + tremolo shimmer** rises |

**Pitch is held deliberately dumb.** Everything is locked to ONE fixed mode — a
drone root (A1), its fifth (E2), and an A-minor pentatonic shimmer stack — so no
two voices can ever clash. The composition lives entirely in **PROXIMITY, SPACE,
and MOTION**, never in intervals. The chain is kids-safe-gentle: master gain ≤ 0.3,
a lowpass, and a compressor.

## The visual (WebGL2 fragment shader — not three.js)

A fullscreen WebGL2 quad runs a fragment shader (`scene.ts`). The depth grid is
uploaded as an `R32F` texture and sampled bilinearly. Near pixels glow warm
amber/rose and bloom around your nearest region; far pixels recede into cool deep
indigo. Quiet iso-depth contour bands and a soft drifting volumetric haze react to
the nearest-zone energy. The whole image is mirrored so it reads like a room you
stand in.

## Named reference

- **Depth Anything V2** — Yang, Kang, Huang, Zhao, Xu, Feng, Zhao.
  *Depth Anything V2*, **NeurIPS 2024**. Repo: `DepthAnything/Depth-Anything-V2`.
- Run **in-browser on WebGPU via Transformers.js**, following the Hugging Face
  `webgpu-realtime-depth-estimation` demo. The model
  (`onnx-community/depth-anything-v2-small`) and the Transformers.js runtime are
  loaded **at runtime from a CDN** (`@huggingface/transformers@3.0.0` via
  jsDelivr) — **no npm dependency is added** to the project.

## Fallbacks (it always sounds and shows)

1. **No camera / permission denied** → animated **synthetic procedural depth
   field** (a slow drifting, breathing radial blob) drives the same audio + shader.
2. **No WebGPU / model load fails** → same synthetic depth field.
3. **No WebGL2** → minimal **Canvas2D** view of the depth grid (warm/cool blocks).
4. A **hands-off auto-start** kicks a silent synthetic visual preview within ~0.45s
   so an idle glance is alive. Audio only begins after the **"Enter the room"** tap
   (iOS/Chrome gesture gate for `AudioContext`).

The camera is processed entirely on-device, **live — never recorded or uploaded**;
this is stated in the UI in emerald.

## Cleanup

On unmount: camera tracks stopped, `AudioContext` faded and closed,
`cancelAnimationFrame`, and all GL objects (program/shaders/texture/buffer/VAO)
disposed.

## Ambition-floor criteria hit

- **INPUT = camera (webcam)** ✓
- **OUTPUT = WebGL2 fragment shader** (not three.js, not Canvas2D primary, not SVG) ✓
- **TECHNIQUE = monocular depth estimation + depth→spatial/granular audio** ✓
- **VIBE = immersive contemplative room** ✓
- Web Audio + WebGL2, no added deps, no API route, graceful degradation, gesture-gated audio,
  full unmount cleanup, typography rules honored.

## Files

- `page.tsx` — client component: UI, enter-gate, camera + model bring-up, render/audio loop, teardown.
- `depth.ts` — grid downsample, synthetic z-field, depth → musical feature extraction.
- `audio.ts` — `DepthInstrument`: HRTF-spatialized drone + pentatonic shimmer + grain bed.
- `scene.ts` — WebGL2 depth-room fragment shader + Canvas2D fallback.
- `README.md` — this file.
