**For**: kids (4+)

# Liquid Light

A dark pool of living liquid light that a child finger-paints — and the liquid
**sings** as it swirls. Drag a finger across the screen and you inject swirling
colored dye into a real fluid simulation; the speed and direction of the swirl
drive a warm, ever-evolving wash of sound. There is no goal, no words, no wrong
move — just infinite calm sensory play. From the very first frame a hands-free
"ghost finger" wanders the pool on its own, so even an untouched screen shows
swirling, singing liquid.

## How to play

1. Tap the big glowing **"Touch to begin"** button (this also unlocks audio on
   iPads/phones).
2. Drag a finger (or mouse) anywhere on the pool. Light blooms and flows from
   your finger; the faster you swirl, the brighter and fuller the sound.
3. Lift your finger and just watch — after a few seconds the ghost finger takes
   over again and keeps the pool alive.

No reading is required to play. The Start button is the only text control.

## The technique

The primary renderer is a real-time **stable-fluids** solver running entirely on
the GPU via **WebGPU compute shaders (WGSL)**:

- A velocity field and a colored dye field live on a 192×192 grid stored in
  `rgba16float` textures.
- Each frame runs the classic Stam pipeline: **add forces** (finger impulse +
  dye injection with a Gaussian falloff) → **advect velocity** (semi-Lagrangian
  backtrace) → **divergence** → **Jacobi pressure solve** (~28 iterations,
  ping-ponged) → **subtract pressure gradient** (project to divergence-free) →
  **advect dye** by the resulting flow.
- A render pipeline samples the dye texture with a luminous tone-map (glow on a
  dark background) using a single full-screen triangle.

**Graceful degradation:** if `navigator.gpu` is missing or adapter/device/context
creation fails, the prototype falls back to a Canvas2D **"lite fluid"** — a few
thousand glowing dye particles advected by a coarse curl-noise velocity field
plus the finger impulse, drawn additively (`globalCompositeOperation = "lighter"`)
over a fading dark trail. It still looks like swirling liquid light and still
sings. A small `text-rose-300` notice ("Playing in lite mode ✨") appears in that
case.

## Sonification (the liquid sings)

Web Audio. The motion of the fluid under/around the finger is mapped to sound:

- **Swirl speed → brightness + voice count.** Faster motion opens a lowpass
  filter (capped well below 8 kHz) and rings more simultaneous voices.
- **Vertical position → register.** Top of the pool selects a higher slice of a
  **C-major pentatonic** scale (C3–C5), bottom a lower one — so nothing is ever
  "wrong."
- A small additive wash of triangle/sine voices uses `setTargetAtTime` glides
  (no clicks). An **always-on ambient pad** (C2 + G2 with a slow breathing LFO)
  keeps the piece **never silent**.
- **Kids-safe master chain:** `gain → lowpass(≤8000 Hz) → DynamicsCompressor`
  (brick-wall limiter, threshold ≈ −6 dB, ratio 20:1) `→ destination`. The
  AudioContext is created inside the Start-button gesture for iOS unlock and
  supports `window.AudioContext || webkitAudioContext`.

## Subsystems

- `page.tsx` — client component: canvas, pointer handling, ghost-finger
  auto-demo (cancels on first pointer-down, resumes after ~4 s idle), RAF loop,
  WebGPU/fallback selection, Start gate, cleanup on unmount.
- `fluid-gpu.ts` — WebGPU stable-fluids solver (WGSL compute + render pipelines).
- `fluid-fallback.ts` — Canvas2D curl-noise particle "lite fluid."
- `audio.ts` — `LiquidAudio` engine (pad + pentatonic wash + kids-safe chain).
- `README.md` — this file.

## Reference / lineage

- Jos Stam, **"Stable Fluids,"** SIGGRAPH 1999 — the advection + Jacobi pressure
  projection method implemented here.
- Lineage note: the luminous dye-on-dark look and finger-impulse interaction are
  in the spirit of Pavel Dobryakov's **WebGL-Fluid-Simulation** (a WebGL take on
  the same family of solvers); this prototype reimplements the idea on raw
  WebGPU compute shaders.

## Unverified surface (honest note)

This was built without a real WebGPU device or audio output to test against:

- The WebGPU path (WGSL compilation, bind-group layout validity across the
  shared compute/render layout, ping-pong correctness, and the dye tone-map look)
  has **not** been run on hardware. WGSL/binding validation is strict; minor
  fixes may be needed on a real adapter. The Canvas2D fallback is the safety net
  and is plain, well-trodden 2D API.
- Exact audio balance (pad level vs. melodic wash, limiter feel, perceived
  brightness range) was tuned by ear-on-paper, not by listening; values are
  conservative to stay kids-safe but may want a pass on real speakers.
- Touch latency and ghost-finger pacing were designed to the brief but not
  measured on an actual iPad.
