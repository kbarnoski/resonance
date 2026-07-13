# 1608 · Orbital Consonance

_"The music of the spheres, made real."_ A few-body gravitational cosmos you
conduct with touch. When two orbiting masses fall into a small-integer **period
resonance**, that lock rings out as an exact **just-intonation** chord — you
literally hear a binary settle into a perfect fifth.

## The one question

> What if two stars falling into a 3:2 orbital resonance rang out an actual
> perfect fifth — so you could hear a system lock into consonance?

This take deliberately trades spectacle for a **crisp, legible, one-to-one
see-hear weld**: a small handful of bodies, a bright bond line + interval label
on every lock, and audio in which the moment of lock is unmistakable.

## How it works — three coupled subsystems

### 1. Gravity sim (`orbits.ts`)
A dominant central star is anchored at the origin; a handful of lighter
companions orbit it under **softened Newtonian gravity** (`r² + ε²`, so no
singularities). The companions also feel each other's much weaker pull, which
makes orbits **precess and drift** — resonant configurations genuinely form,
hold, and dissolve over minutes rather than looping. Integration is
**velocity-Verlet (leapfrog)** with fixed 1/120 s substeps. A soft outer spring
plus a hard velocity clamp keep a slingshot from flinging a body offscreen
forever.

### 2. Period-ratio resonance detector (`orbits.ts` → `detectLocks`)
Each body's **orbital period** is estimated every frame from its specific
orbital energy: vis-viva gives the semi-major axis `a`, and **Kepler's third
law** gives `T = 2π·√(a³/μ)`. For every pair we form `longerT / shorterT` and
test it against a table of small-integer targets — **2:1, 3:2, 4:3, 5:3, 5:4,
6:5**. Inside a relative tolerance (`LOCK_TOL ≈ 2.4%`) the pair is **locked**,
with a `strength` of `1` dead-on the target falling to `0` at the tolerance
edge.

### 3. Just-intonation audio engine (`audio.ts`)
Pitch is tied to **orbital frequency** (`pitch ∝ 1/period`), which is why a 3:2
period ratio maps to an exact 3:2 frequency ratio — a perfect fifth — with no
extra tuning machinery. Three always-on layers keep it from ever going silent:

- **Bed drone** — a low root + octave + twelfth from the central mass (the tonic
  sky).
- **Body voices** — one faint triangle+octave per body, pitched by its own
  orbital frequency. These are the "raw" sound of gravity; as two bodies near a
  resonance their voices drift toward a beat-free interval but still wobble.
- **Lock dyads** — the _events_. On lock we ring a sustained dyad snapped to the
  **exact** just ratio (`root` + `root·p/q`, plus a faint octave shimmer),
  blooming in level with lock strength and given a soft bell onset on the first
  frame. The audible resolution from wobble to purity **is** the moment of
  falling into consonance.

Everything sums through a `DynamicsCompressor` into a master gain capped at
**0.14** (< 0.16) before `destination`.

## Interaction (touch / pointer)

- **Drag a star → fling** it into a new orbit (the drag velocity becomes its
  velocity).
- **Tap empty space → drop** a new body (it enters near-circular so it orbits
  immediately).
- **Drop one star on another → merge** (momentum + mass conserved).
- Reset orbits · Mute · Stop.

A bright **resonance-bond line** and a `text-base` label ("3:2 · perfect fifth")
mark every active lock, a corner readout lists what is "Ringing now" with a
lock-percentage, and locked bodies brighten toward white with a gentle onset
pulse.

## Never blank / never silent

The seeded opening (deterministic `mulberry32`, hardcoded seed) is a
**Laplace-style 2:3:4 chain**: three companions whose period ratios are exactly
2 : 3 : 4, so pairs sit on **3:2, 4:3 and 2:1** from the very first frame. Press
Start and it rings a perfect fifth (and more) within seconds, unattended. A
fourth body orbits just off a 4:3 to supply drifting tension. Because all seed
velocities share one eccentricity factor, every period scales together and the
opening ratios are preserved exactly.

## Named references

- **Johannes Kepler, _Harmonices Mundi_ (1619)** — the literal "harmony of the
  world," where planetary motions sound as musical intervals; and the **third
  law** `T² ∝ a³`, used here to turn a measured orbit into a period.
- **The Laplace resonance** of Jupiter's moons **Io–Europa–Ganymede** — a real
  gravitational lock with period ratios **4 : 2 : 1** — is the model for the
  seeded chain.
- **Barnes & Hut, "A hierarchical O(N log N) force-calculation algorithm"
  (_Nature_ 324, 1986)** — the canonical N-body context. This piece is a tiny
  direct-summation few-body sim (N is small enough that the tree is
  unnecessary), but the lineage is named.
- **Just intonation** — intervals as exact integer frequency ratios: 2:1
  (octave), 3:2 (perfect fifth), 4:3 (perfect fourth), 5:4 (major third), 5:3
  (major sixth), 6:5 (minor third).

## Ambition-floor self-assessment (honest)

- **Novel technique?** _Narrow but real._ N-body toys and just-intonation synths
  each have deep prior art. The fresh part is the tight weld: **measured
  orbital-period ratios driving live JI locks**, with the raw body voices
  audibly resolving into a pure snapped dyad at the moment of lock.
- **≥3 subsystems?** Yes — Verlet gravity sim · period-ratio resonance detector
  · JI audio engine, all coupled each frame.
- **Named reference?** Yes — Kepler 1619 + third law, the Io–Europa–Ganymede
  Laplace resonance, Barnes & Hut 1986, just-intonation ratios.
- **Multi-cycle / evolving?** Yes — mutual perturbations precess the orbits so
  lock configurations change over minutes; it is not a loop.
- **Recent research?** No modern paper is central; the physics is classical and
  the framing (Kepler, Laplace) is historical by design.

## Constraints honored

`"use client"` App-Router page · self-contained (no route/network/server) ·
three.js/WebGL render surface (Canvas2D used only to _bake_ a glow texture) ·
deterministic (seeded `mulberry32` only; no nondeterministic RNG or wall-clock
APIs; time from `performance.now()`) · master gain ≤ 0.16 through a compressor · no
strobe (single smooth onset pulse, well under 3 Hz) · respects
`prefers-reduced-motion` · full teardown on unmount (cancel rAF, close audio,
dispose three.js resources, remove listeners) · off-violet warm palette
(navy/obsidian field, gold/amber/white stars).
