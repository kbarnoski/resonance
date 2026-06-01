# 246 · Spectral Splat

**The question:** *What if your music were a soft volumetric cloud of light you could fly through?*

A spectrum visualiser that deposits your sound as a rolling field of soft, additive
**Gaussian splats** — anisotropic glowing blobs — and flies the camera forward through the
accumulating nebula of your own music.

## What it is

The freshest of three sibling explorations (243 spectral-cloud, 245 spectral-tunnel, 246
spectral-splat). Where the siblings orbit or tunnel, this one **flies forward through a
volumetric memory**: each analysis frame writes one slab of splats into a ring buffer parked
just in front of the camera, then the camera dollies into them so older frames recede into the
distance. The splats use a true soft Gaussian falloff, so the cloud reads as luminous fog, not
a hard point cloud.

## How to use

1. Open `/dream/246-spectral-splat`.
2. **Start — fly into the cloud** boots a built-in generative ambient pad + wandering plucks
   (A-minor pentatonic), so the piece is alive with zero input.
3. **Load demo audio** synthesizes a short looping pentatonic groove offline and plays it.
4. **Drop / load file** (or drag any audio file onto the canvas) decodes via `decodeAudioData`
   and loops it. Decode failures show a rose error and keep the pad alive.
5. **Use mic** requests the microphone (analyser-only, no monitor path, so no feedback). If
   denied or absent it shows a rose note and stays on the current source.
6. **Design notes** / **Read the design notes** opens an in-page drawer.

Corner HUD shows the active source, a rough **BPM**, and an **onset** indicator.

## The technique

- **Audio analyser.** One `AnalyserNode`, `fftSize 2048`. Three robust sources: file
  (drop/upload + offline-rendered demo), optional mic, and a generative pad/pluck fallback.
- **Volumetric splat render.** A single `THREE.Points` of `BINS × SLABS` splats, allocated
  **once**. A custom `ShaderMaterial` computes a soft `exp(-r*r)` radial Gaussian in the
  fragment shader with `AdditiveBlending` and `depthWrite/depthTest` off, and stretches the
  sprite horizontally (`aAniso`) so highs streak into oriented blobs. Per frame, only the
  typed-array attributes (color, size, aniso, the freshly-written slab's positions) are
  rewritten — no reallocation in the loop.
- **Ring buffer over Z.** A write head walks `0..SLABS`. Each frame the current slab is placed
  ~2 units ahead of the camera and the head advances; the camera moves into −Z, so the trail of
  past slabs streams away behind/ahead as a continuous tunnel of fog.
- **Reactive mapping.** Spectral **centroid** → global hue drift + cloud dispersion (loud
  frames bloom the radius open). Energy-**flux onset** → a coloured shockwave shell, a
  brightness bloom uniform, and a short forward **speed surge**. Onset intervals feed a rough
  BPM estimate.

## The cited reference — why splats, not points

Borrowed from **AudioGS — "Spectrogram-Based Audio Gaussian Splatting for Sound Field
Reconstruction"** (arXiv 2604.08967, April 2026), which encodes a sound field as a set of audio
Gaussians derived from spectrograms. We take the **aesthetic, not the math**: representing each
spectral atom as a soft Gaussian (rather than a hard dot) produces a continuous, overlapping
volumetric glow — the cloud has *body*. A point cloud renders as discrete specks; additive
Gaussians integrate into fog/nebula, which is the whole feeling of "flying through your music."

Visual lineage: Refik Anadol's *Machine Hallucinations* (latent data as volumetric pigment) and
Ryoji Ikeda's austere data aesthetics.

## Graceful degradation

- No WebGL → readable notice in the start panel; audio still works.
- Mic denied/absent → rose note, stays on current source.
- File decode error → rose message, generative pad keeps playing.
- No API routes, no new npm dependencies.

## Ideas to deepen

- Real `@react-three/postprocessing` `Bloom` pass (installed) instead of the shader bloom tint,
  selective on the brightest splats.
- True 3D-oriented anisotropic Gaussians (orient the stretch along the spectral gradient, not
  just screen-X) — closer to actual Gaussian-splat covariance.
- Per-splat velocity so onsets *blow* the local cloud outward and it settles back.
- Stereo field: pan L/R to X so the cloud has a left/right spatial identity.
- Persist a few seconds longer and let the user steer with pointer drag for a fly-cam.
