# Chromafield

**Status**: demoable

Chromafield turns one of Karel's real piano takes into a living chemistry you grow with your body. A Gray-Scott reaction-diffusion membrane is simulated on the GPU — two reagents A and B spreading and reacting across a lattice — and rendered obsidian black through indigo into electric violet. You deposit reagent B into the field with an arm sweep (full-body pose) or a pointer drag, and your arm-span slides the feed/kill regime between the four classic Gray-Scott morphologies: spots, stripes, worms and chaos. Open it to feel the piece's central question made physical: the emergent pattern is not decoration, it is the conductor — the shape of the chemistry is literally what shapes the sound.

## How to play

- Press **Start**; a Karel take begins looping through the membrane.
- **Drag** anywhere on the field to deposit reagent — the chemistry blooms where you touch and the piano answers at that instant. Fully playable with the mouse alone.
- Slide the **Regime** control (or press `←` / `→`) to move between spots, stripes, worms and chaos.
- Optional: **Grow with camera** and sweep both arms (keep your shoulders in frame — a seated webcam view is fine). Your wrists deposit reagent; your arm-span sets the regime.
- Stop touching it and the pattern **matures** on its own. Left untouched entirely, a reagent wanderer keeps the field drifting (labelled *autonomous · drifting*) so it always plays.

## How the field conducts the sound

Each frame the chemistry is reduced on the GPU to four scalars that drive a Web-Audio graph over the single real take (no synthesis — the only source is the decoded piano buffer, and the whole graph terminates at the shared ear-safety master):

- **coverage** (fraction of the lattice in the B-state) → lowpass **cutoff**: a filled-in, mature membrane opens the piano up; an empty field muffles it.
- **edge / turbulence** (mean boundary gradient of B) → resonance **Q** + feedforward-comb **depth**: an ordered pattern plays clear, a churning chaotic one smears and resonates.
- **left/right balance** → stereo **pan**.
- **vertical centroid** → a gentle high-shelf **tilt**.

All parameter changes glide with `setTargetAtTime(~0.12 s)` — immediate to the touch, no zipper noise on the ~1-frame-latency GPU readback.

## Implementation

The simulation runs in a WGSL compute pass that ping-pongs two storage buffers (each cell a `vec2<f32>` of A,B concentrations) for twelve substeps per frame, a second compute pass reduces the whole field to the four scalars via a shared-memory tree reduction, and a render pass colours the lattice with a full-screen triangle. The WebGPU setup (adapter/device request, pipeline creation, teardown, ~1-frame scalar readback) follows the build-safe pattern established by this lab's `23440-fluxmesh`. When WebGPU is unavailable the piece falls back to a real — just smaller and lower-substep — Gray-Scott membrane integrated in JavaScript and painted through an `ImageData` buffer onto a 2D canvas, with a visible notice; the chemistry, deposits and reduction mirror the GPU path exactly so the audio is still genuinely conducted.

## References

- Alan Turing, *The Chemical Basis of Morphogenesis* (1952) — the reaction-diffusion idea this whole piece rests on: pattern emerging from two diffusing, reacting substances.
- Robert Leitl's WebGPU reaction-diffusion compute-shader demo (Codrops) — the reference for implementing Gray-Scott in a WGSL compute pass on the GPU.

## Design notes — honest novelty

Reaction-diffusion as a *visual* is well-trodden ground, and it already exists elsewhere in this lab as imagery. Chromafield does not claim the picture as new. The novelty is the *coupling*: it extracts the morphology of the chemistry — how covered, how turbulent, how balanced, how high the pattern sits — and uses those statistics to conduct the DSP of Karel's real recording in real time. That extends the lab's GPU-simulation-to-audio-parameter method (first built for the mass-spring field in `fluxmesh`) onto a chemical simulation: where fluxmesh let you push a membrane, Chromafield lets you *grow* one, and the audio consequence is the piece. The palette stays at the intense, visionary pole — obsidian to electric violet — and all of that colour lives inside the shader; the UI chrome uses only the lab's semantic tokens with violet as the single brand accent.
