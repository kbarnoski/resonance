# Torsion (1220)

## The one question

**What if a (p,q) torus knot — a single string wound through a donut in a
mathematical braid — were a pluckable physical instrument, where the winding
numbers ARE the tuning?**

A (p,q) torus knot is one closed curve that wraps **p** times around the axis of
a torus and **q** times through its hole. When p and q are coprime it is a
single unbroken string. Torsion treats that string as an instrument and reads
its two integers as its tuning.

## What it is

A glowing torus-knot tube you can turn in 3D and pluck. Each pluck is a
Karplus–Strong plucked string; a displacement wave travels outward along the
tube from the point you touched, so the thing you hear and the thing you see are
the same waveguide.

## How to use

1. Press **Awaken the knot** (this creates the AudioContext from your gesture
   and ramps the master gain up from silence).
2. **Drag empty space** to orbit the knot in 3D.
3. **Click the string** to pluck it; **slide along it** to strum across pitches.
4. Tap a **(p,q) preset** — (2,3) trefoil, (3,2), (2,5) cinquefoil, (3,4) — to
   **retune** the whole instrument. Changing the winding numbers rebuilds both
   the geometry and the scale.

## Technique

- **Geometry.** The tube is a `THREE.TubeGeometry` swept along a custom
  `THREE.Curve`, the parametric torus knot
  `x = (R + r·cos qθ)·cos pθ`, `y = (R + r·cos qθ)·sin pθ`, `z = r·sin qθ`,
  θ ∈ [0, 2π]. See the **(p,q) torus knot** in knot theory (a torus knot exists
  and is nontrivial exactly when p, q are coprime and > 1).
- **Tuning from winding.** The two integers become two interlocking harmonic
  series — the partials {p, 2p, 3p, …} and {q, 2q, 3q, …} — each folded into a
  ~2.5-octave window and sorted into a just-intoned ladder. The arc parameter
  u ∈ [0,1] read from the pluck point (the tube's length UV) picks the nearest
  rung, so sliding along the one string climbs the scale.
- **Voice — Karplus–Strong / digital waveguide.** Each pluck drops a short
  windowed noise burst into a feedback delay line whose length is one period of
  the target pitch (`delay = 1/f`), with a one-pole lowpass in the loop so the
  high partials decay first and the string settles toward a sine. Built in Web
  Audio as `DelayNode → lowpass BiquadFilter → feedback GainNode < 1 → DelayNode`.
  Master chain: `masterGain` (ramped up on Start) → `DynamicsCompressor`
  (limiter) → destination. Up to 16 concurrent voices with oldest-voice stealing
  and timed cleanup.
- **Travelling wave.** A custom `ShaderMaterial` displaces the tube along its
  normal by a Gaussian pulse that moves outward in u from each pluck (circular
  distance, so it wraps the loop) and brightens the garnet→amber→gold gradient as
  it passes, decaying over ~2 s.

### Named references

- **(p,q) torus knot** — torus knots in knot theory; coprime winding numbers.
- **K. Karplus & A. Strong (1983)**, *"Digital Synthesis of Plucked-String and
  Drum Timbres,"* Computer Music Journal 7(2) — the noise-burst-into-damped-delay
  string.
- **Julius O. Smith III** — *digital waveguide synthesis*; the delay line as a
  travelling-wave model of a vibrating string, with a loop-damping filter.

## Design notes

- **The tuning is legible by ear on retune.** (2,3) and (3,2) sound different
  because folding {2,4,6,…} vs {3,6,9,…} into the window yields different rungs,
  even though the drawn knots are mirror-relatives. That divergence is the point:
  the winding numbers audibly are the tuning.
- **Orbit vs. pluck is decided on pointer-down** by a raycast: if the ray hits
  the tube you pluck (and further motion strums); if it misses you orbit. So to
  rotate the knot, start your drag on empty space.
- **Cleanup is explicit.** The scene disposes geometry/material/renderer, cancels
  its RAF and removes listeners on unmount; the synth ramps voices down, closes
  the AudioContext, and clears timers.

### Honest edges

- No real bloom. Glow is faked with a fresnel rim plus emissive brightening on
  the pluck wave rather than a postprocessing pass, to keep the render cheap and
  the build robust. On very bright monitors the glow reads as flat.
- The Karplus–Strong loop uses Web Audio's interpolating `DelayNode` for pitch
  rather than a sample-exact fractional-delay allpass, so very high notes drift a
  few cents from equal temperament — acceptable here because the tuning is just
  intonation anyway, not 12-TET.
- Pluck strength is fixed per gesture (down = firm, strum = softer); there's no
  velocity from pointer speed. A fast strum can momentarily crowd the 16 voices
  and steal the oldest, which can clip a still-ringing note short.
- Picking resolution is the tube's tubular-segment UV; on the thinnest grazing
  angles a click can miss the tube and fall through to orbit.
