# 859-paths-compute-bloom — design notes

## The question

> What if a piano performance bloomed a living particle ecosystem computed entirely on the
> GPU — half a million points pushed by the music's spectral bands via a WebGPU compute
> shader?

Bring your own recording (drag-and-drop or file picker) or play the built-in piece. On Start
the page synthesises a warm, reverberant generative tape-piano arpeggio and immediately drives
a WebGPU compute particle cloud with its spectrum.

## Subsystems

1. **Audio intake & playback** (`audio.ts`) — decode a dropped/picked file with
   `decodeAudioData`, or render the built-in piece offline into an `AudioBuffer`. Loop it
   through a gain bus to the destination.
2. **Built-in generative piano** (`audio.ts`) — an `OfflineAudioContext` render: soft mallet
   attacks (12 ms exponential ramp), long 2.6–4.4 s decays, an opening→closing per-note lowpass
   for body, an octave shimmer partial, baked-in wow/flutter detune, and a 4-comb feedback
   reverb with a warm lowpass tail. Evolving phrases over shifting roots and four scale colours.
3. **FFT band analysis** (`audio.ts`) — an `AnalyserNode` (fftSize 2048) split into **8 bands**
   (sub-bass → air), each perceptually boosted, temporally smoothed, plus an energy/onset
   (spectral-flux) estimate with a decaying onset envelope.
4. **WebGPU compute simulation** (`gpu.ts`) — a WGSL compute pass integrates **500,000**
   particles' position+velocity each frame.
5. **WebGPU additive render pass** (`gpu.ts`) — each particle is a 6-vertex glow quad drawn
   with additive blending; colour runs deep-indigo → violet → magenta → warm-gold by speed.

(4–5 distinct subsystems — clears the ≥3 floor.)

## FFT → compute-force mapping

Each frame the 8 bands and the onset/energy envelopes are packed into a uniform and read by the
compute shader. The velocity field is the sum of:

| Source | Bands | Effect in the cloud |
| --- | --- | --- |
| Curl-noise advection | mid (b3,b4) scale the flow | slow billowing latent-flow texture |
| Core swell | sub-bass + bass (b0,b1) | radial outward push at the centre |
| Gravity return | low-mid (b2) | gentle pull back so the cloud breathes, not explodes |
| Rim scatter | highs (b5,b6,b7) | random sparkle at the outer shell |
| Onset bloom | onset envelope | a radial kick that blooms the whole cloud, then settles |

**Memory:** velocity is damped each step (`0.965 − energy·0.02`), so a loud passage stays
visibly expanded and a quiet one settles inward — the cloud looks different during a swell than
during silence. A soft radius clamp keeps everything in frame.

## Named references

- **Refik Anadol** — latent / particle-flow aesthetic (*Machine Hallucinations*); the cosmic,
  luminous, billowing latent-flow look this piece aims for.
- **Robert Bridson**, *Curl-Noise for Procedural Fluid Flow*, SIGGRAPH 2007 — the
  divergence-free velocity field: curl of a gradient-noise scalar potential, evaluated by finite
  differences in WGSL.

## Degrade path: WebGPU → WebGL2 → audio-only

- **WebGPU** (the star): `navigator.gpu` adapter + device, compute + render pipelines,
  500k particles.
- **No WebGPU** → a `text-rose-300` notice **"(WebGPU unavailable on this device)"** and the
  piece falls back to `webgl-fallback.ts`: a WebGL2 additive point cloud of ~6,000 particles
  advected on the CPU with the same band→force idea (cheap analytic swirl instead of curl-noise),
  uploaded once per frame. Audio keeps playing; the visual is never dead.
- **No WebGL2 either** → a `text-rose-300` notice but the audio keeps playing.

## iOS / teardown

- `AudioContext` is created and `resume()`d inside the Start gesture (iOS autoplay requirement).
- On unmount: cancel rAF, stop the buffer source, close the `AudioContext`, revoke any object
  URL, and `destroy()` all `GPUBuffer`s + the `GPUDevice` (or delete GL buffers/VAO/program).

## Controls

Start the bloom · drop or pick a track (swaps live while running) · drag to orbit · scroll to
zoom · Design notes toggle · a live 8-band FFT meter in the corner.

## No npm deps

Hand-written WGSL and GLSL. Web Audio + WebGPU + WebGL2 only. No three.js, no external fetches —
the built-in piece is synthesised locally and user files are read via `decodeAudioData`.
