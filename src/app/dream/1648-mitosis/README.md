# 1648 · Mitosis

A gallery of self-organizing life: a **Particle Lenia** swarm rendered as luminous
protoplasm and sonified as it splits and merges. A few hundred particles descend an
energy field until they crystallize into a living cell with a bright membrane, then
pinch, divide and re-merge — while a self-playing granular drone swells a new voice
each time the cell splits.

## The one question

*What if watching a cell divide was a self-playing granular drone that swells as it
splits?*

## Technique — Particle Lenia

The swarm is **Particle Lenia** (Alexander Mordvintsev, "Particle Lenia," 2023), the
continuous-particle variant of **Bert Chan's Lenia** lineage of continuous cellular
automata — kin to *Neural Particle Automata* (arXiv 2601.16096, Jan 2026).

Each particle sits in a scalar energy field built from three ingredients. For a query
point `x`, summed over all other particles `j` (with `bell(v,m,s) = exp(-((v-m)/s)^2)`):

- `U(x) = Σ_j w_k · bell(dist(x,p_j), mu_k, sigma_k)` — long-range attraction kernel
- `G(x) = bell(U(x), mu_g, sigma_g)` — growth
- `R(x) = Σ_j (c_rep/2) · max(1 - dist(x,p_j), 0)^2` — short-range repulsion
- `E(x) = R(x) − G(x)`

Every particle moves **down** the gradient: `p_i -= dt · gradE(p_i)`, with `gradE`
computed by central finite differences (`eps = 1e-4`). Canonical constants:
`mu_k=4, sigma_k=1, w_k=0.022, mu_g=0.6, sigma_g=0.15, c_rep=1, dt=0.1`, two substeps
per frame. The O(N²) sim runs on the CPU (N = 340) and streams into a three.js points
cloud; **UnrealBloom** postprocessing gives it the volumetric glow.

The growth centre `mu_g` is the live morph knob:

- **low** (~0.4) → one big hollow vacuole with a clean membrane
- **mid** (~0.6) → a solid cell with a bright rim
- **high** (~0.95) → the membrane loses cohesion and buds into several small cells (mitosis)

## Sonification

A consonant, cosmic-ambient drone in just intonation, played entirely by the field's
smoothed statistics:

| Swarm statistic        | Sound                                                        |
| ---------------------- | ------------------------------------------------------------ |
| cluster count          | number of active drone voices — a split blooms a new voice   |
| field / kinetic energy | grain-cloud density + lowpass cutoff (brightness)            |
| mean cell radius       | root pitch (bigger cell → lower drone, glided continuously)  |
| membrane sharpness     | high-partial shimmer                                         |

The bed is a bank of detuned, slowly breathing sine voices at the ratios
`1 : 3/2 : 2 : 3 : 5/2`; over it, a look-ahead scheduler sprays short windowed grains
whose density and octave track the reorganization energy. Master chain: lowpass →
convolution reverb (synthesized impulse). Starts silent; begins on the Start gesture.

## Controls

- **Start** — provides the audio gesture and begins the drone
- **Space** — pause / resume the simulation
- **R** — rebirth (reseed the blob)
- **↑ / ↓** — nudge `mu_g` to push between one blob and many cells
- **1 / 2 / 3** — regime jumps: single cell · dividing colony · hollow vacuole

## Next-cycle deepening

Run the sim on the GPU via three's `GPUComputationRenderer` to push N into the
thousands, and give each detected cluster its **own** spatialized voice whose pan and
pitch follow that cluster's centroid — so a division you *see* on the left is a voice
you *hear* drift left, and the drone becomes a true auditory map of the colony.
