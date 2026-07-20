# 2028 · Frost Lattice

## The one question

**What if you could _grow frost_** — nucleate a seed and watch a dendritic
crystal branch outward by diffusion-limited aggregation, where every particle
that freezes onto the lattice rings a crystalline tone, so the growing fractal
fern is literally its own evolving score?

## How the DLA works here

Diffusion-Limited Aggregation (Witten & Sander, 1981), on a square lattice:

- A crystal is a set of **frozen** cells stored in a `Map` keyed by lattice
  coordinate. That map _is_ the spatial hash — neighbour lookups are O(1).
- Up to 18 **random walkers** launch from a bounding circle just outside the
  current frost. Each frame they take `MICRO_STEPS` ticks: a light inward bias
  (~18% of steps head toward centre) speeds up encounters; the rest are random
  4-direction steps. Walkers that stray past a kill radius respawn.
- A walker **freezes** the instant one of its four neighbours is already part
  of the aggregate. The new particle records its **parent**, its **radius**
  from the nearest seed, and its **generation**.
- Because each particle knows its parent, its branch segment is appended to a
  **single accumulating `<path>`** as `M px py L x y`. One DOM node holds the
  entire crystal, however large it grows. The live walkers are ≤ 24 `<circle>`
  dots whose positions are mutated by ref (no per-frame React re-render).
- Growth is fully deterministic: a mulberry32 PRNG seeded from the constant
  `0x2028` drives every step, advanced off the animation clock. No
  `Math.random`, no `Date.now`. On mount / first **Begin**, a seed is dropped
  at centre and the fern grows with **zero input** — a headless reviewer sees
  frost and hears shimmer within a second.
- Growth is bounded: a hard particle cap (3000) and a field radius stop runaway
  growth; walkers that lose the aggregate respawn on the frontier. **Begin
  again** reseeds a fresh crystal.

## The crystalline tone model (inharmonic, non-JI)

Each freeze rings a short additive bell built from **glass-plate inharmonic
partials** — ratios `1, 2.76, 5.40, 8.93` (Chladni / struck-plate style).
These are deliberately **not** integer harmonics, **not** a just-intonation
partial stack, **not** pentatonic, and **not** 12-TET chords.

- The **fundamental** is chosen _continuously_ by the particle's radius from the
  seed (`196 Hz` at the core → `1568 Hz` at the field edge), so the crystal's
  outward expansion is an ascending shimmer. Higher notes ring shorter.
- Slight per-partial detune (±~7 cents) gives a glassy beating; fast
  exponential decay keeps each strike brief.
- A soft **ice-drone** (three low, mildly-inharmonic sines, `55 / 73.1 / 97.7
  Hz`) sits underneath, filtered by a slowly drifting lowpass.
- Throttling: an **8-voice pool** (oldest-stolen) plus a minimum onset spacing
  make dense growth wash rather than machine-gun. Master gain is `0.16` into a
  `DynamicsCompressor`. The `AudioContext` is created/resumed only after the
  Begin gesture and torn down on unmount.

## Interaction

- **Begin** — starts audio and grows the default centre-seeded crystal.
- **Tap / click the field** — drops a competing nucleation seed wherever you
  point; multiple seeds race as competing dendrites.
- **Begin again** — reseeds a fresh crystal.
- **Read the design notes** — this text, in a modal.

## Palette / pole

Pale ice-blue / frost-white on deep charcoal. Ice-blue appears only as art
colour inside the SVG; all UI chrome uses semantic tokens. Pole: crystalline /
meditative — a calm growth-and-stillness piece.

## Named references

- **T. A. Witten & L. M. Sander**, "Diffusion-Limited Aggregation, a Kinetic
  Critical Phenomenon" (1981) — the DLA / Brownian-tree model.
- **Chladni figures / glass-plate inharmonic partials** — the struck-plate
  ratio set used for the bells.
- **Wilson Bentley** — snowflake morphology; the visual reference for dendritic
  frost.

## Honest rough edges

- The on-lattice random walk gives a subtly grid-biased (crystalline) shape
  rather than perfectly isotropic frost — fitting for "lattice", but visible.
- Growth stops cleanly at the particle cap; there is no infinite long-form
  regrowth, so revisit via **Begin again**.
- One strike is rung per frame (the outermost freeze of that frame) so the
  shimmer stays musical; individual interior freezes are drawn but not each
  individually audible during very dense bursts.
