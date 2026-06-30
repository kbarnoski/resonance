# 1065 — Skin Membrane

> "What if you could press, pull, and TEAR a living skin of sound with your hands — a membrane whose physical tension IS the pitch?"
>
> `state: salvia / DMT membrane-reality · pole: intense`

An **instrument**, not a screensaver. Idle, the skin only breathes — a faint,
alive-but-quiet drumhead. It sings when you push into it: drag to press and pull,
flick to send a traveling wave, overstretch a region to **tear** it open.

The coupling is the whole piece: the membrane's physical **tension** (mean spring
stretch) drives the synthesis **pitch**. Bend the skin and the tone audibly glides.

## How it works

### `membrane.ts` — mass-spring drumhead solver

- **52×52** grid of point masses. Each mass carries a transverse displacement
  `z` and velocity `vz`; the simulation is the standard cheap drumhead model
  (1-D-per-node transverse motion, coupled through springs). I kept the full
  52×52 (the brief's target) — the transverse-only force model is light enough
  that 52×52 × 2 substeps holds 60fps on a mid-range laptop. If a device
  struggles, drop `GRID` to 44 (one constant) for headroom.
- **Three spring families:** structural (4-neighbour), shear (diagonal), bend
  (2-away). The boundary masses are **pinned** (fixed drumhead rim).
- **Symplectic (semi-implicit) Euler**, **2 substeps/frame**, with per-substep
  velocity damping.
- **Per-spring strain tracking.** A spring whose fractional strain exceeds
  `TEAR_STRAIN` **snaps** (removed → visible/audible rupture). Total tears are
  capped (`MAX_TEARS`) so the skin can't fully disintegrate from one poke.
- **Autonomous breathing field:** two slow incommensurate sines force low spatial
  modes (a dome + a slosh) at very low amplitude, so idle is alive.
- **Pointer:** a soft radial brush (smooth `fall²` falloff) presses/pulls masses
  under the cursor with a progressively ramping press depth; release velocity
  (**flick momentum**) stamps a directional dipole → a traveling wave.
- **Aggregate stats per frame** for audio: mean spring stretch (**tension**),
  instantaneous **excitation** energy (pokes + tears), and a **brightness** proxy
  (high-frequency motion + recent tears).

#### Numerical stability

The piece must run and sound correct on any device with zero permissions, so the
solver is defensive: `dt` is clamped (a backgrounded tab can't deliver a huge
step), velocities and displacements are hard-clamped, and any non-finite value
resets that node to rest. Mentally simulating 600+ frames of hard dragging: the
transverse force model has no division by an instantaneous length (unlike planar
distance springs), tears bleed off stored energy, and damping + clamps bound the
state — so it neither explodes nor goes NaN.

### `audio.ts` — physical modal synthesis

- **8 bandpass resonators** tuned to a circular membrane's Bessel-zero modal
  ratios `1.000, 1.593, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501` × a
  fundamental (inharmonic — the true drumhead character).
- **Tension → fundamental** via `setTargetAtTime` portamento, so bending the
  skin **glides** the pitch. The target is gently quantized to a major-pentatonic
  just scale (optional in the brief; it noticeably improves musicality), kept in
  ~70–520 Hz.
- **Master lowpass opens** with the brightness proxy.
- **Pluck/tear → short noise-burst** excitation injected into the resonator bank.
- **Continuous low-level filtered noise** keeps the modes singing, so steady
  tension is audible in the sustained tone, not only on strikes.
- **Feedback-delay reverb** for body, and a master **`DynamicsCompressor`**
  limiter so it can never clip painfully.
- **Gesture-gated:** silent until "Awaken the skin"; full node disconnect +
  context close on stop/unmount.

### `render.ts` — Canvas2D mesh

- Wire lattice shaded by local **areal strain**: slack → deep **indigo**, taut →
  iridescent **magenta → gold**. Drawn with `globalCompositeOperation = "lighter"`
  so tension lines **glow** additively.
- **Hot rupture rims** drawn as near-white hot filaments where springs tore.
- The **pinned boundary frame** is drawn as a faint ring.
- Per-frame semi-transparent indigo **wash** (never pure black) for breathing
  trails; a tension-pulsing radial vignette gives it the feel of a breathing
  organ of light. A gentle pseudo-3D tilt maps `z` to screen depth.

## Graceful degradation

This is Canvas2D, so the visual always runs. If Canvas2D itself is unavailable, a
`text-rose-300` notice appears. If `AudioContext` fails to start, the skin keeps
breathing silently and a rose notice invites a retry.

## References

- **Thomas Jakobsen, _Advanced Character Physics_ (Verlet / position-based
  dynamics, GDC 2001).** The lineage for a relaxation grid of point masses with
  distance constraints and **breaking constraints under strain**. This solver
  uses a force/velocity (symplectic Euler) formulation rather than pure Verlet
  projection, but borrows Jakobsen's core ideas: a mass-point lattice, spring
  constraints, and snapping them when overstretched.
- **Circular-membrane modal synthesis / Bessel-zero modal ratios** — physical
  modeling of a drumhead. The resonator bank's frequency ratios are the ratios of
  the zeros of the Bessel functions Jₘ that solve the ideal circular membrane's
  wave equation, giving the characteristic inharmonic drum timbre.
