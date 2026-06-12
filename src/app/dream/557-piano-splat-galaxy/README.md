# Piano Splat Galaxy 🌌

> **What if every note Karel plays BIRTHS a bloom of glowing Gaussian splats —
> so his real piano performance accretes into a living galaxy/nebula of light
> you orbit, where transients are bursts, sustained notes are slow drifting
> clouds, and pitch paints the color?**

This is the lab's first **Gaussian-splatting** renderer, and approach **#557**
of three parallel takes — the *onset-driven generative galaxy*. Each detected
note fires a soft expanding shell of splats; over a whole track the cloud
accretes into a swirling galaxy whose arms trace the musical phrasing.

## The three subsystems

1. **Audio: fetch + FFT + onset / pitch detection** (`audio.ts`)
   On *Begin* we create an `AudioContext` + `AnalyserNode` (fftSize 2048) and try
   to fetch Karel's real *Welcome Home* piano from
   `/api/audio/549fc519-…` (handling both a JSON `{ url }` redirect and raw
   audio bytes), `decodeAudioData` → looping `AudioBufferSourceNode`. If that
   fetch/decode fails or times out (~4 s), we synthesize a gentle evolving
   solo-piano-like sequence (warm partial stacks, soft hammer envelopes,
   overlapping C-major / lydian arpeggios with clear onsets) so the piece
   **always** makes sound offline. The master chain ends in a
   `DynamicsCompressor` limiter. Per frame we compute **spectral flux** (sum of
   positive bin-to-bin increases) against an adaptive EMA threshold → **onset**;
   the spectral **peak bin** → dominant pitch → **hue**; **energy** → loudness;
   **spectral centroid** → brightness.

2. **Generative bloom particle system** (`splat.ts`, CPU pool)
   An onset spawns ~80–300 splats from a point on a slowly-growing ring (so the
   galaxy grows *arms*, not a blob), with outward shell velocities. Loudness →
   splat count + size; brightness → tight dense core vs diffuse cloud. A
   ~13 k-splat pool integrates on the CPU each frame (`pos += vel·dt`, drag,
   cheap procedural curl-noise turbulence + differential galactic shear) and
   recycles oldest splats. Splats fade in fast and out slow; sustained energy
   adds slow nebula haze.

3. **WebGL2 additive Gaussian-splat rasterizer + orbit cam** (`splat.ts`, GPU)
   Raw `webgl2` (no three.js, no WebGPU, no Canvas2D). One unit quad drawn with
   `drawArraysInstanced`; per-instance attributes (world pos, color, size,
   alpha) uploaded via `bufferSubData`. The vertex shader **billboards** each
   quad to face the camera using the view-matrix basis; the fragment shader
   applies a radial Gaussian `alpha = exp(-4·dot(uv,uv))`. **Additive blending**
   (`SRC_ALPHA, ONE`) with **depth test off** → order-independent, no depth sort
   needed → robust and glowing. Camera is hand-built mat4 perspective + lookAt
   with a slow auto-rotate.

## Controls

- **Begin** — start audio + real onset detection (galaxy is already alive and
  turning before you press it, fed by synthetic blooms).
- **Drag** — orbit the camera.
- **Scroll / pinch** — zoom.

## References

- Kerbl, Kopanas, Leimkühler, Drettakis — *"3D Gaussian Splatting for Real-Time
  Radiance Field Rendering,"* SIGGRAPH 2023 (the splat-as-anisotropic-Gaussian
  idea; here simplified to isotropic camera-facing billboards).
- The 2026 wave of in-browser Gaussian-splatting viewers that put radiance-field
  rendering on commodity WebGL2/WebGPU.
- Refik Anadol's volumetric data sculptures (*Machine Hallucinations*, *Unsupervised*)
  — the "data/sound as a living cloud of glowing particles" visual language.

## Unverified surface (honest notes)

- Built without an audio output device or GPU in the authoring environment:
  **the real-piano fetch path, decode, FFT onset firing, and the WebGL2 draw
  have not been observed live.** Both the piano and synth-fallback paths are
  wired, and the fallback is designed to always produce sound + blooms.
- Onset detection thresholds (flux EMA + 1.5σ, 4-frame cooldown) and the
  loudness/centroid scalings are tuned by ear-estimate, not against the real
  recording; very dense passages may over- or under-fire.
- Splat count (~13 k) and per-frame CPU integration target 60 fps on a laptop
  GPU; weaker integrated GPUs may dip.
- The `Read the design notes` link points at `./README.md`, which 404s as a
  route — a known cosmetic pattern in the lab.
