# 15-webgpu-fluid — design notes

WebGPU Navier-Stokes fluid simulation. Same algorithm as `/dream/3-fluid` (WebGL2, 128×128)
but ported to WebGPU render pipelines at 512×512 — 16× the pixel count, no extension flags.

## Why the upgrade matters

`3-fluid` requires `EXT_color_buffer_float`, a WebGL2 extension that fails silently on older
Safari. `15-webgpu-fluid` uses `rgba16float` render attachments natively — WebGPU supports them
as first-class formats with linear filtering without any extension dance. The 512×512 resolution
produces visibly smoother dye trails and finer vortex structures.

## Algorithm

Each frame: advect velocity → compute divergence → 25 Jacobi pressure iterations →
subtract pressure gradient → advect dye → tone-map to canvas.

Six WGSL render pipelines (one per step), each runs as a full-screen fragment pass writing
into a `rgba16float` ping-pong texture pair. The canvas itself uses `getPreferredCanvasFormat()`
(usually `bgra8unorm` on desktops).

Splats (mouse drag, audio) are submitted as separate command encoders before the main sim
encoder so each splat has consistent ping-pong state.

## Audio mapping (identical to 3-fluid)

- Bass → radial pressure pulse outward from center, dye color follows spectral centroid
- Treble → small turbulence splats at random positions
- Onset → large burst at random position
- Centroid → dye color: indigo (low) → green (mid) → orange/red (high)

## Browser support

WebGPU required: Chrome 113+, Edge 113+, Firefox 147+, Safari 26+. Falls back to a
clear error message (no silent failure). Mobile Android: fragmented — some devices
work, some don't, no fallback.

## Polish ideas

- Vorticity confinement (add curl force to keep vortices from diffusing away)
- Curl-noise turbulence layer on ambient mode
- Adjustable Jacobi iteration count slider (10=fast/blurry vs 40=sharp/expensive)
- Resolution toggle: 256² / 512² / 1024² based on GPU tier detection
- Color palette mode: monochrome (single hue), rainbow, thermal (black→red→yellow→white)
- Export: `ctx.getCurrentTexture()` → copy to CPU → canvas 2D → PNG download
