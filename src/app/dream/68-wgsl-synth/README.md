# 68 — WGSL Synth

**Question**: what if you could write a WebGPU shader that responds to your piano, live, in the browser?

## What it does

Split-screen: left = a WGSL fragment shader you can edit; right = the shader running fullscreen, updated every frame with your audio data. Edit any line — the shader recompiles 400ms later. If the WGSL has errors, the line number and message appear at the top of the editor. The last valid pipeline keeps running while you fix errors.

**Demo mode**: six incommensurable LFO oscillators stand in for mic input — the shader moves without mic permissions.

**Mic mode**: live FFT drives the uniforms. Play piano: bass swells the rings; chords shimmer the grid; a sharp onset snaps the canvas white.

## Six pre-wired audio uniforms

```wgsl
a.uBass   : f32  // bass energy  20-250 Hz (0.0-1.0)
a.uMid    : f32  // mid energy  250-4kHz   (0.0-1.0)
a.uTreble : f32  // treble      4k-20kHz   (0.0-1.0)
a.uOnset  : f32  // beat strength (1=hit, decays exponentially)
a.uTime   : f32  // elapsed seconds
a.uBPM    : f32  // tempo estimate
a.uResX   : f32  // canvas width  (pixels)
a.uResY   : f32  // canvas height (pixels)
```

The struct definition and binding are in the default template. Keep them or redefine them; the CPU-side buffer layout is always those 8 f32s in that order.

## Default shader

The starting shader: **pulsing radial rings + orthogonal grid**. `uBass` expands the rings outward; `uMid` and `uTreble` animate the grid phase; `uOnset` flashes the canvas; hue cycles slowly with time and frequency content. The vertex shader (not shown) is a fullscreen quad that never changes.

## Design notes

This is the **lowest level** of the audio-reactive shader stack in the sandbox:
- `1-live` (fixed 6-band bloom, no user code)
- `9-reaction-diffusion` (Gray-Scott uniforms, fixed shader)
- `15-webgpu-fluid` (Navier-Stokes, fixed pipeline)
- **`68-wgsl-synth`** (write your own WGSL — the audio arrives as uniforms)
- `51-claude-shader` (when ANTHROPIC_API_KEY is set — Claude writes the WGSL for you)

The two endpoints of this "AI assistance" axis give Karel a choice: full creative control (this) or full delegation (claude-shader). Intermediate: edit Claude's output here.

## Polish ideas (future cycles)

- Line numbers in the editor gutter (CSS counter trick)
- Syntax highlighting (CodeMirror 5 from CDN, ~200KB)
- Preset shader library: orbit trap, Julia set, domain warping, audio waveform FFT bars
- `uWaveform`: pass the raw 512-sample waveform as a texture uniform for waveform-based effects
- Save shader to localStorage; restore on reload
- Share link: encode the shader as a URL fragment (base64)
- `@react-three/postprocessing` bloom overlay on top of the canvas
