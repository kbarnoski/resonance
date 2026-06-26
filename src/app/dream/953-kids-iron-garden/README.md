**For**: kids (4+)

# Iron Garden

> What if a 4-year-old could SEE and PLAY the invisible magnetic field — drag
> glowing magnet-flowers around a dark garden, watch thousands of iron filings
> snap into the lines of force between them, and hear the magnets sing a chord
> the moment their field lines connect?

A calm, touch-first toy. Six glowing flowers float on a deep-indigo field. Drag
them with one or two fingers; the dark space between them fills with thousands of
tiny iron filings that bend into glowing arcs — the real shape of the magnetic
field. Slide two flowers together and the arcs bridge across the gap while the two
notes bloom into a chord. No reading required: colour, motion and sound carry
everything.

## How it works

### The field (Faraday's lines of force)

Each flower is a 2-D magnetic **dipole**: a `+` pole and a `−` pole offset a short
distance along the flower's axis. At every iron-filing position `P` we sum the
contribution of every pole `k`:

```
B(P) = Σ_k  q_k · (P − pole_k) / |P − pole_k|³        q = +1 (N) / −1 (S)
```

This is the standard inverse-square monopole superposition that, for a pair of
opposite poles, produces the familiar dipole loops. A small softening term in the
denominator keeps the field finite right at a pole so filings never blow up.

### Filing alignment + the lines of force

Each frame, for every filing we:

1. compute `B(P)` and take its **direction**;
2. ease the filing's stored orientation toward that direction (so streaks don't
   jitter), and draw it as a short streak **along** the field — exactly like an
   iron filing lying down on the field's tangent;
3. nudge the filing a little way **along** the field. Over successive frames the
   filings drift and pile up where the field channels them, so they self-organise
   into visible **chains** — Faraday's *lines of force*. Filings that wander
   off-screen, sit in a dead zone, or get stale are respawned so the field always
   looks alive.

Each filing is coloured by its **nearest flower's hue**, so the lines glow with
the colours of the magnets they connect.

### Emergent harmony (the magic)

Every flower is tuned to one note of a **C pentatonic** scale (C3 E3 G3 A3 C4 E4)
so there are no wrong notes. When two flowers come close enough for their fields
to bridge, a glowing ribbon is drawn between them (over real filings that trace
the connecting arc) and their two notes **ring together** as a soft sustained
chord. Loudness ramps with **proximity²**, so as a child slides two flowers
together the chord *blooms* in. Grabbing and moving a single flower hums just its
own note, with the hum scaling to how fast it is moving.

A very quiet ambient pad (root + fifth, slowly detuning) plays in-key so a cold
load is never silent, and the whole mix runs through a compressor/limiter so it
can never get harsh — kid-safe by construction.

### Always alive

If untouched for ~4 seconds the flowers glide along smooth, bounded noise paths,
drifting together and apart on their own — the garden self-demos on cold load with
no instructions needed.

## Named reference

**Michael Faraday's "lines of force"** and the classic primary-school
demonstration of iron filings sprinkled on paper over a magnet. Here the paper is
the screen, the filings are ~4,200 particles, and the magnet moves under your
finger.

## How this differs from `192-kids-magnet-notes`

`192-kids-magnet-notes` is **point-attraction between orbs**: a handful of balls
that pull together and ping a note when they touch. Iron Garden renders the
**field itself** — thousands of filings tracing the actual dipole lines of force
across the whole canvas — and the harmony emerges from fields *bridging*, not from
balls colliding. Different physics, different feel.

## Tags

- **Input:** multi-touch drag (Pointer Events — two fingers drag two flowers)
- **Output:** Canvas2D (hand-rolled, no three.js / WebGL / WebGPU)
- **Core technique:** magnetic-dipole field + iron-filing alignment to the lines
  of force, with emergent harmony (two magnets ring when their field lines bridge)
- **Vibe:** science-wonder · tactile · calm

## Known limitations

- The "bridge" that triggers the chord is detected by **magnet-to-magnet
  proximity**, which is a robust, cheap proxy. The visible filings genuinely trace
  the connecting field line, but the audio doesn't literally integrate a field
  line between the poles.
- Filing count is **capped (~4,200)** and the streak draw is batched per hue to
  hold ~60fps; on low-end devices the field will look a little sparser but still
  reads as lines of force.
- The dipole axis slowly auto-rotates for visual life; this is artistic licence,
  not a physical torque model.
- Field math is 2-D and uses a monopole-superposition approximation of a dipole;
  it is faithful to the *shape* of real field lines but is not a quantitative
  simulation.
- Built and reviewed without a local `node_modules` install in this environment,
  so the production `eslint`/`tsc`/`next build` were not executed here; the code
  was written to the project's strict-TS + `next/typescript` lint rules
  (no `any`, no unused vars, no `use`-prefixed helpers, cleaned-up effects).

## Run

It's a Next.js App Router client page. Visit `/dream/953-kids-iron-garden`, tap
**“tap to begin”** to satisfy the browser autoplay policy, then drag the flowers.
