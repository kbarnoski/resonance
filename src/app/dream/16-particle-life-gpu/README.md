# /dream/16-particle-life-gpu — Particle Life (WebGPU)

**Route**: `/dream/16-particle-life-gpu`  
**Cycle**: 17  
**Status**: demoable

## What it is

9,000 particles across 6 species simulated entirely on the GPU via WGSL compute shaders. 
The same particle-life algorithm as `/dream/8-particle-life` (CPU, 900 particles) but
10× the particle count with the physics loop running inside the GPU's compute pipeline.

A random 6×6 attraction/repulsion matrix governs how each species interacts with every 
other species. Nobody programmed the behavior — spiral predator-prey chains, tight orbiting
clusters, and long galaxy arms emerge from the matrix alone. Audio energy injects velocity
turbulence per species. Percussive onsets reshuffle the matrix → the entire swarm
re-organizes into a new emergent pattern.

## Technical design

### Compute shader (tiled N-body)

Each compute invocation handles one particle. The inner force loop (over all N particles)
uses workgroup shared memory tiling: each workgroup of 64 threads loads a 64-particle tile
into `var<workgroup>` shared memory, then all 64 threads compute forces against those 64
cached particles before advancing to the next tile.

Without tiling: each of the 9000 invocations would read all 9000 particles from global
memory → 9000 × 9000 × 24 bytes = 1.9 GB of global reads per frame.  
With tiling: 141 tiles × 1536 bytes per tile × 141 workgroups = ~30 MB per frame.
A ~64× bandwidth reduction.

Force function: repulsion inside `r < 0.3 × rMax`, then species-dependent attraction/repulsion
in the outer zone. Standard particle-life potential.

### Instance rendering

Particles are rendered as soft-glow quads via instance rendering: `draw(4, N_TOTAL)` with
`@builtin(instance_index)` picking the particle from the storage buffer and 
`@builtin(vertex_index)` selecting the quad corner. No separate vertex buffer needed — 
the particle storage buffer doubles as the render input.

Particle size scales with speed: `size = 0.005 + speed × 0.25`. Fast-moving particles
appear larger, slow ones shrink. Additive blending means overlapping particles bloom into
galaxy-cluster glow.

### Trail texture

The motion-blur trail uses an intermediate `rgba16float` texture (ping-pong):
1. **Fade pass**: blit previous trail × 0.92 (darken 8% each frame)
2. **Particle pass** (`loadOp: "load"`): draw particles additively on top of the faded trail
3. **Display pass**: filmic tone-map + gamma to canvas

This reproduces the Canvas2D `rgba(0,0,0,0.08)` fill trick without access to per-pixel
canvas compositing.

## Audio mapping

Same as `8-particle-life`:
- Each species maps to one of 6 frequency bands (sub-bass → violet, high → pink)
- Band energy → per-species velocity noise magnitude
- Onset → matrix reshuffle (2.5s cooldown in mic mode; periodic in demo mode)

## What I noticed

At 9000 particles with additive blending, the visual has a qualitatively different feel
from the 900-particle CPU version. Dense clusters bloom into white-hot cores; sparse
tendrils spiral outward like galactic arms. The trail persistence (0.92 decay) means
fast particles leave faint streaks that read as motion even when the system is in a
slow-orbit phase.

The tiled compute architecture means the GPU's L1 cache can serve most reads — the
N-body inner loop becomes a local memory traversal rather than a global scatter.
On modern desktop GPUs this should sustain 60fps at 9000 particles without difficulty.

## Polish ideas

- **Spatial indexing**: grid hash to skip distant particles → enables 50k+ without
  O(N²) cost. Would require a sorting/counting pass before the force pass.
- **Species labels**: hover over the matrix heatmap to see which species-pair rule
  is driving the current emergent behavior.
- **Trajectory trace**: render N random particles as path segments (points → lines)
  with a longer trail for individual tracking.
- **Parameter sliders**: friction, rMax, noise magnitude tunable live.
- **Matrix morphing**: animate between two matrices instead of instant reshuffle —
  slower reorganization would look organic.
