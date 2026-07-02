# 1095 · Plate Modes

**The one question:** *What if you could tap a vibrating plate and watch the exact standing-wave (Chladni) nodal patterns you're HEARING form in real time — the sound and the geometry being literally the same physics?*

Tags: `state: geometric form-constant / cymatic trance · pole: intense-hypnotic`

- **INPUT:** tap / click to strike the plate (each tap is a single impulse, not a drag).
- **OUTPUT:** WebGL2 — a ping-pong float-texture FDTD wave simulation plus a render pass.
- **TECHNIQUE:** 2D wave-equation FDTD → modal audio resonance.
- **PALETTE:** electric monochrome — deep black plate, incandescent cyan/white nodal glow, faint amber antinodes.

## How it works

### The plate (2D wave equation, FDTD)

The plate is a grid governed by the discrete **2D wave equation**, integrated on the
GPU (`sim.ts`) as a WebGL2 **ping-pong** between two float textures:

```
u_next = 2·u_curr − u_prev + c²·∇²u_curr        (then × damping)
∇²u ≈ u(x−1) + u(x+1) + u(y−1) + u(y+1) − 4·u
```

Each texel packs three coupled quantities: `.r` = displacement now, `.g` =
displacement one step ago, and `.b` = a slowly-decaying **envelope of |u|** — the
standing-wave amplitude, which is exactly what sand measures on a real Chladni
plate. Edges are held at zero (**reflective / fixed boundary**) so genuine
square-plate standing modes `sin(mπx)·sin(nπy)` form. The scheme is run at
`c² = 0.24`, well under the 2D CFL stability limit of `0.5`, with damping every
step and a non-finite guard in the shader, so it never blows up to NaN.

A continuous gaussian **sinusoidal driver** sits slightly off-centre and its
frequency is **slowly swept**, so the plate rings up one resonant mode after
another and the picture stays alive with no input. Each tap injects a gaussian
**impulse** at the touch point.

### Chladni nodal lines (what you see)

The render pass (`sim.ts`, present shader) reads the envelope: where the standing
amplitude is near zero — the **nodes** — it glows incandescent cyan→white, the
luminous "sand lines." Where the plate swings hardest — the **antinodes** — it
reads a faint amber wash. As the driver sweeps, the visible figure continuously
reorganizes between mode shapes. Brightness changes are slow; there is no strobe.

### Modal audio, from the SAME field (what you hear)

This is the honest part. Every frame the field is **read back** from the GPU into a
small grid and **projected onto the plate's own spatial eigenmodes**
`φ_mn = sin(mπx)·sin(nπy)` (`modes.ts`). The resulting per-mode amplitudes drive a
bank of **resonant sine voices** (`audio.ts`), one per mode, each fixed at the
plate's modal frequency `f = F₀·√(m²+n²)`. So each voice's **loudness is the amount
of that standing pattern currently present in the plate** — you literally hear the
modes whose nodal lines you see, and the chord shifts as the driver rings up new
modes. A tap adds a bright band-passed noise **strike** that rings and decays with
the plate's damping. Everything sums through a soft-clip (`tanh`) bus so nothing
clips. If a device refuses float read-back, the audio falls back to a
driver-derived modal estimate so it never goes silent; the visuals read the real
texture directly and are unaffected.

### Physical honesty

This is a real Chladni plate, not an FFT-of-a-song visualizer. The picture is a
genuine finite-difference solution of the wave equation; the sound is that same
solution decomposed into its vibrational modes. Sound and geometry are two
read-outs of one vibrating system.

## Files

- `page.tsx` — client component: canvas, WebGL2 setup, driver sweep, tap handling,
  render loop, controls, graceful fallback.
- `sim.ts` — hand-written WebGL2 FDTD (ping-pong float textures), reduction
  read-back, and the Chladni render pass.
- `modes.ts` — square-plate spatial eigenmodes and field-onto-mode projection.
- `audio.ts` — modal resonator bank + strike transient (Web Audio).
