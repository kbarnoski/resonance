# Cymatics — design notes

**Route**: `/dream/19-cymatics`  
**Cycle**: 21  
**Question**: What if Resonance revealed the hidden geometry of sound?

---

## What is cymatics?

Chladni figures (1787): scatter sand on a metal plate, draw a bow across the edge.
At a resonant frequency the plate vibrates in a standing wave pattern. Sand migrates
away from the vibrating antinodes and accumulates along the stationary node lines.
The result is a geometric figure that is a physical imprint of the frequency.

This prototype simulates 2000 sand particles settling into the computed Chladni node
lines — in real time, driven by whatever audio you feed it.

---

## The Chladni function

For a square plate with approximate clamped boundary conditions, the mode shape for
integers (m, n) is:

```
f(x, y) = cos(m·π·x)·cos(n·π·y) − cos(n·π·x)·cos(m·π·y)
```

on domain x, y ∈ [−1, 1]. The node lines are where **f = 0**. The function is
antisymmetric in x and y: f(x, y) = −f(y, x), so f(x, x) = 0 always — the diagonal
is always a node line for every mode.

The gradient of f:
```
∂f/∂x = −m·π·sin(m·π·x)·cos(n·π·y) + n·π·sin(n·π·x)·cos(m·π·y)
∂f/∂y = −n·π·cos(m·π·x)·sin(n·π·y) + m·π·cos(n·π·x)·sin(m·π·y)
```

---

## Particle physics

Each frame, 2000 particles experience:

**Chladni force** (directed toward node lines):
```
Fx = −f · (gx / |grad f|) · SPRING
```
This is gradient descent of |f|, normalized so max force = SPRING px/frame² regardless
of mode. Particles near the node lines (|f| ≈ 0) feel near-zero force and stay put.

**Thermal noise** (mimics plate vibration):
```
noise = NOISE_BASE + amplitude · NOISE_AMP   (px/frame, random per particle per frame)
```
At low amplitude, noise is small and particles cluster tightly on node lines.
At high amplitude (loud music), noise overwhelms the spring and particles scatter —
like real sand on a very loud plate.

**Viscous damping**: velocity × 0.89 per frame.

Settling time: ~2–4 seconds from random scatter to visible pattern (depends on mode
complexity and amplitude).

---

## The eight modes

| Mode | Name | Approx freq |
|------|------|-------------|
| (1,2) | Ring | ~95 Hz |
| (2,3) | Clover | ~175 Hz |
| (1,4) | Cross | ~285 Hz |
| (3,4) | Asterisk | ~430 Hz |
| (2,5) | Lattice | ~620 Hz |
| (3,5) | Fine Star | ~900 Hz |
| (4,5) | Crystal | ~1240 Hz |
| (5,6) | Snowflake | ~1680 Hz |

The frequencies are approximate; real plate resonances depend on plate material, size,
and clamping. The actual Chladni patterns in this prototype are geometrically correct
for their (m, n) class.

---

## Audio modes

**Demo**: 5 oscillators auto-cycle through modes every 4.5 seconds. A silent sine wave
feeds the analyser so the amplitude meter is active. Good for seeing all patterns without
any microphone.

**Mic**: spectral centroid of live audio maps to the nearest mode. Mode changes are
debounced: the centroid must stay in the new range for 45 consecutive frames (~0.75s)
before the mode switches and particles scatter. This prevents rapid flickering on
complex audio. Manual mode buttons always override immediately.

---

## Visual

- 2000 amber particles on near-black background (`#050212`)
- Additive blending: dense regions (node lines) glow bright yellow-white; sparse regions
  are dim. The node lines emerge from particle density, not from explicit line drawing.
- Canvas size: up to 580×580 CSS px, DPR-scaled for sharpness on retina.
- Coordinate domain: canvas maps to normalized [−0.88, 0.88] to leave a margin
  where the Chladni function's edge behavior is well-defined.

---

## Polish ideas

- **Sound**: add a faint tone at the mode's resonant frequency (sine wave, low gain),
  audible to the user. The sound IS the pattern.
- **Frequency response**: instead of centroid → mode, do pitch detection (autocorrelation,
  same as `13-piano-canvas`) and map detected pitch to mode. Cleanest for piano — a
  single note produces the exact mode matching that note's frequency.
- **Continuous interpolation**: smoothly interpolate (m, n) between modes instead of
  instant scatter/reform. Would need to interpolate between two Chladni functions weighted
  by a blend factor.
- **Color by velocity**: particles that have just scattered (high velocity) glow blue-white;
  slow settled particles glow amber. Adds a visual cue for when the pattern is "frozen."
- **3D plate** (longer term): render the actual plate displacement as a 3D mesh using
  Three.js WebGPU, with sand particles on the surface. The node lines become valleys in the
  mesh. Audio drives the mesh deformation amplitude. Builds on the Three.js WebGPU + TSL
  finding from the Cycle 18 research sweep.
- **Plate aspect ratio**: support non-square plates. Rectangular plates (m/n ratio ≠ 1) have
  asymmetric modes that look different from the symmetric square versions.
