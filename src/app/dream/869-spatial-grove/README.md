# 869 · Spatial Grove

## The one question

**What if you could physically WALK through a living grove of generative song-trees — your body's lateral position panning you across it and your DISTANCE to the camera walking you deeper in — each tree a spatialized, slowly-evolving voice you wander among, never the same twice?**

## How it works

A **fixed field of 16 "song-trees"** is placed at static world positions in a shallow arc/grove around an AudioListener at the origin. Each tree is a small generative voice:

- a warm **bell/marimba** pluck or a **sustained drone**,
- playing a slow, sparse motif on a soft mode (**Lydian** or **pentatonic**),
- routed through its own **`PannerNode` with `panningModel = "HRTF"`** at its fixed world position.

The trees never move. Only `audioCtx.listener.positionX/Z` move — via `setTargetAtTime` so panning glides instead of zippering — as your body walks. Walking near a tree audibly blooms that voice in your ears and visibly brightens its canopy.

### Input — MediaPipe Pose (whole body)
The front camera feeds MediaPipe `PoseLandmarker` (loaded from CDN at runtime). We read:
- **torso-centre x** → listener **X** (pan laterally across the grove), mirrored;
- **shoulder-width** as a **depth proxy** → listener **Z** (walk deeper / nearer).

Both are **EMA-smoothed** before driving the listener.

### Output — WebGPU compute (the main visual surface)
A WGSL `@compute` pass integrates a particle field (~42,000 points: 2,600 per tree) clustered into glowing **tree-canopies**. Each frame the compute shader swirls every particle around its home tree and pulls it toward that tree's live bloom/brightness. A WGSL render pass draws particles as **additive glow point-quads** in a dusk palette: **indigo → violet → warm-gold**. The nearest tree (by listener proximity) brightens and blooms.

### Long-form memory / evolution (stated explicitly)
Each tree drifts over **minutes, not seconds**. On a slow per-tree timer (~25–70 s) a tree may: **transpose** its motif by a scale step, **change rhythm density** (note spacing), or **swap timbre brightness** (filter cutoff + harmonic mix + canopy hue). So the grove heard at minute 5 differs meaningfully from minute 1, and (seeded per tree with randomized drift) it is never the same twice.

## Named references

- **Janet Cardiff & George Bures Miller, _The Forty Part Motet_ (2001)** — *inverted* here: there the choir is fixed and you walk among it; here the field of voices is fixed and **the listener walks**.
- **AudioMiXR** (arXiv 2502.02929, "Spatial Audio Object Manipulation with 6DoF") and **MoXaRt** (arXiv 2603.10465, object-guided spatial sound for XR) — recent (2026) spatial-audio-object framing.
- **Brian Eno** generative ambient — per-tree motifs drift slowly so the grove evolves over minutes.

## Ambition criteria hit

- **≥3 distinct subsystems → 4:** (1) MediaPipe Pose whole-body tracking, (2) HRTF spatial-audio field of fixed voices, (3) WGSL `@compute` + render particle canopies, (4) per-tree long-form generative evolution.
- **Borrows from a named reference:** Cardiff & Miller (inverted), AudioMiXR, MoXaRt, Eno.

## Degrade story (never a dead or silent screen)

- **No WebGPU** → a `text-rose-300` notice + a hand-written **WebGL2** particle grove on the *same* mapping; audio keeps playing. **Neither WebGPU nor WebGL2** → notice, audio still plays.
- **No camera / permission denied / MediaPipe load fails** → `text-rose-300` notice + an **auto-demo**: a synthetic listener walks a slow figure-8 through the grove on its own (voices bloom within ~1 s, zero hardware). **Pointer-drag** steering is offered as a manual fallback/override at any time.
- **iOS gesture gating:** the `AudioContext` is created/resumed and the camera + MediaPipe are initialized **inside the first Start-button tap**.
- **Full teardown on unmount:** cancels rAF, stops all oscillators, closes the AudioContext, stops camera tracks, closes the PoseLandmarker, and destroys GPU resources (`GPUDevice.destroy()` / `WEBGL_lose_context`).

## Files

- `page.tsx` — UI, gesture-gated start, sense+render loop, input resolution (pose / auto-demo / pointer), teardown.
- `audio.ts` — the spatial grove voice engine (fixed HRTF trees, generative motifs, long-form drift).
- `gpu.ts` — WGSL compute + render particle canopies, camera matrix, dusk palette.
- `webgl-fallback.ts` — WebGL2 grove on the same mapping.
- `pose.ts` — MediaPipe Pose CDN loader, walk-signal extraction, auto-demo figure-8.
