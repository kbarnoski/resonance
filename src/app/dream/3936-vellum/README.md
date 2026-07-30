# 3936 · Vellum

*Your voice grows a living membrane that sings its own folds.*

## Concept

What if Resonance could turn a recording surface into **living tissue** — where the
geometry of its growth *is* the music? Vellum is a single luminous closed curve on
a Canvas2D field that grows by **differential growth**. Each node is pulled toward
its two curve-neighbours (keeping the filament smooth), pushed away from every
nearby node (short-range repulsion), and whenever the membrane is *fed* a new node
is **inserted** — so the curve lengthens, buckles, and folds into brain-coral /
cortical-fold morphology that never self-intersects and never erases. It is a
recording surface you cultivate rather than press *record* on: breathe into it and
it blooms; go quiet and it rests, breathing subtly.

## Named reference

The core algorithm is the **differential growth** / **"differential line"** system
of **Anders Hoff (inconvergent)** — see `inconvergent.net`. It's a classic of the
generative-art canon that has enjoyed a **recent generative-art revival** (widely
re-implemented across creative-coding communities as "differential growth" sketches).
Vellum keeps the algorithm faithful — neighbour attraction, all-pairs short-range
repulsion, length-driven node insertion — and drives its growth rate and location
from live audio.

## How the mapping works

- **Voice → growth (the nutrient field).** The microphone's RMS amplitude is a
  nutrient budget accumulated each frame: louder input inserts more nodes per frame
  (up to a per-frame ceiling), silence lets growth nearly halt so the membrane
  rests and breathes. No mic? A seeded synthetic nutrient LFO drives it so the
  piece is alive and audible on load, even headless.
- **Pitch → where it grows.** The vocal fundamental (spectral centroid off the
  analyser, log-mapped) biases an **angular sector** of the curve: high notes grow
  the top, low notes grow the bottom (von-Mises-weighted segment selection around
  the target angle). Different vocalisations sculpt different fold patterns.
- **Curvature → pitch.** Every growth event rings a soft continuous-pitch grain
  (filtered triangle): the node's **local curvature** sets the frequency — a tighter
  fold is a higher partial — and its **x-position** sets the stereo pan. Pitch is a
  continuous **log-frequency** mapping (~131 Hz up ~3.2 octaves); **never quantized**
  to a scale.
- **Length → drone.** Under the grains, a slow evolving drone pad tracks the curve's
  **total length**: as the membrane grows, its low-pass filter opens and the drone
  brightens. No drums — a meditative instrument, not a beat.

## Performance / robustness

Node count is capped (~1200) and neighbour-repulsion uses a per-frame spatial-hash
grid so it holds 60fps. Visuals run immediately on mount from the synthetic field;
audio resumes on the first user gesture (autoplay policy) or the Start button. The
AudioContext, rAF loop, and mic stream are all torn down on unmount. Graceful
notices cover mic-denied and missing-Canvas2D cases.

---

state: LSD/psilocybin organic entoptic bloom · pole: cosmic-ambient (organic)

tags: INPUT=mic · OUTPUT=Canvas2D-additive · TECHNIQUE=differential-growth · VIBE=organic/meditative
