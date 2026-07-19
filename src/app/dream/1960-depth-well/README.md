# 1960 · Depth Well

**What if a room could remember where your body was — and every place you dwelled kept sounding a tuned tone you can walk back to?**

You step in front of a webcam. The piece estimates **monocular depth** — how far
each part of the frame is — and renders you as a live **3D point cloud** floating
in a dark blue-black volume. When you hold still in a spot (**dwell**), that
location **deposits a durable, glowing memory-node** in 3D space that keeps
sounding a just-intonation partial. Move away and it persists; move back through
it and it swells. Over a session you *author* a chord of pure ratios spread
through the room's depth. Your past positions durably shape the present sound —
this is a compositional-**memory** instrument, not a passive visualizer.

## The memory mechanic

1. **Depth → point cloud.** A small depth grid (52×38) is lifted into world space
   (`cloud.ts`): each cell becomes a point whose *z* is its estimated distance.
   The volume slowly auto-orbits so you read it as genuinely 3D.
2. **Present locus.** The near-region centroid of the depth field is the live
   **present** — the one warm **amber** accent, at its own world position, with
   its own soft tracking voice.
3. **Dwell → deposit.** `memory.ts` watches the locus. Hold it inside a small
   sphere for ~1.25 s and the room deposits a durable node there. Depth at birth
   picks the **just-intonation partial + register**; horizontal position sets the
   **stereo pan**.
4. **Return → swell.** Every frame, each node's proximity to the live locus is
   smoothed into a `swell` that drives both its glow and its gain — walk back
   through a memory and it blooms. Re-dwelling on an existing node re-sounds it
   instead of duplicating; a cap recycles the dimmest, oldest node so the chord
   stays legible.

## The chord

Pure **just intonation** over a 55 Hz root, spread across two octaves and
deliberately **non-pentatonic**: 1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2 (`audio.ts`).
Depth chooses the index. Warm triangle+sine voices, gentle lowpass, everything
glides (no clicks). Master gain ≤ 0.16 → a `tanh` soft-clip → a
`DynamicsCompressor` limiter → destination. Panning is a real `StereoPannerNode`
per node, so memories sit left↔right where you left them.

## Depth: the enabling tech

Live depth is **Depth-Anything-V2 (small)** (`onnx-community/depth-anything-v2-small`)
run in-browser via **Transformers.js / WebGPU**, loaded **at runtime from a CDN**
(`@huggingface/transformers@3.0.0`) with the `/* webpackIgnore: true */` dynamic
`import()` pattern proven elsewhere in this lab — nothing is added to
`package.json`. It falls back to the wasm backend if WebGPU is missing.

**The piece is fully alive without the model.** A mandatory **ghost self-demo**
(`ghost.ts`) — a soft Gaussian "wandering presence" that drifts through the depth
volume, pausing to dwell and depositing nodes on a gentle loop — drives the
*entire* pipeline (cloud → memory → spatial audio) from frame one, with no camera
and no model. Graceful ladder:

- **model + camera** → real monocular-depth point cloud of you;
- **camera, model too slow / absent** → a crude pseudo-depth proxy from webcam
  brightness + frame-difference presence, so live input still plays;
- **no camera / no WebGPU** → Canvas2D projection render, ghost keeps composing.

It never throws and never blanks.

## Wired subsystems (≥3)

camera capture · **depth-ML** (Depth-Anything-V2 on WebGPU) · a **spatial-memory
model** (dwell detection + durable resonant nodes) · a **WebGPU point-cloud
renderer** (Canvas2D fallback) · **spatial just-intonation audio** (per-node
panned voices + limiter). This clears the ambition floor via **≥3 wired
subsystems** and **named references** (below) — not via a novel input: the lab
already reads webcam monocular depth in `927-depth-room` and
`942-depth-harmonic-room`. Both are purely *reactive* (proximity → timbre;
depth → a Tonnetz harmony walk). **Depth Well's fresh contribution is
compositional MEMORY** — the room durably *keeps* where you dwelled and lets you
return to it, which neither predecessor does. It is best read as the depth-room
lineage's memory chapter.

## Lineage

- **Myron Krueger — *Videoplace*** (1970s–): the body itself as the interface to
  a responsive space.
- **Daniel Rozin — mechanical mirrors**: surfaces that reconfigure to reflect the
  viewer's presence.
- **Rafael Lozano-Hemmer** — presence/tracking installations that record and
  replay where people were in a room.
- **In-lab:** `927-depth-room` (depth → proximity, pitch frozen) and
  `942-depth-harmonic-room` (depth → Tonnetz voice-leading) — the reactive depth
  rooms this piece extends by adding durable memory.

Depth Well adds **durable, tuned memory**: the room does not merely mirror you —
it keeps *singing* where you have been, and lets you return to swell it.

## Files

- `page.tsx` — client component; orchestrates the loop, source ladder, controls.
- `depth.ts` — model loader (CDN), downsample, camera pseudo-depth, features.
- `ghost.ts` — the synthetic wandering-presence self-demo.
- `memory.ts` — dwell detection + durable memory-node model.
- `audio.ts` — spatial just-intonation memory engine (Web Audio, no deps).
- `cloud.ts` — projection + WebGPU point-cloud renderer + Canvas2D fallback.
- `readme-text.ts` — notes string for the in-page modal.
