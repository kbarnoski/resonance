# 236 · Particle Life Song

## The one question

**What if music came FROM emergence — thousands of particles self-organizing
into living clusters, and each species you watch form has its own voice?**

This is a generative instrument whose score is written by self-organization
itself. Nothing is sequenced. The composition is literally the system finding
its own structure.

## How to use it

1. Press **Start** to unlock audio. The field is already simulating; the voices
   fade in.
2. Watch the swarm. As particles of one color condense into tight cells,
   membranes, or orbiting knots, that species' note **blooms** — louder and
   brighter. When a cluster disperses, its voice fades back.
3. Press **New world** to reseed the asymmetric attraction matrix. Each world
   has a different emergent regime — some calm, some chaotic, some forming
   beautiful cell-like life. Hunt for the ones that sing.
4. **Drag** across the field to stir the particles — a light touch that nudges
   the autonomous system without driving it.

The five species are mapped to a C-major pentatonic scale (C · D · E · G · A),
shown in the legend bottom-left.

## The technique

**Particle Life.** N particles belong to one of S color *species*. An
**asymmetric S×S attraction matrix** defines how strongly each species is
attracted to or repelled by every other (red may chase green while green flees
red). Each frame, for every particle, neighbors within a short interaction
radius exert a force: universal short-range repulsion plus a matrix-weighted
mid-range attraction (the classic CodeParade tent curve). Velocities integrate
with friction. From these trivial local rules, astonishing global life emerges:
cells, chasers, membranes, predator/prey chases, self-healing structures.

Here ~2,400 particles run on the CPU with a **spatial-hash grid** (toroidal
wrap) for O(N) neighbor search, rendered as additive-blended WebGL `THREE.Points`
through a custom shader — soft glowing dots, organic-emergent palette. The CPU
path is deliberate: it lets us compute an **exact per-species clustering metric**
(average count of same-species neighbors within the interaction radius) every
frame, cheaply.

### The sonic twist — sonifying self-organization

Each species owns one Web Audio voice: two slightly detuned oscillators
(triangle + sine) → lowpass filter → gain → a shared feedback-delay wash. The
per-species clustering metric is smoothed with an exponential moving average (so
it *breathes* rather than flickers) and mapped to that voice's **gain (squared,
so dispersed swarms go silent) and filter cutoff**. A tightly clumped species is
loud and bright; a scattered one is quiet and dark. The visual brightness of
each particle also tracks its species' level, so sight and sound move together.

So you are not hearing a soundtrack laid over a simulation — you are hearing the
emergence. Cross-modal sonification of a self-organizing system.

## Lineage / reference

Particle Life / "Clusters" — lineage: **Jeffrey Ventrella's _Clusters_**, and
**Tom Mohr / CodeParade's _Particle Life_**. This piece adapts that simulation
as an instrument: the asymmetric attraction-matrix particle-life model is the
novel core, and — within this lab — it is the first piece to **sonify cluster
self-organization**, giving each emergent species its own swelling voice.

## Tags

INPUT = none / autonomous (+ light touch) · OUTPUT = WebGL / three.js Points ·
TECHNIQUE = Particle-Life (asymmetric attraction matrix) · PALETTE =
organic-emergent
