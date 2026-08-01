# 4776 · Contour — the living topographic map

## The one question

If a mountain drained itself in front of you — rendered top-down as nothing but
contour lines — could you _hear_ the drainage network being born? Could its main
channel sing a slow marimba loop that starts sparse and searching and settles
into consonance as the river tree matures?

## What it is

A shared droplet hydraulic-erosion engine carves a seeded mountain in real time.
Thousands of water droplets pick up sediment on steep ground and drop it on flat
ground, cutting channels and building deltas over minutes. This face renders that
simulation as a **cartographic contour map** and sonifies its **strongest channel
— the spine**.

The landscape at minute 5 (a mature dendritic drainage net, calmer, with deeper
valleys) is materially different from second 0 (chaotic, undecided). It is
long-form and evolving.

## How to use it

- **It starts on its own.** The map begins eroding the moment it loads — silently,
  because of browser autoplay policy. The idea reads visually within about a
  second.
- **Start · rain with sound** — unlocks Web Audio (created on this gesture) and
  begins the spine melody. Press again to return to a silent demo. The simulation
  never stops.
- **Drag on the map** — "rain here." A soft brush concentrates rainfall under your
  finger, carving a starter valley that the droplet sim then elaborates into a
  channel. Watch the contours deform and the rivers reorganise around where you
  drew.
- **Reseed** — regenerates a fresh mountain from a new deterministic seed.
- **Phone bonus** — `deviceorientation` tilt tips the ambient drizzle in the
  direction you lean. Absent or denied, it degrades to nothing.

Give it a few minutes. Valleys deepen, contours pinch into V-shapes along the
cutting channels, and the flow field organises into a branching dendritic tree.

## The technique

1. **Hydraulic droplet erosion** (imported shared engine). Each frame mutates a
   96×96 heightfield and a decaying flow-accumulation field, and emits a bounded
   stream of carve/deposit events.
2. **Marching squares → contours.** Nine iso-elevation levels are traced over the
   live heightmap (redrawn every 4 frames for performance) as inline SVG
   polylines. As channels cut in, the lines literally crowd along ridges and
   spread across basins.
3. **Rivers.** The brightest cells of the flow field are drawn as glowing
   blue-violet threads, each segment pointing to its steepest-descent neighbour,
   with a blurred underlay for glow.
4. **The spine sings.** The strongest channel is walked from source to mouth and
   resampled to a 16-step loop; altitude maps to pitch (high land → high pitch) on
   a soft mallet/marimba voice. `drainageMaturity(field)` (0..1) moves the loop
   from sparse, detuned and searching (early, chaotic) toward a settled, consonant
   pentatonic with a low drone (mature net). Individual carve events add sparse,
   rate-limited accents. Voices are capped at ~6 simultaneous.

Everything is deterministic: only `mulberry32(...)` and `performance.now()` /
`AudioContext.currentTime` — no `Math.random`, `Date.now`, or `new Date`.

## Output constraints

Inline SVG only (no Canvas2D, no WebGL). Real Web Audio synthesis. Self-contained
in this folder; the only cross-prototype import is the shared erosion engine and
nav from `src/app/dream/_shared/`. Cleans up its rAF loop, AudioContext and
listeners on unmount.

## References

- **Musgrave, Kolb & Mace**, "The Synthesis and Rendering of Eroded Fractal
  Terrains," _SIGGRAPH 1989_ — the founding hydraulic-erosion-on-heightfield idea.
- **Mei, Decaudin & Hu**, "Fast Hydraulic Erosion Simulation and Visualization on
  GPU," _Pacific Graphics 2007_ — the shallow-water velocity-field formulation.
- **Beyer**, "Implementation of a method for hydraulic erosion," _BSc thesis
  2015_ — the droplet/particle method (later popularised by Sebastian Lague).
