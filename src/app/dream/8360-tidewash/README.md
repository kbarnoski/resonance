# 8360 · Tidewash

**The one question:** *What if you could conduct a flowing luminous fluid with
your bare hands — and the vorticity you stir granulated a warm pad into a
living cosmic-ambient wash, so your gestures literally stir the sound?*

You do not watch this piece. Your hands make the weather. Wave in front of the
webcam and force + dye pour into a real-time fluid field; wherever it swirls
fast, grains of a synthesized pad fire denser and brighter; calm pools go quiet
and deep.

## How it works

### Input — webcam, zero ML
`camera.ts` grabs `getUserMedia` video, draws each frame tiny (48×36) and takes
a **frame-difference optical-flow field**: per-cell temporal brightness delta
combined with the spatial gradient gives a single-point Lucas-Kanade flow
vector — no MediaPipe, no TensorFlow, headless-safe. The strongest-moving cells
become force + dye splats (mirrored so it feels like a mirror). Overall motion
energy crossing a threshold hands control from the seeded conductor to you.

If the camera is denied or absent, `start()` rejects and the piece stays fully
alive on the seeded autonomous conductor, with a `text-destructive` notice.

### Output — a genuine fluid, on a fallback ladder
The visual is a **Jos Stam "Stable Fluids" solver** (advect → vorticity
confinement → pressure projection → dye advection), picked at runtime from the
best substrate available and shown in the `font-mono` tier readout:

1. **WebGPU** (`gpu-fluid.ts`) — the frontier target. Fragment-pipeline
   ping-pong render targets, `rgba16float`, 20 Jacobi pressure iterations.
   Modeled on the proven pattern in `dream/15-webgpu-fluid`.
2. **WebGL2** (`gl-fluid.ts`) — GLSL ES port of the identical scheme, float
   FBOs (`EXT_color_buffer_float`), full-screen-triangle passes.
3. **CPU** (`cpu-fluid.ts`) — a coarse semi-Lagrangian grid rendered to a 2D
   canvas, so a 06:30 phone glance never sees a black screen.

`buildVisual()` probes the tiers *before* claiming a canvas (a canvas can hold
only one context type), so there are no orphaned canvases and no wasted
contexts.

### The coupling — fluid stirs sound
`cpu-fluid.ts` also runs an **always-on coarse shadow field** driven by the same
splats as the visuals. Seven fixed *listening points* (bottom = low & warm, top
= bright & high) sample it every frame. In `audio.ts`:

- local **speed** → grain **density** and **amplitude** (dense/bright where the
  flow swirls fast, sparse where calm),
- local **vorticity** → grain **bandpass** brightness,
- a quiet detuned **bed drone** means calm reads as depth, never silence.

The carrier pad is synthesized in-browser (deterministic additive/FM tone
rendered once into an `AudioBuffer`), grains are cut from it with Hann
envelopes, panned by point, and sent through a synthesized convolution reverb
for cosmic space. The piece always sounds — fully offline, no assets.

### Self-demo & determinism
On load the seeded **`mulberry32`** conductor (`conductor.ts`, `prng.ts`) stirs
three Lissajous "hands" so the field is visibly alive within ~1s with zero
input; audio begins on the Start gesture (AudioContext resume). Time comes from
`performance.now()`. The first real hand motion takes over.

### Safety & teardown
No strobe — smooth luminance drift only; `prefers-reduced-motion` calms the flow
and thins the grains. On unmount: rAF cancelled, all media tracks stopped,
`AudioContext.close()`, WebGPU device/textures/buffers destroyed, WebGL2
programs/FBOs deleted + context lost, canvases removed.

## Named references
- **ASTRODITHER** — Robert Borghesi, three.js WebGPU/TSL audio-reactive fluid
  (2026-07-01): the "fluid you can hear" ambition.
- **Jos Stam, "Stable Fluids"** (SIGGRAPH 1999): the advect/project scheme used
  in all three tiers.
- **Refik Anadol** — fluid data-paintings: the boundless liquid-light aesthetic.

## Unfinished / caveats
- **Headless-WebGPU caveat:** in a headless build/CI (`next build`) there is no
  GPU adapter, so the tier can only be *verified* to fall through to WebGL2/CPU
  in a real browser. The WebGPU path follows the proven `15-webgpu-fluid`
  pattern but should be smoke-tested on real hardware.
- The audio shadow field is a separate coarse sim from the on-screen GPU fluid
  (same splats, so they swirl alike) rather than a GPU read-back — this keeps
  the coupling tight and cheap across all tiers, but the sound tracks a
  lower-resolution echo of the picture, not the exact pixels.
- Canvas backing size is fixed at mount and CSS-scaled on resize (slight blur on
  large resizes); a full resize-reconfigure was left out.
- The optional `/api/audio/[id]` piano load was intentionally **not** wired: the
  synth pad is the always-on carrier and no specific track id is guaranteed, so
  the network path stays omitted to keep the piece self-contained.
