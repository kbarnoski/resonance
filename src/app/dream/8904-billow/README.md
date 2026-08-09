# 8904 · Billow

**The one question:** *What if a hanging cloth were an instrument — you make it
billow, and a fold sweeping across the fabric is a melody you both SEE and HEAR?*

A slack, gravity-loaded rectangular cloth hangs pinned along its top edge. You
raise the wind (tilt or drag) and a fold travels across the fabric. The fold you
see is the melody you hear: region after region rings as the wrinkle passes, like
light running along cloth. It plays itself until you take the wind.

## How it works

### Cloth model
A 32×24 mass-spring lattice (`cloth.ts`) after **Provot 1995**: three spring
classes — **structural** (adjacent), **shear** (diagonal), **bend** (skip-one) —
advanced by **Verlet integration** with a handful of **constraint-relaxation**
passes (Jakobsen-style position correction) each frame. The top row is pinned to
fixed anchors; everything below is slack and gravity-loaded. A per-point wind
force (global tilt vector + travelling gaussian gusts) pushes the sheet out of
plane, so it billows, swings, and folds. A tiny seeded z-jitter at construction
breaks perfect symmetry so folds read organically.

### Strain → modal mapping
The sheet is partitioned into a **6×4 grid of regions** (`REGX × REGY`). Each
frame we accumulate, per region, the **mean spring strain** `|len − rest| / rest`,
its **rate of change** across frames, and the **mean vertex speed**. When a
region's `strainRate × speed` crosses a threshold, we **strike a spectral-bell
modal voice** (`audio.ts`): a bank of 3–6 **inharmonic partials** (ratios
`1, 2, 2.76, 3, 4.19, 5.42`) with a fast attack and long, spectrally-rolling-off
decay. Region pitch is a pentatonic degree per column plus an octave offset per
row, so a fold sweeping left→right lights region after region as an ascending
**arpeggio/glissando**. A louder gust rings more partials, brighter and louder.
There is **no drone bed** — only struck bells, through a small synthesized plate
reverb and a limiter.

### WebGPU render + fallback
The cloth is drawn as a **lit 3D surface** (`render.ts`). The primary path is
**WebGPU**: a `triangle-list` mesh with per-vertex normals recomputed each frame,
diffuse + wrap shading in WGSL, a depth buffer, two-sided colouring (parchment
front, indigo-thread back). If `navigator.gpu` is missing or the adapter/device
request fails, it falls back to **Canvas2D**: the same mesh drawn as
painter's-algorithm shaded quads through the identical camera. **Sim and sound
are byte-for-byte identical on both paths**; only the pixels differ, and a small
non-blocking note flags fallback mode.

### Self-demo
After the required "Begin" tap (to start the AudioContext), a seeded
deterministic **auto-performer** (`performer.ts`, `mulberry32(0x8904)`) raises a
gentle scripted breeze that periodically gusts the cloth — a travelling gaussian
bump sweeps across, folds ripple, the bells arpeggiate — so the concept is fully
legible with zero interaction and reads even on a muted phone. As soon as you
tilt or drag, you take the wind; the breeze resumes after a few idle seconds.
`prefers-reduced-motion` softens gust amplitude and cadence while keeping the
travelling fold legible. No `Math.random`, `Date.now`, or `new Date()` anywhere.

## References
- arXiv:2507.11794 — *Real-Time Cloth Simulation Using WebGPU* (2026).
- Provot 1995 — *Deformation Constraints in a Mass-Spring Model to Describe Rigid
  Cloth Behaviour*.
- Modal / spectral-bell synthesis — struck banks of inharmonic partials with
  fast attack + long decay.

## Next-cycle deepening
- Move the Verlet solve into a **WebGPU compute pass** (double-buffered position
  storage, constraint batching) so the whole instrument lives on the GPU.
- **Self-collision & contact folds** so the cloth can layer over itself, adding
  richer creases and darker occlusion valleys.
- A **struck-vs-plucked** gesture distinction: a sharp flick strikes bright
  partials; a slow drag bows a sustained band-limited tone.
- Per-thread **anisotropic stiffness** (warp vs weft) so the fabric has a grain
  and folds preferentially along one axis — audibly changing the arpeggio shape.
- Wind **turbulence field** (seeded curl noise) so gusts are less uniform and the
  travelling fold meanders rather than sweeping in a straight line.
- A **material picker** (silk / linen / canvas) mapping mass, stiffness, and
  damping to both drape and modal timbre.
