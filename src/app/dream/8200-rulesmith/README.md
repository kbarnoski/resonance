# 8200 · Rulesmith

## The one question

**What if the RULES of a particle-life world were a musical score you compose by
hand** — you sculpt the species-force matrix, hear the emergent clusters
re-voice under your fingers, save the worlds you love, and **breed** two of them
into offspring?

This is the *instrument* take on particle life: the interaction matrix is not a
dice roll, it is a **hand-authored, breedable score**.

## How to use it

Press **Begin** to start the sound (an AudioContext must be created inside a user
gesture). The field is already alive before you touch anything — a virtual
author keeps sculpting until you take over.

Keyboard verbs (primary input):

- **Arrow keys** — move the cursor across the 5×5 force matrix.
- **`[` / `]`** (or **`-` / `=`**) — decrease / increase the active cell's value
  by 0.1, clamped to [-1, 1]. The swarm re-organizes within a second.
- **`S`** — save the current matrix into the gene pool (up to 6 worlds).
- **`1`–`6`** — pick two saved worlds (click their swatches works too).
- **`B`** — breed the two picked worlds into an offspring and load it live.
- **`N`** — new random world, a fresh starting point to sculpt from.
- **Auto** button — hand control back to the virtual author.

The moment you press an authoring key, control passes from the virtual author to
you. Pointer convenience: drag a cell vertically to set its value.

Reading the matrix: **row = the species that feels the force, column = the
species it is felt toward.** Violet cells attract, red cells repel — the ramp is
the heatmap of the score.

## The technique

- **Particle Life** — ~2400 particles in 5 color species on a toroidal field,
  governed by an asymmetric 5×5 attraction matrix. The force curve is the
  classic tent: universal short-range repulsion inside an inner fraction, then
  matrix-weighted attraction out to the interaction radius (Jeffrey Ventrella,
  *Clusters*; CodeParade, *Particle Life*).
- **Spatial-hash grid** — neighbours are found in O(N) via a wrapping cell grid,
  so ~2400 particles integrate at 60 fps on a laptop (CPU sim).
- **Per-species clustering → voice + luminance** — each frame we measure each
  species' mean same-species neighbour count. As a species condenses, its
  pentatonic voice (C D E G A) blooms brighter and louder, and its particles
  glow — so the emergence is audible, and visible even on a muted phone.
- **Genetic crossover breeding** — saved rulesets are crossed per-cell (pick from
  parent A or B) with a few mutated cells, in the spirit of Richard Dawkins'
  *Biomorphs* and Karl Sims' *Evolved Virtual Creatures* — aesthetic selection
  applied to force fields. You keep the worlds you like and breed them.

## Subsystems

- `sim.ts` — Particle Life engine: buffers, spatial-hash grid, force
  integration, per-species clustering metric.
- `matrix.ts` — the score: PRNG (`mulberry32`), random-matrix generation,
  crossover + mutation breeder, diverging heatmap color, species palette/notes.
- `audio.ts` — Web Audio graph: 5 detuned pentatonic voices + a drone pad bed,
  a feedback-delay wash, and clustering-driven gain/filter bloom.
- `page.tsx` — three.js additive `Points` renderer with soft trails, the
  keyboard-first matrix editor and gene-pool UI, the virtual author (self-demo),
  and full teardown on unmount.

## Self-demo

Seeded with `mulberry32(0x8200)`. A virtual author autonomously nudges cells and
occasionally mutates or reseeds, so the world is continuously, visibly evolving
with zero input — the review reel shows a living, changing field even muted.

## Lineage

This deepens the loved **`236-particle-life-song`**, which only lets you reseed a
*random* matrix. Rulesmith makes the matrix **player-authored and breedable** —
the score is now yours to compose and evolve.
