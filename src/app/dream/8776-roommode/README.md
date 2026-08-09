# 8776 · Room Mode Instrument

**The one question:** *What if you could see and hear the acoustics of a room — resize a 3D room and watch/hear its standing-wave modes bloom?*

A 3D room-acoustics eigenmode instrument. A rectangular room is drawn as a real
box in perspective (raw WebGL2, hand-rolled). Its acoustic standing-wave modes
are rendered as genuine 3D geometry and sounded as an additive sine chord.
Resize the room and every mode retunes — live, visibly and audibly. The
room's *shape* is its *sound*.

## The eigenmode math

For a rigid-walled box of dimensions `Lx, Ly, Lz` the normal (standing-wave)
mode frequencies are

```
f(nx,ny,nz) = (c/2) · √( (nx/Lx)² + (ny/Ly)² + (nz/Lz)² ),   c = 343 m/s
```

with integers `nx, ny, nz ≥ 0` (not all zero). A mode is **axial** (one nonzero
index), **tangential** (two), or **oblique** (three).

Each mode's pressure field is a product of cosines:

```
p(x,y,z) ∝ cos(nx·π·x/Lx) · cos(ny·π·y/Ly) · cos(nz·π·z/Lz)
```

Because each factor is a cosine, the **nodal surfaces** (where `p = 0`) are flat
planes perpendicular to the axes — `nx` planes at `x = Lx·(k+½)/nx`, and likewise
in y and z. The **antinodes** (`|p| = 1`) sit on the regular grid between them.
That flat plane geometry is exactly what the renderer draws.

## What you see

- **Room box** — the 12 wireframe edges, in blueprint cyan.
- **Nodal planes** — the flat `p = 0` surfaces as translucent, additively-blended
  cyan sheets slicing the room. These morph as you change the mode.
- **Voxel field** — a grid sampling of `|p|`, drawn as solid, face-shaded cubes
  whose size and brightness track the pressure magnitude. The antinodes bloom
  into blocks; positive/negative pressure reads as bright cyan vs. deep teal.

All of it is real 3D geometry in a hand-rolled perspective camera — a tiny mat4
stack plus one vertex/fragment shader pair. No three.js, no external 3D lib.

## How to use it

- **Drag** the room to orbit the camera.
- **← / →** sweep the current mode down/up the frequency-sorted list of low modes.
- **↑ / ↓** shift which axis's nodal planes are emphasized (brightened).
- **1–5** jump to preset modes.
- **Sliders** set `Lx, Ly, Lz` (2–10 m). Resizing re-derives every modal
  frequency live, so the sine chord glides — you *hear* the room retune.

Sound (Web Audio API only) starts on the first user gesture: the current mode
plus its two nearest frequency neighbours ring as a soft sine chord — the
room's low-end signature — through a limiter at modest gain.

## Muted-read auto-demo

On mount, with zero input and before any AudioContext exists, the camera
auto-orbits slowly and the mode auto-sweeps through the first ~8 modes, so a
reviewer on a muted phone sees the nodal surfaces morph within about a second.
Audio only engages after a click, key, or drag. `prefers-reduced-motion` slows
the orbit and sweep and avoids fast flashing.

## References

- **Lord Rayleigh**, *The Theory of Sound* — classical rectangular-room normal
  modes; **Helmholtz** resonance as the acoustic foundation.
- **Scene2Sound: Auditory-Grounded Soundscape Generation for 3D Gaussian
  Worlds**, arXiv:2608.01093 (Aug 2026) — the current framing of scene
  geometry → sound. This piece realizes that mapping *physically* in the
  browser: the room's geometry literally becomes the pitches you hear.

## Honest limitations

- The model is the ideal rigid-wall rectangular room: no wall absorption, no
  damping/decay of individual modes, no non-rectangular geometry or furniture.
- The voxel field is a coarse (9³) sampling for interactivity, not a smooth
  isosurface; very high modes alias against the grid.
- Very low modal frequencies (< ~35 Hz) are clamped and are hard to hear on
  phone speakers; the neighbour voices in the chord carry the audible signal.
- Transparency uses order-independent additive blending, so overlapping nodal
  sheets add brightness rather than compositing physically.
- WebGL2 fallback: if unavailable, a `text-destructive` notice appears and the
  piece degrades to an animated Canvas2D nodal cross-section (a single slice).
