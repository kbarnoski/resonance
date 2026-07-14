# 1622 · Tidal Canon

**The one question:** What if a few massive "conductor" bodies orbiting under
real gravity sculpted a swarm of thousands of tiny stars — so you hear BOTH the
discrete moment two conductors lock into orbital resonance (a pure
just-intonation dyad) AND the aggregate wash of the swarm being tidally stretched
around them?

This is the large-N **hybrid** sibling of a shipped few-body resonance piece. It
welds a discrete, causal resonance *event* (two bodies falling into a
small-integer period ratio ring the matching interval) to a large-N aggregate
*wash* (a test-particle swarm dragged by the conductors' field).

## How it works

### Physics (`sim.ts`)

- **Foreground — 3 conductor bodies + a dominant central mass**, integrated with
  real mutual Newtonian gravity via **velocity-Verlet** with gravitational
  softening. They are seeded near-circular on a **Laplace-style commensurable
  configuration**: target periods 2 : 3 : 4, so conductor *pairs* sit at exact
  ratios **3:2 (perfect fifth), 4:3 (perfect fourth), 2:1 (octave)** from the
  first frame. Net momentum is zeroed so the barycentre stays put. Each frame we
  measure every conductor's instantaneous **Keplerian period** from its specific
  orbital energy (`a = -GM/2E`, `T = 2π√(a³/GM)`) — robust to the eccentricity a
  fling introduces. When a pair's period ratio sits within tolerance of a
  small-integer ratio (2:1, 3:2, 4:3, 5:3) we flag a **resonance lock** with a
  strength ∝ how exact it is.
- **Background — ~9,000 massless test particles** seeded as a broad rotating
  disk + halo. They feel the conductors' (and any dropped well's) gravity but
  **never act back** — strict **one-way coupling**. This is what makes large-N
  cheap and unconditionally stable: cost is O(n · conductors), and the swarm can
  shear, stream and grow tidal tails but can never blow up the foreground.
  Escapees past the world edge are recycled into the disk so the cloud stays
  alive and continuously streaming.

### Audio (`audio.ts`) — the two-layer weld

- **Discrete layer (the headline).** Each conductor has a faint raw voice pitched
  by its *instantaneous* orbital frequency (freq ∝ 1/period). Because pitch is
  tied to orbital frequency, the *period* ratio literally **is** the *frequency*
  ratio — a real interval, not a metaphor. On their own the raw voices wobble as
  the orbits perturb one another; the instant a pair locks, we ring the **exact
  just-intonation dyad** (root + root·p/q) as a clean bell pair, snapped pure and
  beat-free, with an on-screen label naming it ("3:2 · perfect fifth"). You hear
  the wobble resolve into the pure dyad.
- **Aggregate layer (the wash).** A low JI pad (root + fifth + octave, A1) whose
  low-pass brightness, level and a high "shear shimmer" all track the swarm's
  **dispersion**: a tightly-bound swarm → a calm warm bed; a violently sheared
  one → a brighter, restless wash. A ~0.05 Hz breathing LFO evolves it over
  minutes.
- **Safety:** master ceiling **0.14** (< 0.16) → `DynamicsCompressor` →
  destination. Gains ramped, lock polyphony capped at 4 (steal oldest).

### Render (`page.tsx`)

three.js `Points` + `ShaderMaterial` with a **procedural radial glow** in the
fragment shader (no texture sprites, no Canvas2D surface). Swarm colour ramps
off-violet → gold with speed, so tidal shear literally heats up; conductors are
brighter cores over an additive off-violet deep-space field. Orthographic camera
fit to the world box. If WebGL is unavailable we show an on-brand
`text-destructive` notice and keep the physics + audio running. Honors
`prefers-reduced-motion` (slower evolution, gentler luminance drift ≤ 3 Hz). Full
teardown on Stop/unmount: cancel rAF, stop + close the AudioContext, dispose all
three.js objects.

### Interaction

- **Drag** — fling the nearest conductor (adds energy → it runs off-lock → beats
  against its neighbours → re-settles).
- **Tap** — drop a transient gravity well the swarm streams toward (a fresh tidal
  tail).

The seeded resonant configuration rings a lock (a fifth / fourth / octave) within
seconds of Start with the swarm already streaming — zero input required.

## Determinism

No `Math.random` / `Date.now` / `new Date`. All stochastic seeding uses a fixed
`mulberry32(0x1622ca)`; `performance.now()` is used only for animation timing.

## Named references

- **Kepler, *Harmonices Mundi* (1619)** — the "harmony of the spheres" made
  literal, and the **third law** (T² ∝ a³) we invert to read a period from an
  orbit.
- **Laplace resonance** — the Io–Europa–Ganymede **4:2:1** mean-motion lock; our
  conductors are seeded on the same commensurable idea.
- **Barnes & Hut (1986)** — the canonical hierarchical N-body method; we take the
  cheaper one-way route (conductors → swarm only), which is the pragmatic
  large-N shortcut when the background is massless.
- **Just intonation** — small-integer frequency ratios (2:1, 3:2, 4:3, 5:3) as
  the pure consonances the locks ring.
- **Tidal-tail galaxy dynamics** (Toomre & Toomre-style interactions) — the
  sheared streams the conductors pull out of the swarm.

## Cycle-2 deepening

- Give the swarm a **spectral voice per region**: bin particles by angular
  sector and drive a granular/formant bank from each sector's density and shear,
  so tidal tails become audible filaments rather than one aggregate pad.
- Add a **third body class** — a captured moonlet that can be resonantly
  shepherded, letting the player *build* a Laplace chain by hand and hear a full
  JI chord assemble.
- Swap the one-way coupling for a **Barnes–Hut tree** so the swarm's self-gravity
  can seed real spiral density waves (with a strict energy budget to stay safe).
