# 323 · Latent Condensation

A **WebGPU compute-shader** particle piece driven by Karel's own recording. (The
lab has used WebGPU compute before — e.g. `16-particle-life-gpu`,
`130-tsl-particle-compute`, `55-webgpu-audio-fx` — so the novelty here is not the
technique but the *application*: a chaos↔form condensation whose blend is
conditioned, phrase by phrase, by the live spectrum of his real piano.)

## The one question

> What if Karel's own *Welcome Home* piano recording could pull a cloud of GPU
> particles out of pure turbulent chaos — particles condensing into a coherent
> flowing **form** on each musical phrase, then dissolving back into noise in the
> rests — the whole simulation living on the GPU and conditioned by the live
> spectrum of his real piano?

## What it is

~120,000 particles whose positions and velocities live entirely in a GPU storage
buffer. Every frame a **WGSL compute shader** integrates them through a
curl-noise flow field (turbulent chaos) blended against an attraction term that
pulls each particle toward a slowly morphing target shape. A second WGSL **render
pipeline** draws them as additive glowing billboards on near-black — a luminous,
Anadol-like latent point cloud.

The blend between chaos and order is the single `condensation` value produced by
the audio analysis: `0` = pure flow, `1` = fully condensed onto the form.

## How to use it

1. Open `/dream/323-latent-condensation`.
2. Press **Play Karel's piano**. (Audio + WebGPU both start on this gesture, per
   the autoplay rule.)
3. Watch the cloud. As a phrase swells, the particles condense onto the target
   shape; in the rests they dissolve back into turbulent chaos. The HUD shows the
   live phrase state and condensation percentage.

The source badge tells you what you're hearing:

- **emerald** `♪ Welcome Home — Karel's recording` — the real track loaded from
  `/api/featured` → `/api/audio/<id>`.
- **amber** `synth fallback` — the API was unreachable or unauthorized, so a
  synthesized A-natural-minor piano bed (detuned voices + Karplus-Strong plucks,
  rendered offline) plays instead. Long chord changes give the phrase state
  machine clear rises/holds/decays.

## The technique

- **GPU compute** (`gpu.ts`): raw WebGPU, no three.js, no TSL. A compute pass
  (`@workgroup_size(256)`) advects every particle; a render pass draws 6-vertex
  billboards instanced per particle with additive blending.
- **Flow field**: curl of value-noise → divergence-free, smoke-like turbulence.
  Low audio bands widen the flow cells and overall amplitude scales speed.
- **Target form**: a procedural attractor that morphs sphere → torus → lissajous
  ribbon over time (each particle maps deterministically from its seed to a
  surface point). No text, just shape.
- **Audio → sim coupling** (`analysis.ts`): six perceptual FFT bands + an RMS
  envelope drive a phrase state machine (`chaos → condense → form → release`).
  Low → turbulence/scale; high → sparkle/brightness; RMS rise/decay → condense or
  release. Output is the `condensation` value the GPU reads each frame.
- **Audio source** (`audio.ts`): tries Karel's real recording, decodes via
  `AudioContext.decodeAudioData`, plays through an `AudioBufferSourceNode` tapped
  by an `AnalyserNode`. Handles both JSON `{url}` and raw arrayBuffer responses.

## References

- **nibi** by monoton-music — a 2026 WebGPU/TSL compute-shader particle
  music-video engine where particles form readable shapes from an authored camera
  angle then dissolve into flow patterns.
  https://github.com/monoton-music/nibi
- **Refik Anadol** — latent-flow point-cloud aesthetic (luminous data clouds
  condensing and dissolving).

## Known risks

- **WebGPU availability**: older Safari / Firefox without WebGPU show a readable
  rose notice and a DOM level-meter that still pulses to the audio — the screen is
  never blank and nothing throws. Tested-path is Chrome/Edge ≥ 113.
- **Real audio auth**: `/api/audio/<id>` requires an authenticated session for
  the recording owner. Unauthenticated viewers will transparently fall back to the
  synth bed (amber badge) — by design, so the piece always has sound.
- **Particle count**: 120k is comfortable on most discrete/integrated GPUs; on
  very weak hardware it may dip below 60fps. Lower `PARTICLE_COUNT` in `gpu.ts`.
- **WGSL value noise** is cheap-but-grainy; it reads well as a luminous cloud but
  is not a high-quality simplex field.

## Next-cycle deepening

- **Depth sorting / soft depth fade** for true volumetric occlusion instead of
  pure additive blend.
- **Onset-triggered bursts**: detect note onsets (spectral flux) and fire local
  shockwaves into the velocity buffer so individual piano notes are visible.
- **Authored camera + readable target**: like nibi, condense onto a shape that
  reads cleanly from a fixed angle (a face, a word, an album cover silhouette).
- **Multi-buffer history / trails** for motion-blur ribbons.
- **MediaElement mic toggle**: a cheap "use my mic instead" path to drive the sim
  live (currently audio-file only).
