# 23440-fluxmesh — The Membrane That Filters the Piano

**Status**: demoable

A large mass-spring membrane (a pinned grid of ~10,000 nodes) is simulated
entirely on the GPU with WebGPU compute shaders, and its emergent physical state
becomes the filter shaping one of Karel's real piano takes. You reach into the
field with a wrist (camera pose) or the mouse; where you push, the mesh brightens
and the piano opens up at the same instant. See == hear.

## How it works

Each displayed frame runs three GPU stages:

1. **integrate** — a compute shader advances the membrane over several substeps:
   structural + diagonal neighbour springs, damping, a weak anchor to the rest
   shape, a gentle ambient breathing force (so the idle field is never static),
   and up to eight external "push" gaussians. Positions/velocities ping-pong
   across two storage-buffer pairs; the border is pinned, so waves reflect and
   nothing drifts off-screen.
2. **reduce** — a single-workgroup shared-memory tree reduction collapses the
   whole field to four scalars: total kinetic energy, energy-weighted vertical
   centroid, left/right energy balance, and mean displacement from rest.
3. **render** — a line-list wireframe of the mesh, each segment lit by its node
   velocity (schematic teal at rest → hot cyan where the field is moving), over a
   cool graphite background.

On the CPU side, those four scalars drive a **Fluxion-style DSP graph**: a biquad
SOS cascade (four lowpass sections + two peaking sections) feeding a delay
feedback line, processing one decoded take into `createSafeMaster`.

- mesh **energy** → cascade cutoff (the field opening the piano up)
- mean **stretch** → section resonance Q and peaking gain
- vertical **tilt** → delay feedback depth and wet amount
- L/R **balance** → stereo pan

If WebGPU is unavailable, a smaller CPU mass-spring membrane + Canvas2D viz takes
over (with a visible notice); the same scalar reduction still drives the same
audio graph, so the piece stays audible and conducted. The pointer path is fully
playable with the mouse alone — no camera required — which is the verified
fallback. Pose tracking gates on shoulders/wrists only (a hidden wrist is
synthesised from the elbow rather than rejecting the frame), never hips/ankles.

## Honest note on the GPU → readback → param coupling

The coupling is real, not cosmetic. The four scalars are computed on the GPU from
node velocities and displacements that only exist because the physics was stepped
there — they are not quantities that could be read trivially off the input. They
are written to a small storage buffer, copied to a `MAP_READ` buffer, and read
back asynchronously; only one map is ever in flight, so the scalars the audio sees
trail the displayed field by roughly one frame (~16 ms). Every `AudioParam` is
then smoothed with `setTargetAtTime(..., 0.12)`, which both hides that latency and
prevents zippering. Only the four floats are read back each frame — the full field
is never copied to the CPU, which would stall the pipeline.

## Roadmap — a multi-cycle build (this is cycle 1 of 3)

This ships the core as a working, conducted instrument. The planned deepening:

- **Cycle 2** — a richer Fluxion graph (add a FIR stage and a second
  independently-conducted region of the membrane, so two body signals shape two
  parts of the DSP graph), and a tighter visual coupling (the signal-flow of the
  graph drawn over the field).
- **Cycle 3** — Fluxion's *frozen-artifact* moment: when the field settles into a
  stable standing-wave, the current coefficient set is "frozen" and stability-
  checked (as Fluxion freezes a trained graph before edge playback), and the
  piece opens to full-body / multi-limb (or a second person) pushing the mesh.

## Reference

- **Fluxion: A Differentiable DSP Runtime from Training GPU to Real-Time Edge.**
  D. Spanio & A. Rodà, arXiv:2610.24622 (submitted 17 Oct 2026). The single
  DSP-graph algebra used here — a cascade of second-order sections plus delay-line
  effects as a real-time runtime.
- **A. Witkin, "Physically Based Modeling: Particle System Dynamics" / Verlet &
  semi-implicit integration of mass-spring networks** — the foundational physical
  model behind the GPU membrane (neighbour springs, damping, explicit time
  stepping).
- J. O. Smith III, *Introduction to Digital Filters with Audio Applications* — the
  biquad second-order-section cascade the audio graph is built from.
