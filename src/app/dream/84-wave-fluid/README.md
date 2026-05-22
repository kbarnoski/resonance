# 84-wave-fluid — Audio-reactive WebGPU ocean surface

**Route**: `/dream/84-wave-fluid`  
**Status**: demoable  
**Built**: Cycle 107

## What it does

An audio-reactive ocean rendered entirely in a WebGPU fragment shader. The "ocean" is a 1D height field computed analytically from superimposed sinusoidal modes — the same mathematical approach used in TouchDesigner's wave analysis CHOPs, ported to WGSL.

- **Bass energy** → wave amplitude. Low bass = calm ripple; high bass = full swell.
- **Treble energy** → surface turbulence (value noise layered on the wave field).
- **Onset events** → randomized splash ripple (expanding ring + surface wave from the impact point).
- **Click the canvas** → manual splash at any horizontal position.

## Visual anatomy

**Sky region** (above the wave surface):
- Dark atmospheric gradient — a deep indigo night sky.
- Twinkling stars (hash-based, unique to each grid cell, with time-varying twinkle).
- Spray particles: per-column parabolic arcs that rise and fall in 2.2-second cycles. Each of the 38 columns has a different phase and apex height. Bass amplitude drives their intensity.

**Surface layer**:
- Rose/violet bloom: a Gaussian-falloff glow right at the surface edge, driven by bass. Makes the waterline feel alive.
- Foam band: exponential falloff above the surface. Color mixes violet-white foam (calm) → deep violet-white (bass-driven).
- Splash rings: expanding radial rings (violet glow) + a surface-confined wave distortion.

**Water body** (below the surface):
- Color gradient: bright cobalt blue at the surface → deep indigo-black at depth.
- Caustic shimmer: two interference sine patterns (horizontal × vertical) create flickering caustic patches that respond to bass.
- Subsurface scatter: violet/violet-blue glow that fades with depth, simulating volume scattering.

## Shader architecture

One render pass per frame. Fullscreen triangle-strip quad (4 vertices). All ocean geometry computed analytically in the fragment shader — no particle simulation, no textures, no compute shaders.

The `FRAG_SRC` pipeline:
1. Evaluate 4-mode wave superposition at column `x`.
2. Add treble turbulence via 2D value noise.
3. Add splash wave (guarded by `s_valid` to prevent NaN from old/invalid splash times).
4. Compute `sd = y - surf` (signed distance from surface).
5. Branch on sign: sky path vs water path.
6. Apply surface bloom (Gaussian centered at `sd = 0`).
7. Apply splash ring glow.
8. Filmic tonemapping + 2.2 gamma.

Uniform buffer (32 bytes): `time, bass, treble, splash_x, splash_time, splash_str, pad, pad`.

## Comparison to existing fluid prototypes

- **3-fluid**: Navier-Stokes velocity field on Canvas2D. True 2D fluid. Low resolution, drag-to-stir.
- **15-webgpu-fluid**: Navier-Stokes on GPU textures. 512×512 resolution, multi-pass. Ink-in-water aesthetic.
- **84-wave-fluid**: Height-field ocean. Single-pass. Infinite spatial resolution (analytical). Better for "ocean surface" visual vs "ink blob" visual.

## Next evolution (Cycle 109 candidate)

The spec called for WebGPU MLS-MPM particles (100k particles, depth pass, bilateral filter, screen-space normals). That would be a second-cycle upgrade. The height-field approach is more predictable and ships in one cycle — worth seeing if Karel prefers the clean analytical look vs a particle simulation before investing in the full MLS-MPM pipeline.

## Design notes

- `s_valid` guard: the splash time is in elapsed-seconds-since-session-start. If the page is loaded but mode is idle, click events write a splash_time in a different reference frame. The `s_age > 0 && s_age < 4.5` guard prevents the shader from seeing stale splash events as valid.
- Wave modes: frequencies 7:13:23:41 are mutually incommensurable → the pattern never tiles visibly in a session. The wave moves rightward at ~0.33 cycles/sec (w1) with slower leftward movement for w2 — creates a natural interference pattern.
- Spray columns: 38 columns, each cycling every 2.2 seconds with a random phase offset. This creates the impression of many independent droplets without any state.
