# 3-fluid — Navier-Stokes ink-in-water

**Question**: what if the visualizer felt like ink dropped in water, reacting to sound?

## What it does

A real-time incompressible fluid simulation running on GPU via WebGL 2.
The simulation solves a simplified Navier-Stokes equation each frame:
1. **Advect velocity** (fluid carries itself forward in time)
2. **Compute divergence** (where is fluid accumulating?)
3. **Pressure solve** — 25 Jacobi iterations to find the pressure field
4. **Gradient subtraction** — remove non-physical compressibility
5. **Advect dye** through the corrected velocity field

All simulation happens in a 128×128 floating-point texture (RGBA16F),
displayed at full canvas resolution with bilinear upsampling + filmic tone
mapping.

## Audio mapping

- **Bass (sub-bass + bass bands)** → radial pressure pulse emanating from the center,
  injecting velocity and dye outward in a random direction. Creates the "heartbeat" feel.
- **Treble (high-mid + high bands)** → small turbulence splats at random positions,
  stirring fine detail into the flow.
- **Spectral centroid** → dye color: low pitch = indigo/blue, mid = green,
  high pitch = orange/red. A bass-heavy chord looks different from a bright piano arpeggio.
- **Onset (transient detector)** → large burst splat at a random position —
  the visual equivalent of a drum hit.

## Fallback / interaction

- No mic? **Ambient drift** mode runs an autonomous orbit pattern with smooth hue cycling.
- **Drag to stir**: pointer events inject velocity proportional to drag speed.
  Works on touch and mouse.

## Performance notes

128×128 sim resolution was chosen to hit 60fps on integrated GPUs (M1, Intel Iris).
Increase to 256×256 if you want more detail at the cost of ~4× more GPU work.
Each frame runs: 2 advections + 1 divergence + 25 pressure iters + 1 gradient subtract = 30 draw calls.

## Design debt / what to try next

- Curl-noise turbulence force (avoids pure random injection, looks more organic)
- Vorticity confinement (keeps swirls from dissipating too fast)
- Particle advection layer on top (100k points following the velocity field — very striking)
- MIDI CC mappings: knob 1 = turbulence, knob 2 = dye dissipation, knob 3 = pressure strength
