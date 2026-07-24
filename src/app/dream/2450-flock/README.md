# Flock

**One question: what does a flock _sound_ like when it agrees?**

A WebGPU compute-shader boids simulation whose emergent order becomes a spatial
choir. A few thousand agents obey Craig Reynolds' three rules; their collective
_agreement_ — how much they share a heading — tunes the harmony between
consonance and dissonance.

## Reynolds' boids (1987)

Craig Reynolds, _"Flocks, Herds and Schools: A Distributed Behavioral Model"_
(SIGGRAPH 1987). Each agent steers by three local rules over its neighbours:

- **Separation** — steer away from crowding neighbours.
- **Alignment** — steer toward the average heading of neighbours.
- **Cohesion** — steer toward the average position of neighbours.

No leader, no global plan. Flocking is emergent — artificial life, not
choreography (and emphatically not about consciousness or altered states).

## The compute core

- **GPU path:** a WGSL `@compute` shader (`workgroup_size(64)`) updates every
  agent's position + velocity in a storage buffer each frame, applying the three
  rules over an O(n²) neighbour sweep (fine on the GPU across ~2,600 agents).
  Two storage buffers ping-pong (in → out, swapped each frame); a uniform buffer
  carries the rule weights and the attractor/predator. After the compute pass we
  copy the output buffer to a mapped staging buffer, read the positions back, and
  draw the motes in Canvas2D.
- **CPU fallback (mandatory):** if `navigator.gpu` is absent or adapter/device
  request fails, we automatically run ~720 agents through the identical three
  rules in a JS loop and draw the same way. A `font-mono` badge shows `gpu` /
  `cpu`. Audio and interaction are identical on both paths.

## The heart: order parameter → consonance

Each frame we compute the **order parameter** — the magnitude of the mean
_normalized_ velocity, `|mean(v̂)|` in `[0,1]`. 1 = every bird agrees on one
heading; 0 = scatter. That single number is the master musical signal:

- **near 1** → the seven voices snap to a just-intonation chord
  (1, 5/4, 3/2, 2, 5/2, 3, 4 over a 110 Hz root) — beatless, locked, consonant.
- **near 0** → per-voice detune spreads (up to ~55 cents, plus a ~90-cent clash
  on some voices) so the choir beats and clashes into dissonance.

The flock **centroid** pans the choir; its **spread** widens the stereo image and
opens the filter. Attractor drops swell the master; predator drops fire a
filtered-noise stab and duck the mix.

## Interaction

- **Release the flock** starts the sim + `AudioContext` on the user gesture.
- **Tap/click the field** drops an attractor — the flock gathers and locks.
- **Predator** toggle: taps now drop a predator that scatters the flock — you
  hear it panic and detune.
- **Idle autopilot:** untouched for ~4 s, a _deterministic_ 20-second path drives
  the attractor to gather → lock → a predator sweep to scatter → reform, so a
  silent phone-glance shows (and would hear) the whole idea.

## Known rough edges

- **The WebGPU path is unverified on headless CI** — it needs a real browser with
  WebGPU enabled and cannot be exercised by `tsc`/lint. The **CPU fallback is the
  guaranteed path** and makes the piece fully demoable with WebGPU entirely
  absent.
- GPU readback maps the staging buffer each frame (serializing GPU + CPU); it is
  chosen for robustness over throughput, not maximum FPS.
- No mic, no camera, no network. If `AudioContext` fails the flock keeps flying
  in silence with a one-line notice.
