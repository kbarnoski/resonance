# 3080 · Mycelium

## The one question
**What if a psychedelic altered-state field GREW like living mycelium — your hand
plants spores and the network filaments outward on its own, branching, fusing,
and never erasing itself, so over minutes it accretes a persistent luminous web
that is a visible record of everything you seeded, and touching a living strand
rings its voice?**

A played instrument, not a simulation you watch: pointer/touch is the primary
input, and what you plant now is still there — faintly — minutes later.

## How the growth works (space colonization)
The network is grown with the **Space Colonization Algorithm** (Runions, Lane &
Prusinkiewicz, *Modeling Trees with a Space Colonization Algorithm*, Eurographics
Workshop on Natural Phenomena, 2007). Each frame, in `growth.ts`:

1. **Attraction.** Every live *nutrient* point (attractor) finds the nearest
   growth tip within an attraction radius and casts a unit pull vector onto it.
2. **Growth.** Each pulled tip steps one segment length toward the *average* of
   its pull vectors (plus a little seeded jitter). Because a tip can be pulled in
   divergent directions, **branch points emerge naturally** — no branching rule
   is hard-coded.
3. **Anastomosis (fusion).** If a new tip lands within a fuse radius of a
   *foreign* strand, it snaps onto it and stops — closing a loop. This is the
   fungal-network behaviour Fricker et al. describe (transport webs are graphs,
   not trees), and it is what makes the field read as living tissue.
4. **Consumption.** Attractors within a kill radius of any tip are removed, so
   growth flows through the nutrient and keeps reaching new ground.

A small per-frame growth *budget* (scaled by "vigour") paces it so it grows for
many minutes without stalling or overrunning the frame.

## How the hand plants + plucks
All input is pointer/touch on the canvas (`page.tsx`):

- **Tap (empty space) = plant a spore + scatter nutrient.** A new growth root is
  seeded and a burst of attractors is sprinkled around it — you direct where the
  organism reaches.
- **Drag = paint a nutrient trail.** Attractors are scattered along the drag path
  (throttled), steering the growing edge; strands the drag crosses ring softly.
- **Tap on/near a living strand = pluck it.** The nearest node is found and its
  voice is rung, with an expanding bloom at the touch point. You *play the web
  you grew.* A little nutrient is also fed there so the web reaches back toward
  your finger.

If there is no input, a **seeded autopilot gardener** plants, feeds, and
occasionally plucks on its own (deterministic `mulberry32(0x3080)`), so the piece
is fully alive and demoable headless. A real hand suppresses the gardener for a
few seconds, then it quietly resumes — pointer input overrides and augments it.

## Audio mapping (`audio.ts`)
A garden of **continuous-pitch** sympathetic voices — pitch is always a smooth
function of geometry, **never** quantised to a scale.

- **Plant a spore →** a soft, slow low voice fades up and away; pitch from the
  spore's vertical position (lower on screen = deeper).
- **Branch / fusion →** a brief bright shimmer partial, panned by x.
- **Pluck a strand →** fast attack, long sympathetic decay (triangle + a
  non-integer overtone through a closing lowpass), pitch from the strand's
  cumulative length and height.
- **Web extent →** the total grown length opens the *drive* of the shared
  just-intonation drone bed (`_shared/psych/droneBank`) sitting in a convolution
  void (`_shared/psych/convolutionVoid`).

Everything sums into a master gain ≤ 0.15 → `tanh` soft-clip → limiter →
destination. AudioContext is created/resumed only after Start.

## Rendering
Canvas2D, DPR-aware, drawn in the brand violet→magenta ramp with additive
`globalCompositeOperation = "lighter"`. Two layers: an offscreen *glow* buffer
holds a gently-fading long-exposure trail of tip and pluck activity; the
**structural web is redrawn every frame from the node list**, so its geometry is
permanent memory — old strands only dim to a luminance floor, they are never
erased (the accreting palimpsest). Segments are bucketed into a few `Path2D`
strokes by hue/brightness band so it stays smooth at phone size. Flicker is
avoided (slow luminance drift only; peak brightness kept below pure white).

## Memory / long-form
The node array only grows (capped for perf), never resets. A live readout shows
elapsed time and **strands / branch-points / total length**, so even a short
review reads the accretion: minute 8 is visibly and audibly not second 0.

## References
- Adam Runions, Brendan Lane, Przemyslaw Prusinkiewicz, *Modeling Trees with a
  Space Colonization Algorithm* (Eurographics Workshop on Natural Phenomena,
  2007).
- Fungal-network / anastomosis literature on network transport (e.g. Fricker et
  al. on fungal networks).
- Heinrich Klüver, form constants (the cobweb form-constant) — the radial web
  aesthetic.
- *Neural Cellular Automata: From Cells to Pixels* (arXiv:2506.22899, SIGGRAPH
  2026) — the current morphogenesis-in-graphics context.

## What surprised me / what's hard / next
Fusion is the whole thing: as soon as tips start closing loops onto foreign
strands, the network stops reading as a fractal tree and starts reading as
living tissue — an emergent, unplanned surprise from one distance check. The
hard part was pacing across minutes without the frame time exploding as the node
count climbs; the fix was a per-frame growth budget plus bucketed `Path2D`
redraws instead of thousands of individual strokes. Next: send nutrient-flow
pulses traveling around the fused loops, lighting each strand they pass through,
so the web visibly *transports* the way a real mycelial network does.
